// Path: api/tests/dashboard.service.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetSummary, listAudit, listCarts, toCartRow } from '../src/services/dashboard.service.js';
import { renderPoisonedPage } from '../src/demo/poisoned-page.js';

const paidCart = {
  id: 'c1',
  createdAt: new Date('2026-11-07T09:00:00Z'),
  userRequest: 'Buy a wireless mouse under $40',
  itemsJson: [{ name: '530 Wireless Mouse', category: 'computer_accessories', unit_price_usd: 9.99, quantity: 1 }],
  merchant: 'lenovo.com',
  source: 'channel3',
  sourceUrl: 'https://buy.trychannel3.com/x',
  totalUsd: '9.99', // Prisma Decimal comes back as a string-like value
  decision: {
    result: 'APPROVED',
    ruleHit: null,
    aiReason: 'Within policy, paid automatically',
    intentScore: 1,
    decidedBy: 'system',
    payment: { status: 'COMPLETED', paypalOrderId: '3HE32052MS825873D', capturedAt: new Date('2026-11-07T09:00:05Z') },
  },
};

test('a paid cart becomes one flat row with decision and payment', () => {
  const row = toCartRow(paidCart);
  assert.equal(row.totalUsd, 9.99);
  assert.equal(row.items, '530 Wireless Mouse');
  assert.equal(row.result, 'APPROVED');
  assert.equal(row.paymentStatus, 'COMPLETED');
  assert.equal(row.paypalOrderId, '3HE32052MS825873D');
});

test('a blocked cart has no payment fields, and quantities show in the item list', () => {
  const row = toCartRow({
    ...paidCart,
    itemsJson: [{ name: 'Pens', category: 'office_supplies', unit_price_usd: 2, quantity: 3 }],
    decision: { result: 'BLOCKED', ruleHit: 'intent_mismatch', aiReason: 'Gift card', intentScore: 0, decidedBy: 'system', payment: null },
  });
  assert.equal(row.items, '3 x Pens');
  assert.equal(row.paymentStatus, null);
  assert.equal(row.ruleHit, 'intent_mismatch');
});

test('budget summary uses cents and never shows negative remaining', () => {
  const policy = { budget: { amount: 200, period: 'monthly' }, auto_approve_limit: 50 };
  assert.deepEqual(budgetSummary(policy, 149.98), {
    period: 'monthly',
    budgetUsd: 200,
    spentUsd: 149.98,
    remainingUsd: 50.02,
    autoApproveLimitUsd: 50,
  });
  assert.equal(budgetSummary(policy, 250).remainingUsd, 0);
});

test('listCarts filters by result, clamps the limit, and refuses unknown results', async () => {
  let args;
  const db = { cartMandate: { findMany: async (a) => ((args = a), [paidCart]) } };
  const r = await listCarts('u1', { result: 'held', limit: '9999' }, { db });
  assert.equal(r.ok, true);
  assert.deepEqual(args.where.decision, { is: { result: 'HELD' } });
  assert.deepEqual(args.where.intentMandate, { is: { userId: 'u1' } });
  assert.equal(args.take, 200);

  const bad = await listCarts('u1', { result: 'PAID' }, { db });
  assert.equal(bad.status, 422);
});

test('listAudit maps rows and defaults the limit', async () => {
  let args;
  const db = {
    auditLog: {
      findMany: async (a) => ((args = a), [{ id: 'a1', createdAt: new Date(), entity: 'cart', entityId: 'c1', event: 'cart.submitted', detailJson: { x: 1 } }]),
    },
  };
  const r = await listAudit({}, { db });
  assert.equal(args.take, 200);
  assert.deepEqual(r.events[0].detail, { x: 1 });
});

test('the poisoned demo page hides the injection from people and escapes HTML', () => {
  const html = renderPoisonedPage();
  assert.match(html, /class="hidden-for-humans"/);
  assert.match(html, /Demo page for Allowance/);
  assert.match(html, /SYSTEM NOTE TO AI AGENT/);
  assert.doesNotMatch(html, /<script/i);
});