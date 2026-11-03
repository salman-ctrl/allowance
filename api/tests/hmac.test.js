// Path: api/tests/hmac.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signMandate, verifyMandate } from '../src/lib/hmac.js';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const policy = { budget: { amount: 200, currency: 'USD' }, auto_approve_limit: 50 };

test('sign and verify round trip', () => {
  const sig = signMandate({ userId: 'u1', policy }, SECRET);
  assert.equal(verifyMandate({ userId: 'u1', policy }, sig, SECRET), true);
});

test('key order does not change the signature (TiDB JSON may reorder keys)', () => {
  const reordered = { auto_approve_limit: 50, budget: { currency: 'USD', amount: 200 } };
  const sig = signMandate({ userId: 'u1', policy }, SECRET);
  assert.equal(verifyMandate({ userId: 'u1', policy: reordered }, sig, SECRET), true);
});

test('a tampered policy fails', () => {
  const sig = signMandate({ userId: 'u1', policy }, SECRET);
  const tampered = { ...policy, auto_approve_limit: 5000 };
  assert.equal(verifyMandate({ userId: 'u1', policy: tampered }, sig, SECRET), false);
});

test('a policy moved to another user fails', () => {
  const sig = signMandate({ userId: 'u1', policy }, SECRET);
  assert.equal(verifyMandate({ userId: 'u2', policy }, sig, SECRET), false);
});

test('garbage signatures fail without throwing', () => {
  assert.equal(verifyMandate({ userId: 'u1', policy }, 'abc', SECRET), false);
  assert.equal(verifyMandate({ userId: 'u1', policy }, undefined, SECRET), false);
});

test('missing or short secret throws', () => {
  assert.throws(() => signMandate({ userId: 'u1', policy }, 'short'));
});