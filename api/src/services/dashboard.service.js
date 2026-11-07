// Path: api/src/services/dashboard.service.js
// Read-only data for the dashboard: one flat row per cart (for AG Grid and the approvals
// queue), a budget summary, and the raw audit events.

import { getActiveMandate } from './mandate.service.js';
import { periodStart, toCents } from './policy.engine.js';

export const RESULTS = ['HELD', 'APPROVED', 'BLOCKED'];

const clamp = (n, min, max, fallback) => {
  const v = Number.parseInt(n, 10);
  return Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback;
};

// One cart with its decision and payment, flattened so a grid can show it directly
export function toCartRow(cart) {
  const decision = cart.decision ?? null;
  const payment = decision?.payment ?? null;
  const items = Array.isArray(cart.itemsJson) ? cart.itemsJson : [];
  return {
    id: cart.id,
    createdAt: cart.createdAt,
    userRequest: cart.userRequest,
    items: items.map((i) => (i.quantity > 1 ? `${i.quantity} x ${i.name}` : i.name)).join(', '),
    categories: [...new Set(items.map((i) => i.category))].join(', '),
    merchant: cart.merchant,
    source: cart.source,
    sourceUrl: cart.sourceUrl ?? null,
    totalUsd: Number(cart.totalUsd),
    result: decision?.result ?? null,
    ruleHit: decision?.ruleHit ?? null,
    reason: decision?.aiReason ?? null,
    intentScore: decision?.intentScore ?? null,
    decidedBy: decision?.decidedBy ?? null,
    paymentStatus: payment?.status ?? null,
    paypalOrderId: payment?.paypalOrderId ?? null,
    paidAt: payment?.capturedAt ?? null,
  };
}

export function budgetSummary(policy, spentUsd) {
  const budgetCents = toCents(policy.budget.amount);
  const spentCents = toCents(spentUsd);
  return {
    period: policy.budget.period,
    budgetUsd: budgetCents / 100,
    spentUsd: spentCents / 100,
    remainingUsd: Math.max(0, budgetCents - spentCents) / 100,
    autoApproveLimitUsd: toCents(policy.auto_approve_limit) / 100,
  };
}

// GET /carts?result=HELD&limit=50
export async function listCarts(userId, query, { db }) {
  const result = query?.result ? String(query.result).toUpperCase() : null;
  if (result && !RESULTS.includes(result)) {
    return { ok: false, status: 422, errors: [`result must be one of ${RESULTS.join(', ')}`] };
  }
  const rows = await db.cartMandate.findMany({
    where: {
      intentMandate: { is: { userId } },
      ...(result ? { decision: { is: { result } } } : {}),
    },
    include: { decision: { include: { payment: true } } },
    orderBy: { createdAt: 'desc' },
    take: clamp(query?.limit, 1, 200, 100),
  });
  return { ok: true, status: 200, carts: rows.map(toCartRow) };
}

// GET /summary  -> what the dashboard header needs
export async function getSummary(userId, { db, secret, repo, now = new Date() }) {
  const ownedBy = { cartMandate: { is: { intentMandate: { is: { userId } } } } };
  const [held, approved, blocked] = await Promise.all(
    RESULTS.map((r) => db.decision.count({ where: { result: r, ...ownedBy } })),
  );
  const counts = { HELD: held, APPROVED: approved, BLOCKED: blocked };

  const active = await getActiveMandate(userId, { db, secret });
  if (!active) return { ok: true, status: 200, mandate: null, budget: null, counts };

  const { mandate, signatureValid } = active;
  const spentUsd = await repo.sumSpentSince(userId, periodStart(mandate.policy.budget.period, now));
  return {
    ok: true,
    status: 200,
    mandate: {
      id: mandate.id,
      naturalText: mandate.naturalText,
      summary: mandate.summary,
      policy: mandate.policy,
      createdAt: mandate.createdAt,
      signatureValid,
    },
    budget: budgetSummary(mandate.policy, spentUsd),
    counts,
  };
}

// GET /audit?limit=200
export async function listAudit(query, { db }) {
  const rows = await db.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: clamp(query?.limit, 1, 500, 200),
  });
  return {
    ok: true,
    status: 200,
    events: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      entity: r.entity,
      entityId: r.entityId,
      event: r.event,
      detail: r.detailJson ?? null,
    })),
  };
}