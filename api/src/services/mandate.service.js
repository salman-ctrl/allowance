// Path: api/src/services/mandate.service.js
// Plain-English rules -> policy (Gemini) -> validated -> user confirms -> signed and stored.
// The user always reviews the policy before it is signed: AI drafts, the human decides.

import { CATEGORIES, POLICY_VERSION, parsePolicy } from '../schemas/policy.schema.js';
import { signMandate, verifyMandate } from '../lib/hmac.js';
import { logEvent } from './audit.service.js';
import { LlmUnavailableError } from '../lib/gemini.js';

// Kept simple on purpose: Gemini supports a subset of JSON Schema.
// The real validation is parsePolicy(); this only steers the model.
export const POLICY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    budget: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string', enum: ['USD'] },
        period: { type: 'string', enum: ['weekly', 'monthly'] },
      },
      required: ['amount', 'currency', 'period'],
    },
    auto_approve_limit: { type: 'number' },
    allowed_categories: { type: 'array', items: { type: 'string', enum: CATEGORIES } },
    blocked_categories: { type: 'array', items: { type: 'string', enum: CATEGORIES } },
    allowed_merchants: { type: 'array', items: { type: 'string' } },
    require_intent_match: { type: 'boolean' },
  },
  required: ['budget', 'auto_approve_limit', 'allowed_categories', 'blocked_categories'],
};

export const SYSTEM_PROMPT = `You turn a person's plain-English spending rules for their AI shopping agent into a JSON policy.

Rules:
- All amounts are in USD with at most 2 decimals.
- budget.period is "monthly" unless the person clearly says weekly.
- auto_approve_limit is the largest purchase the agent may pay without asking. "Ask me above $50" means 50. If the person never mentions it, use 0 so every purchase needs approval.
- auto_approve_limit can never be higher than budget.amount.
- Only use these categories: ${CATEGORIES.join(', ')}.
- allowed_categories: only what the person allows. Never add categories they did not mention.
- blocked_categories: always include "gift_cards" and "crypto" unless the person explicitly allows them, plus anything they forbid. A category is never both allowed and blocked.
- allowed_merchants: only if the person names specific stores, otherwise [].
- require_intent_match: always true.
- Never invent extra fields. Output JSON only.`;

const MAX_ATTEMPTS = 2;

// Gemini sometimes wraps JSON in ```json fences or adds text around it
export function extractJson(text) {
  const cleaned = String(text ?? '').replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object found');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Gemini may send null for optional fields; the schema wants them absent instead
const dropNulls = (obj) =>
  Object.fromEntries(Object.entries(obj ?? {}).filter(([, v]) => v !== null && v !== undefined));

const money = (n) => `$${Number(n).toFixed(2)}`;
const words = (list) => list.map((c) => c.replace(/_/g, ' ')).join(', ');

// Human-readable version of a policy, shown in the UI before the user signs
export function summarizePolicy(p) {
  const parts = [
    `Up to ${money(p.budget.amount)} per ${p.budget.period === 'weekly' ? 'week' : 'month'} on ${words(p.allowed_categories)}.`,
    p.auto_approve_limit > 0
      ? `Purchases up to ${money(p.auto_approve_limit)} are paid automatically; anything above waits for your approval.`
      : 'Every purchase waits for your approval.',
  ];
  if (p.blocked_categories.length) parts.push(`Never: ${words(p.blocked_categories)}.`);
  if (p.allowed_merchants.length) parts.push(`Only from: ${p.allowed_merchants.join(', ')}.`);
  return parts.join(' ');
}

// Step 1: ask Gemini for a draft. Nothing is saved here.
export async function draftPolicy(naturalText, { llm }) {
  const text = String(naturalText ?? '').trim();
  if (text.length < 10 || text.length > 1000) {
    return { ok: false, errors: ['Describe your rules in 10 to 1000 characters'] };
  }

  const basePrompt = `The person's rules:\n"""\n${text}\n"""`;
  let prompt = basePrompt;
  let errors = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // A busy Gemini is not a bad answer: report it, do not re-prompt
    let answer;
    try {
      answer = await llm({ system: SYSTEM_PROMPT, prompt, jsonSchema: POLICY_JSON_SCHEMA });
    } catch (err) {
      if (err instanceof LlmUnavailableError) {
        return { ok: false, unavailable: true, errors: ['The AI is busy right now. Please try again in a moment.'] };
      }
      throw err;
    }

    let raw;
    try {
      raw = extractJson(answer);
    } catch (err) {
      errors = [`AI did not return valid JSON (${err.message})`];
      prompt = `${basePrompt}\n\nYour previous answer was not valid JSON. Return only the JSON object.`;
      continue;
    }

    const parsed = parsePolicy({ ...dropNulls(raw), version: POLICY_VERSION });
    if (parsed.ok) return { ok: true, policy: parsed.policy, summary: summarizePolicy(parsed.policy) };

    errors = parsed.errors;
    prompt = `${basePrompt}\n\nYour previous JSON was rejected:\n- ${errors.join('\n- ')}\nReturn a corrected JSON object only.`;
  }

  return { ok: false, errors };
}

// Step 2: the user confirmed the draft. Validate again (never trust the client), sign, store.
// Creating a new mandate revokes the previous active one, so there is only ever one.
export async function createMandate({ userId, naturalText, policy }, { db, secret }) {
  const parsed = parsePolicy(policy);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const p = parsed.policy;
  const signature = signMandate({ userId, policy: p }, secret);
  const summary = summarizePolicy(p);

  const mandate = await db.$transaction(async (tx) => {
    await tx.intentMandate.updateMany({ where: { userId, status: 'ACTIVE' }, data: { status: 'REVOKED' } });
    const created = await tx.intentMandate.create({
      data: {
        userId,
        naturalText: String(naturalText ?? '').trim(),
        policyJson: p,
        signature,
        period: p.budget.period,
        budgetUsd: p.budget.amount,
        autoApproveLimitUsd: p.auto_approve_limit,
        status: 'ACTIVE',
      },
    });
    await logEvent(tx, { entity: 'mandate', entityId: created.id, event: 'mandate.created', detail: { summary } });
    return created;
  });

  return { ok: true, mandate: { id: mandate.id, status: mandate.status, policy: p, summary, signature } };
}

// Loads the user's active mandate and checks its signature against what is stored
export async function getActiveMandate(userId, { db, secret }) {
  const row = await db.intentMandate.findFirst({
    where: { userId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;

  const parsed = parsePolicy(row.policyJson);
  const signatureValid = parsed.ok && verifyMandate({ userId, policy: parsed.policy }, row.signature, secret);

  return {
    mandate: {
      id: row.id,
      status: row.status,
      expiresAt: row.expiresAt,
      naturalText: row.naturalText,
      policy: parsed.ok ? parsed.policy : row.policyJson,
      summary: parsed.ok ? summarizePolicy(parsed.policy) : null,
      createdAt: row.createdAt,
    },
    signatureValid,
  };
}