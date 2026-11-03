// Path: api/tests/mandate.service.test.js
// Gemini and the database are replaced with fakes: fast, free, and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMandate,
  draftPolicy,
  extractJson,
  getActiveMandate,
  summarizePolicy,
} from '../src/services/mandate.service.js';
import { verifyMandate } from '../src/lib/hmac.js';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const RULES = 'Office supplies and computer accessories only, max $200 a month, ask me above $50';

const goodAiPolicy = {
  budget: { amount: 200, currency: 'USD', period: 'monthly' },
  auto_approve_limit: 50,
  allowed_categories: ['office_supplies', 'computer_accessories'],
  blocked_categories: ['gift_cards', 'crypto'],
  allowed_merchants: null,
  require_intent_match: true,
};

// A fake Gemini that returns the given answers in order and records the prompts
function fakeLlm(...answers) {
  const calls = [];
  const llm = async (args) => {
    calls.push(args);
    const next = answers[Math.min(calls.length - 1, answers.length - 1)];
    return typeof next === 'string' ? next : JSON.stringify(next);
  };
  return { llm, calls };
}

// A fake Prisma client that keeps mandates and audit rows in memory
function fakeDb() {
  const state = { mandates: [], audit: [] };
  const db = {
    state,
    intentMandate: {
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const m of state.mandates) {
          if (m.userId === where.userId && m.status === where.status) Object.assign(m, data), count++;
        }
        return { count };
      },
      create: async ({ data }) => {
        const row = { id: `m${state.mandates.length + 1}`, expiresAt: null, createdAt: new Date(), ...data };
        state.mandates.push(row);
        return row;
      },
      findFirst: async ({ where }) =>
        state.mandates.filter((m) => m.userId === where.userId && m.status === where.status).at(-1) ?? null,
    },
    auditLog: { create: async ({ data }) => (state.audit.push(data), data) },
    $transaction: async (fn) => fn(db),
  };
  return db;
}

// ---- draftPolicy ----

test('draft: valid AI output becomes a policy with a readable summary', async () => {
  const { llm } = fakeLlm(goodAiPolicy);
  const r = await draftPolicy(RULES, { llm });
  assert.equal(r.ok, true);
  assert.equal(r.policy.version, 'allowance-1');
  assert.deepEqual(r.policy.allowed_merchants, []);
  assert.match(r.summary, /Up to \$200\.00 per month/);
  assert.match(r.summary, /up to \$50\.00 are paid automatically/);
});

test('draft: rejected JSON is sent back to the AI with the errors, then fixed', async () => {
  const bad = { ...goodAiPolicy, auto_approve_limit: 500 };
  const { llm, calls } = fakeLlm(bad, goodAiPolicy);
  const r = await draftPolicy(RULES, { llm });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 2);
  assert.match(calls[1].prompt, /auto_approve_limit cannot be higher than the budget/);
});

test('draft: gives up after 2 bad answers and returns the errors', async () => {
  const { llm, calls } = fakeLlm('not json at all');
  const r = await draftPolicy(RULES, { llm });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 2);
  assert.match(r.errors[0], /valid JSON/);
});

test('draft: JSON wrapped in code fences is still read', async () => {
  const { llm } = fakeLlm('```json\n' + JSON.stringify(goodAiPolicy) + '\n```');
  assert.equal((await draftPolicy(RULES, { llm })).ok, true);
});

test('draft: too short input never reaches the AI', async () => {
  const { llm, calls } = fakeLlm(goodAiPolicy);
  const r = await draftPolicy('hi', { llm });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});

test('extractJson handles text around the object', () => {
  assert.deepEqual(extractJson('Sure! {"a":1} hope this helps'), { a: 1 });
  assert.throws(() => extractJson('no braces here'));
});

test('summary says every purchase needs approval when the limit is 0', () => {
  const s = summarizePolicy({ ...goodAiPolicy, auto_approve_limit: 0, allowed_merchants: [] });
  assert.match(s, /Every purchase waits for your approval/);
});

// ---- createMandate and getActiveMandate ----

test('create: signs, stores, logs an audit event, and the signature verifies', async () => {
  const { policy } = await draftPolicy(RULES, fakeLlm(goodAiPolicy));
  const db = fakeDb();
  const r = await createMandate({ userId: 'u1', naturalText: RULES, policy }, { db, secret: SECRET });

  assert.equal(r.ok, true);
  const row = db.state.mandates[0];
  assert.equal(row.status, 'ACTIVE');
  assert.equal(row.budgetUsd, 200);
  assert.equal(row.autoApproveLimitUsd, 50);
  assert.equal(verifyMandate({ userId: 'u1', policy: row.policyJson }, row.signature, SECRET), true);
  assert.equal(db.state.audit[0].event, 'mandate.created');
});

test('create: a new mandate revokes the previous active one', async () => {
  const { policy } = await draftPolicy(RULES, fakeLlm(goodAiPolicy));
  const db = fakeDb();
  await createMandate({ userId: 'u1', naturalText: RULES, policy }, { db, secret: SECRET });
  await createMandate({ userId: 'u1', naturalText: RULES, policy }, { db, secret: SECRET });
  assert.deepEqual(db.state.mandates.map((m) => m.status), ['REVOKED', 'ACTIVE']);
});

test('create: an edited invalid policy from the client is refused and nothing is saved', async () => {
  const db = fakeDb();
  const r = await createMandate(
    { userId: 'u1', naturalText: RULES, policy: { ...goodAiPolicy, version: 'allowance-1', budget: { amount: -5 } } },
    { db, secret: SECRET },
  );
  assert.equal(r.ok, false);
  assert.equal(db.state.mandates.length, 0);
});

test('active: signature is valid as stored, and invalid after someone edits the database', async () => {
  const { policy } = await draftPolicy(RULES, fakeLlm(goodAiPolicy));
  const db = fakeDb();
  await createMandate({ userId: 'u1', naturalText: RULES, policy }, { db, secret: SECRET });

  const ok = await getActiveMandate('u1', { db, secret: SECRET });
  assert.equal(ok.signatureValid, true);

  db.state.mandates[0].policyJson = { ...db.state.mandates[0].policyJson, auto_approve_limit: 200 };
  const tampered = await getActiveMandate('u1', { db, secret: SECRET });
  assert.equal(tampered.signatureValid, false);
});

test('active: returns null when the user has no mandate', async () => {
  assert.equal(await getActiveMandate('nobody', { db: fakeDb(), secret: SECRET }), null);
});