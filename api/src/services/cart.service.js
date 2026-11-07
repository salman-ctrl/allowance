// Path: api/src/services/cart.service.js
// The heart of Allowance: an agent asks to pay, and we decide.
//   1. validate the cart           4. AI intent verifier (only if the rules passed)
//   2. load + verify the mandate   5. save the decision
//   3. rules (policy engine)       6. APPROVED -> charge PayPal with the vaulted token
// HELD carts wait for the user: approveHeldCart() re-checks everything before paying.

import { parseSubmitCart } from '../schemas/cart.schema.js';
import { decide, evaluateRules, periodStart, toCents } from './policy.engine.js';
import { verifyIntent } from './intent.verifier.js';
import { getActiveMandate } from './mandate.service.js';

const fail = (status, errors) => ({ ok: false, status, errors: [].concat(errors) });
const usdString = (cents) => (cents / 100).toFixed(2);

async function payDecision({ repo, paypal, user, decisionId, cartId, totalCents, userRequest }) {
  if (!user?.paypalPaymentTokenId) {
    await repo.logEvent({ entity: 'decision', entityId: decisionId, event: 'payment.skipped', detail: { reason: 'no_payment_token' } });
    return { status: 'FAILED', error: 'Allowance is not activated with PayPal yet' };
  }

  // The PENDING row exists before PayPal is called, so a crash never loses track of money
  const payment = await repo.createPayment({ decisionId, amountUsd: usdString(totalCents) });
  try {
    const charged = await paypal.chargeVaulted({
      paymentTokenId: user.paypalPaymentTokenId,
      amountUsd: usdString(totalCents),
      description: `Allowance: ${userRequest}`,
      requestId: cartId, // idempotent: retrying the same cart never charges twice
    });
    if (charged.status !== 'COMPLETED') throw new Error(`PayPal order status ${charged.status}`);
    await repo.completePayment(payment.id, charged);
    await repo.logEvent({
      entity: 'payment',
      entityId: payment.id,
      event: 'payment.completed',
      detail: { cart_id: cartId, paypal_order_id: charged.orderId, amount_usd: usdString(totalCents) },
    });
    return { status: 'COMPLETED', paymentId: payment.id, paypalOrderId: charged.orderId, captureId: charged.captureId };
  } catch (err) {
    await repo.failPayment(payment.id);
    await repo.logEvent({ entity: 'payment', entityId: payment.id, event: 'payment.failed', detail: { cart_id: cartId, error: err.message } });
    return { status: 'FAILED', paymentId: payment.id, error: 'PayPal could not complete the payment' };
  }
}

export async function submitCart(input, { repo, db, secret, llm, paypal, userId, now = new Date() }) {
  const parsed = parseSubmitCart(input);
  if (!parsed.ok) return fail(422, parsed.errors);
  const { user_request: userRequest, cart } = parsed.value;

  const active = await getActiveMandate(userId, { db, secret });
  if (!active) return fail(409, 'No active mandate. Create one first.');
  const { mandate, signatureValid } = active;

  const spentUsd = await repo.sumSpentSince(userId, periodStart(mandate.policy.budget.period, now));
  const rules = evaluateRules({ mandate, signatureValid, cart, spentUsd, now });

  let decision;
  if (!rules.pass) {
    decision = { result: 'BLOCKED', ruleHit: rules.ruleHit, reason: rules.reason, intentScore: null };
  } else {
    const intent = mandate.policy.require_intent_match ? await verifyIntent({ userRequest, cart }, { llm }) : null;
    decision = decide({ policy: mandate.policy, cart, intent });
    if (decision.ruleHit === 'intent_check_missing') {
      decision.reason = 'The AI verifier could not run, so the payment was blocked to be safe. Try again.';
    }
  }

  const { cartId, decisionId } = await repo.createCartWithDecision({ intentMandateId: mandate.id, userRequest, cart, decision });

  let payment = null;
  if (decision.result === 'APPROVED') {
    const user = await repo.getUser(userId);
    payment = await payDecision({ repo, paypal, user, decisionId, cartId, totalCents: toCents(cart.total_usd), userRequest });
  }

  return {
    ok: true,
    status: 201,
    cartId,
    decision: { result: decision.result, ruleHit: decision.ruleHit, reason: decision.reason, intentScore: decision.intentScore },
    budget: {
      period: mandate.policy.budget.period,
      budgetUsd: mandate.policy.budget.amount,
      spentBeforeUsd: spentUsd,
    },
    payment,
  };
}

// The user approves a HELD cart. Rules are re-checked against today's mandate and budget,
// because both may have changed since the cart was held. The AI verdict from submit is kept.
export async function approveHeldCart({ cartId }, { repo, db, secret, paypal, userId, now = new Date() }) {
  const row = await repo.getCartForUser(cartId, userId);
  if (!row) return fail(404, 'Cart not found');
  if (row.decision?.result !== 'HELD') return fail(409, `Cart is ${row.decision?.result ?? 'undecided'}, not waiting for approval`);

  const active = await getActiveMandate(userId, { db, secret });
  const cart = { merchant: row.merchant, total_usd: Number(row.totalUsd), items: row.itemsJson };

  let blockedBy = null;
  if (!active || active.mandate.id !== row.intentMandateId) {
    blockedBy = { ruleHit: 'mandate_changed', reason: 'The mandate this cart was held under is no longer active' };
  } else {
    const spentUsd = await repo.sumSpentSince(userId, periodStart(active.mandate.policy.budget.period, now));
    const rules = evaluateRules({ mandate: active.mandate, signatureValid: active.signatureValid, cart, spentUsd, now });
    if (!rules.pass) blockedBy = { ruleHit: rules.ruleHit, reason: rules.reason };
  }

  const data = blockedBy
    ? { result: 'BLOCKED', ruleHit: blockedBy.ruleHit, aiReason: blockedBy.reason, decidedBy: 'user' }
    : { result: 'APPROVED', ruleHit: 'approved_by_user', aiReason: 'Above the auto-approve limit, approved by the user', decidedBy: 'user' };

  const moved = await repo.transitionHeld(row.decision.id, data);
  if (!moved) return fail(409, 'This cart was already handled');

  await repo.logEvent({
    entity: 'decision',
    entityId: row.decision.id,
    event: blockedBy ? 'decision.blocked_on_approval' : 'decision.approved_by_user',
    detail: { cart_id: cartId, ...(blockedBy ?? {}) },
  });

  if (blockedBy) {
    return { ok: true, status: 200, cartId, decision: { result: 'BLOCKED', ...blockedBy }, payment: null };
  }

  const user = await repo.getUser(userId);
  const payment = await payDecision({
    repo,
    paypal,
    user,
    decisionId: row.decision.id,
    cartId,
    totalCents: toCents(cart.total_usd),
    userRequest: row.userRequest,
  });
  return { ok: true, status: 200, cartId, decision: { result: 'APPROVED', ruleHit: 'approved_by_user', reason: 'Approved by the user' }, payment };
}

export async function rejectHeldCart({ cartId }, { repo, userId }) {
  const row = await repo.getCartForUser(cartId, userId);
  if (!row) return fail(404, 'Cart not found');
  // Guard: an undefined id in a Prisma updateMany means "no filter" and would touch every HELD cart
  if (!row.decision?.id) return fail(409, 'This cart is not waiting for approval');

  const moved = await repo.transitionHeld(row.decision.id, {
    result: 'BLOCKED',
    ruleHit: 'rejected_by_user',
    aiReason: 'Rejected by the user',
    decidedBy: 'user',
  });
  if (!moved) return fail(409, 'This cart is not waiting for approval');

  await repo.logEvent({ entity: 'decision', entityId: row.decision.id, event: 'decision.rejected_by_user', detail: { cart_id: cartId } });
  return { ok: true, status: 200, cartId, decision: { result: 'BLOCKED', ruleHit: 'rejected_by_user', reason: 'Rejected by the user' }, payment: null };
}