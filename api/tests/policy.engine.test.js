// Path: api/tests/policy.engine.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, periodStart } from '../src/services/policy.engine.js';
import { parsePolicy } from '../src/schemas/policy.schema.js';

// "Office supplies and computer accessories, max $200 a month, ask me above $50"
const { policy } = parsePolicy({
  version: 'allowance-1',
  budget: { amount: 200, currency: 'USD', period: 'monthly' },
  auto_approve_limit: 50,
  allowed_categories: ['office_supplies', 'computer_accessories'],
  blocked_categories: ['gift_cards', 'crypto'],
});

const goodIntent = { match: true, score: 0.95, reason: 'Matches the request' };

const cartOf = (items, extra = {}) => ({
  merchant: 'Allowance Demo Store',
  items,
  total_usd: items.reduce((s, i) => s + i.unit_price_usd * i.quantity, 0).toFixed(2),
  ...extra,
});

const ctx = (overrides = {}) => ({
  mandate: { status: 'ACTIVE', expiresAt: null, policy },
  signatureValid: true,
  spentUsd: 0,
  now: new Date('2026-11-10T00:00:00Z'),
  intent: goodIntent,
  cart: cartOf([{ name: 'Wireless mouse', category: 'computer_accessories', unit_price_usd: 39.99, quantity: 1 }]),
  ...overrides,
});

// ---- The three demo scenarios ----

test('scenario 1: $39.99 mouse is paid automatically', () => {
  const d = evaluate(ctx());
  assert.equal(d.result, 'APPROVED');
});

test('scenario 2: $120 chair is held for the user', () => {
  const cart = cartOf([{ name: 'Ergonomic chair', category: 'office_supplies', unit_price_usd: 120, quantity: 1 }]);
  const d = evaluate(ctx({ cart }));
  assert.equal(d.result, 'HELD');
  assert.equal(d.ruleHit, 'above_auto_approve');
});

test('scenario 3: injected gift card disguised as an accessory passes the rules but the verifier blocks it', () => {
  // The malicious page lies about its category, so every rule passes
  const cart = cartOf(
    [{ name: '$45 Digital Gift Card', category: 'computer_accessories', unit_price_usd: 45, quantity: 1 }],
    { merchant: 'keyboard-deals.example' },
  );
  const intent = { match: false, score: 0.08, reason: 'User asked for a keyboard; cart contains a gift card' };
  const d = evaluate(ctx({ cart, intent }));
  assert.equal(d.result, 'BLOCKED');
  assert.equal(d.ruleHit, 'intent_mismatch');
});

// ---- Rules ----

test('blocks an honestly labeled gift card by category', () => {
  const cart = cartOf([{ name: 'Gift card', category: 'gift_cards', unit_price_usd: 25, quantity: 1 }]);
  assert.equal(evaluate(ctx({ cart })).ruleHit, 'category_blocked');
});

test('blocks a category the user never allowed', () => {
  const cart = cartOf([{ name: 'T-shirt', category: 'apparel', unit_price_usd: 15, quantity: 1 }]);
  assert.equal(evaluate(ctx({ cart })).ruleHit, 'category_not_allowed');
});

test('blocks when the cart would exceed the monthly budget', () => {
  const d = evaluate(ctx({ spentUsd: 180 }));
  assert.equal(d.ruleHit, 'over_budget');
});

test('allows spending exactly up to the budget and the auto-approve limit', () => {
  const cart = cartOf([{ name: 'Desk lamp', category: 'office_supplies', unit_price_usd: 50, quantity: 1 }]);
  const d = evaluate(ctx({ cart, spentUsd: 150 }));
  assert.equal(d.result, 'APPROVED');
});

test('blocks an invalid signature', () => {
  assert.equal(evaluate(ctx({ signatureValid: false })).ruleHit, 'invalid_signature');
});

test('blocks revoked and expired mandates', () => {
  assert.equal(evaluate(ctx({ mandate: { status: 'REVOKED', policy } })).ruleHit, 'mandate_inactive');
  const expired = { status: 'ACTIVE', expiresAt: '2026-11-01T00:00:00Z', policy };
  assert.equal(evaluate(ctx({ mandate: expired })).ruleHit, 'mandate_expired');
});

test('blocks a cart whose total does not match its items', () => {
  const cart = { ...cartOf([{ name: 'Mouse', category: 'computer_accessories', unit_price_usd: 40, quantity: 1 }]), total_usd: 4 };
  assert.equal(evaluate(ctx({ cart })).ruleHit, 'cart_total_mismatch');
});

test('blocks empty carts and bad quantities', () => {
  assert.equal(evaluate(ctx({ cart: { merchant: 'x', items: [], total_usd: 0 } })).ruleHit, 'empty_cart');
  const cart = cartOf([{ name: 'Pens', category: 'office_supplies', unit_price_usd: 2, quantity: 0.5 }]);
  assert.equal(evaluate(ctx({ cart })).ruleHit, 'invalid_item');
});

test('blocks a merchant outside the allow list', () => {
  const strict = parsePolicy({ ...policy, allowed_merchants: ['Allowance Demo Store'] }).policy;
  const cart = cartOf([{ name: 'Mouse', category: 'computer_accessories', unit_price_usd: 20, quantity: 1 }], { merchant: 'shady.example' });
  assert.equal(evaluate(ctx({ mandate: { status: 'ACTIVE', policy: strict }, cart })).ruleHit, 'merchant_not_allowed');
});

// ---- Intent verifier results ----

test('fails closed when the intent check did not run', () => {
  assert.equal(evaluate(ctx({ intent: null })).ruleHit, 'intent_check_missing');
});

test('blocks a "match" with a low confidence score', () => {
  const d = evaluate(ctx({ intent: { match: true, score: 0.4 } }));
  assert.equal(d.ruleHit, 'intent_mismatch');
});

// ---- Money and time ----

test('cent math has no floating point errors', () => {
  const cart = cartOf([
    { name: 'Pen', category: 'office_supplies', unit_price_usd: 0.1, quantity: 1 },
    { name: 'Clip', category: 'office_supplies', unit_price_usd: 0.2, quantity: 1 },
  ]);
  assert.equal(cart.total_usd, '0.30');
  assert.equal(evaluate(ctx({ cart })).result, 'APPROVED');
});

test('period start is the 1st of the month or Monday, in UTC', () => {
  const wed = new Date('2026-11-04T15:00:00Z');
  assert.equal(periodStart('monthly', wed).toISOString(), '2026-11-01T00:00:00.000Z');
  assert.equal(periodStart('weekly', wed).toISOString(), '2026-11-02T00:00:00.000Z');
  const sun = new Date('2026-11-08T23:00:00Z');
  assert.equal(periodStart('weekly', sun).toISOString(), '2026-11-02T00:00:00.000Z');
});