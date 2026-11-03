// Path: api/tests/policy.schema.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePolicy } from '../src/schemas/policy.schema.js';

const valid = {
  version: 'allowance-1',
  budget: { amount: 200, currency: 'USD', period: 'monthly' },
  auto_approve_limit: 50,
  allowed_categories: ['office_supplies', 'computer_accessories'],
  blocked_categories: ['gift_cards', 'crypto'],
};

test('valid policy passes and gets defaults', () => {
  const r = parsePolicy(valid);
  assert.equal(r.ok, true);
  assert.deepEqual(r.policy.allowed_merchants, []);
  assert.equal(r.policy.require_intent_match, true);
});

test('rejects auto-approve limit above the budget', () => {
  const r = parsePolicy({ ...valid, auto_approve_limit: 500 });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /auto_approve_limit/);
});

test('rejects a category that is both allowed and blocked', () => {
  const r = parsePolicy({ ...valid, blocked_categories: ['office_supplies'] });
  assert.equal(r.ok, false);
});

test('rejects unknown fields Gemini might invent', () => {
  const r = parsePolicy({ ...valid, unlimited: true });
  assert.equal(r.ok, false);
});

test('rejects unknown categories and non-USD currency', () => {
  assert.equal(parsePolicy({ ...valid, allowed_categories: ['weapons'] }).ok, false);
  assert.equal(parsePolicy({ ...valid, budget: { ...valid.budget, currency: 'IDR' } }).ok, false);
});

test('rejects amounts with more than 2 decimals', () => {
  assert.equal(parsePolicy({ ...valid, auto_approve_limit: 49.999 }).ok, false);
});