// Path: api/src/services/policy.engine.js
// Pure decision logic: no database, no network, no AI calls.
// The caller runs it in two steps so Gemini is only called when the rules pass:
//   1. evaluateRules()  -> cheap checks, can BLOCK immediately
//   2. intent verifier  -> AI check (done by the caller, see intent.verifier.js)
//   3. decide()         -> applies the intent result and the auto-approve limit

export const INTENT_MIN_SCORE = 0.7;

// All money math is done in integer cents to avoid 0.1 + 0.2 bugs
export const toCents = (value) => Math.round(Number(value) * 100);
const fmt = (cents) => `$${(cents / 100).toFixed(2)}`;
const norm = (s) => String(s ?? '').trim().toLowerCase();

const blocked = (ruleHit, reason) => ({ pass: false, result: 'BLOCKED', ruleHit, reason });

// Start of the current budget period, in UTC (weeks start on Monday)
export function periodStart(period, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  if (period === 'monthly') return new Date(Date.UTC(y, m, 1));
  if (period === 'weekly') return new Date(Date.UTC(y, m, d - ((now.getUTCDay() + 6) % 7)));
  throw new Error(`Unknown period: ${period}`);
}

// mandate: { status, expiresAt, policy }   policy must already be parsed by parsePolicy()
// cart:    { merchant, total_usd, items: [{ name, category, unit_price_usd, quantity }] }
// spentUsd: what was already paid in the current period
export function evaluateRules({ mandate, signatureValid, cart, spentUsd = 0, now = new Date() }) {
  const { policy } = mandate;

  // 1. The mandate itself
  if (mandate.status !== 'ACTIVE') return blocked('mandate_inactive', `Mandate is ${mandate.status}`);
  if (mandate.expiresAt && new Date(mandate.expiresAt) <= now) {
    return blocked('mandate_expired', 'Mandate has expired');
  }
  if (signatureValid !== true) {
    return blocked('invalid_signature', 'Mandate signature does not match its policy');
  }

  // 2. The cart must be internally consistent (the agent cannot fake the total)
  const items = Array.isArray(cart?.items) ? cart.items : [];
  if (items.length === 0) return blocked('empty_cart', 'Cart has no items');

  let itemsCents = 0;
  for (const item of items) {
    const price = toCents(item.unit_price_usd);
    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(item.quantity) || item.quantity < 1) {
      return blocked('invalid_item', `Invalid price or quantity for "${item.name}"`);
    }
    itemsCents += price * item.quantity;
  }
  const totalCents = toCents(cart.total_usd);
  if (totalCents !== itemsCents) {
    return blocked('cart_total_mismatch', `Cart total ${fmt(totalCents)} does not match its items (${fmt(itemsCents)})`);
  }

  // 3. Categories and merchant
  for (const item of items) {
    if (policy.blocked_categories.includes(item.category)) {
      return blocked('category_blocked', `"${item.name}" is in a blocked category (${item.category})`);
    }
    if (!policy.allowed_categories.includes(item.category)) {
      return blocked('category_not_allowed', `"${item.name}" is not in an allowed category (${item.category})`);
    }
  }
  if (policy.allowed_merchants.length > 0 && !policy.allowed_merchants.map(norm).includes(norm(cart.merchant))) {
    return blocked('merchant_not_allowed', `Merchant "${cart.merchant}" is not on the allowed list`);
  }

  // 4. Budget for the current period
  const budgetCents = toCents(policy.budget.amount);
  const afterCents = toCents(spentUsd) + totalCents;
  if (afterCents > budgetCents) {
    return blocked(
      'over_budget',
      `${fmt(totalCents)} would bring ${policy.budget.period} spending to ${fmt(afterCents)}, over the ${fmt(budgetCents)} budget`,
    );
  }

  return { pass: true, totalCents };
}

// intent: { match: boolean, score: 0..1, reason } from the AI verifier, or null if it did not run
export function decide({ policy, cart, intent }) {
  const totalCents = toCents(cart.total_usd);
  const intentScore = typeof intent?.score === 'number' ? intent.score : null;

  if (policy.require_intent_match) {
    // Fail closed: no verifier result means no payment
    if (!intent) {
      return { result: 'BLOCKED', ruleHit: 'intent_check_missing', reason: 'Intent check did not run', intentScore };
    }
    if (intent.match !== true || !(intentScore >= INTENT_MIN_SCORE)) {
      return {
        result: 'BLOCKED',
        ruleHit: 'intent_mismatch',
        reason: intent.reason || 'Cart does not match what the user asked for',
        intentScore,
      };
    }
  }

  const limitCents = toCents(policy.auto_approve_limit);
  if (totalCents > limitCents) {
    return {
      result: 'HELD',
      ruleHit: 'above_auto_approve',
      reason: `${fmt(totalCents)} is above the ${fmt(limitCents)} auto-approve limit, waiting for the user`,
      intentScore,
    };
  }
  return { result: 'APPROVED', ruleHit: null, reason: 'Within policy, paid automatically', intentScore };
}

// Both steps at once, used by tests and by any caller that already has the intent result
export function evaluate(ctx) {
  const rules = evaluateRules(ctx);
  if (!rules.pass) return { result: rules.result, ruleHit: rules.ruleHit, reason: rules.reason, intentScore: null };
  return decide({ policy: ctx.mandate.policy, cart: ctx.cart, intent: ctx.intent ?? null });
}