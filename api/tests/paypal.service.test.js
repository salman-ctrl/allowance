// Path: api/tests/paypal.service.test.js
// A fake fetch stands in for PayPal: no network, no sandbox calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPaypal, PaypalError } from '../src/services/paypal.service.js';

function fakeFetch(routes) {
  const calls = [];
  const fetchFn = async (url, init) => {
    const path = url.replace('https://api-m.sandbox.paypal.com', '');
    calls.push({ path, init, body: init.body && init.body.startsWith('{') ? JSON.parse(init.body) : init.body });
    const handler = routes[`${init.method} ${path}`] ?? routes[`${init.method} *`];
    if (!handler) throw new Error(`No fake route for ${init.method} ${path}`);
    const { status = 200, json } = handler(calls.at(-1));
    return { ok: status < 300, status, json: async () => json };
  };
  return { fetchFn, calls };
}

const token = () => ({ json: { access_token: 'tok', expires_in: 3600 } });
const completedOrder = () => ({
  json: { id: 'ORDER1', status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'CAP1', status: 'COMPLETED' }] } }] },
});

const client = (fetchFn) => createPaypal({ clientId: 'id', clientSecret: 'secret', fetchFn });

test('charges a vaulted token: order completes on create, no extra capture call', async () => {
  const { fetchFn, calls } = fakeFetch({ 'POST /v1/oauth2/token': token, 'POST /v2/checkout/orders': completedOrder });
  const r = await client(fetchFn).chargeVaulted({ paymentTokenId: 'VT1', amountUsd: 39.9, description: 'Mouse', requestId: 'cart1' });

  assert.deepEqual(r, { orderId: 'ORDER1', status: 'COMPLETED', captureId: 'CAP1', captureStatus: 'COMPLETED' });
  const order = calls.find((c) => c.path === '/v2/checkout/orders');
  assert.equal(order.body.payment_source.paypal.vault_id, 'VT1');
  assert.equal(order.body.purchase_units[0].amount.value, '39.90');
  assert.equal(order.init.headers['PayPal-Request-Id'], 'cart1');
  assert.equal(calls.length, 2);
});

test('captures when the order is not completed on create', async () => {
  const { fetchFn, calls } = fakeFetch({
    'POST /v1/oauth2/token': token,
    'POST /v2/checkout/orders': () => ({ json: { id: 'ORDER2', status: 'APPROVED' } }),
    'POST /v2/checkout/orders/ORDER2/capture': completedOrder,
  });
  const r = await client(fetchFn).chargeVaulted({ paymentTokenId: 'VT1', amountUsd: 10, requestId: 'cart2' });
  assert.equal(r.status, 'COMPLETED');
  assert.equal(calls.at(-1).init.headers['PayPal-Request-Id'], 'cart2-capture');
});

test('reuses the access token instead of logging in every call', async () => {
  const { fetchFn, calls } = fakeFetch({ 'POST /v1/oauth2/token': token, 'POST /v2/checkout/orders': completedOrder });
  const pp = client(fetchFn);
  await pp.chargeVaulted({ paymentTokenId: 'VT1', amountUsd: 1, requestId: 'a' });
  await pp.chargeVaulted({ paymentTokenId: 'VT1', amountUsd: 1, requestId: 'b' });
  assert.equal(calls.filter((c) => c.path === '/v1/oauth2/token').length, 1);
});

test('PayPal errors become a PaypalError with the issue code', async () => {
  const { fetchFn } = fakeFetch({
    'POST /v1/oauth2/token': token,
    'POST /v2/checkout/orders': () => ({ status: 422, json: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'INSTRUMENT_DECLINED' }] } }),
  });
  await assert.rejects(
    client(fetchFn).chargeVaulted({ paymentTokenId: 'VT1', amountUsd: 5, requestId: 'x' }),
    (err) => err instanceof PaypalError && err.status === 422 && /INSTRUMENT_DECLINED/.test(err.message),
  );
});

test('bad credentials fail at authentication', async () => {
  const { fetchFn } = fakeFetch({ 'POST /v1/oauth2/token': () => ({ status: 401, json: { error: 'invalid_client' } }) });
  await assert.rejects(client(fetchFn).chargeVaulted({ paymentTokenId: 'VT1', amountUsd: 5, requestId: 'x' }), /authentication failed/);
});

test('setup token returns the approve link', async () => {
  const { fetchFn } = fakeFetch({
    'POST /v1/oauth2/token': token,
    'POST /v3/vault/setup-tokens': () => ({ json: { id: 'ST1', links: [{ rel: 'approve', href: 'https://paypal/approve' }] } }),
  });
  const r = await client(fetchFn).createSetupToken({ returnUrl: 'http://r', cancelUrl: 'http://c' });
  assert.deepEqual(r, { setupTokenId: 'ST1', approveUrl: 'https://paypal/approve' });
});