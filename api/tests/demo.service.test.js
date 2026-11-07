// Path: api/tests/demo.service.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetDemo } from '../src/services/demo.service.js';

// Records every call so we can check the delete order and that the mandate is never touched
function recordingDb() {
  const calls = [];
  const model = (name) =>
    new Proxy({}, {
      get: (_t, op) => async (args) => {
        calls.push(`${name}.${op}`);
        if (op === 'findMany') return [{ id: 'c1' }, { id: 'c2' }];
        return { count: 2 };
      },
    });
  const db = {
    calls,
    cartMandate: model('cartMandate'),
    payment: model('payment'),
    decision: model('decision'),
    auditLog: model('auditLog'),
    intentMandate: model('intentMandate'),
    user: model('user'),
    $transaction: async (fn) => fn(db),
  };
  return db;
}

test('reset deletes children before parents and keeps the mandate and user', async () => {
  const db = recordingDb();
  const r = await resetDemo({ userId: 'u1' }, { db });

  assert.equal(r.ok, true);
  assert.deepEqual(db.calls, [
    'cartMandate.findMany',
    'payment.deleteMany',
    'decision.deleteMany',
    'cartMandate.deleteMany',
    'auditLog.deleteMany',
    'auditLog.create',
  ]);
  assert.ok(!db.calls.some((c) => c.startsWith('intentMandate.') || c.startsWith('user.')));
});