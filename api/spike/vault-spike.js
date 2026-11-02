// Allowance — Phase 1 spike: can an agent pay with PayPal WITHOUT the buyer clicking each time?
//
// Flow being tested (PayPal Vault v3, sandbox):
//   1. /vault/start  -> create a setup token, buyer approves ONCE on PayPal ("activate allowance")
//   2. /vault/return -> exchange setup token for a reusable payment token (vault_id)
//   3. /pay          -> create + capture an order using vault_id, no buyer interaction
//
// Run:  node spike/vault-spike.js   then open http://localhost:3000
// Needs in api/.env:  PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET
// Optional:           PAYMENT_TOKEN_ID  (reuse a token after restart, skips step 1-2)

import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';

const BASE = 'https://api-m.sandbox.paypal.com';
const PORT = 3000;
const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;

if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
  console.error('Missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in .env');
  process.exit(1);
}

const state = {
  setupTokenId: null,
  paymentTokenId: process.env.PAYMENT_TOKEN_ID || null,
  customerId: null,
};

async function getAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error('OAuth failed'), { data });
  return data.access_token;
}

async function paypal(method, path, body = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': randomUUID(),
    },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  console.log(`\n${method} ${path} -> ${res.status}`);
  console.dir(data, { depth: 6 });
  if (!res.ok) throw Object.assign(new Error(`${method} ${path} failed (${res.status})`), { data });
  return data;
}

const page = (title, obj) => `<!doctype html><meta charset="utf-8">
<body style="font-family:system-ui;max-width:760px;margin:40px auto;padding:0 16px">
<h2>${title}</h2>
<pre style="background:#f4f4f4;padding:12px;border-radius:8px;white-space:pre-wrap">${
  obj ? JSON.stringify(obj, null, 2) : ''
}</pre>
<p><a href="/">Back</a></p></body>`;

const app = express();

app.get('/', (_req, res) => {
  res.send(`<!doctype html><meta charset="utf-8">
<body style="font-family:system-ui;max-width:760px;margin:40px auto;padding:0 16px">
<h2>Allowance — Vault spike</h2>
<p>Saved payment token: <b>${state.paymentTokenId ?? 'none yet'}</b></p>
<ol>
  <li><a href="/vault/start">Activate allowance (buyer approves once)</a></li>
  <li><a href="/pay?amount=12.50">Agent pays $12.50 (no buyer click)</a></li>
  <li><a href="/pay?amount=3.99">Agent pays $3.99 (no buyer click)</a></li>
</ol></body>`);
});

// Step 1: create setup token, send buyer to PayPal once
app.get('/vault/start', async (_req, res, next) => {
  try {
    const data = await paypal('POST', '/v3/vault/setup-tokens', {
      payment_source: {
        paypal: {
          usage_type: 'MERCHANT',
          customer_type: 'CONSUMER',
          experience_context: {
            brand_name: 'Allowance',
            shipping_preference: 'NO_SHIPPING',
            return_url: `http://localhost:${PORT}/vault/return`,
            cancel_url: `http://localhost:${PORT}/vault/cancel`,
          },
        },
      },
    });
    state.setupTokenId = data.id;
    const approve = data.links?.find((l) => l.rel === 'approve')?.href;
    if (!approve) return res.send(page('No approve link returned', data));
    res.redirect(approve);
  } catch (err) {
    next(err);
  }
});

// Step 2: buyer approved -> exchange setup token for reusable payment token
app.get('/vault/return', async (req, res, next) => {
  try {
    console.log('\nReturn query from PayPal:', req.query);
    const setupId = state.setupTokenId || req.query.approval_token_id;
    if (!setupId) return res.send(page('No setup token in memory. Start again from step 1.'));
    const data = await paypal('POST', '/v3/vault/payment-tokens', {
      payment_source: { token: { id: setupId, type: 'SETUP_TOKEN' } },
    });
    state.paymentTokenId = data.id;
    state.customerId = data.customer?.id ?? null;
    res.send(
      page('Allowance activated. Save PAYMENT_TOKEN_ID to .env to reuse it.', {
        PAYMENT_TOKEN_ID: state.paymentTokenId,
        customer_id: state.customerId,
      }),
    );
  } catch (err) {
    next(err);
  }
});

app.get('/vault/cancel', (_req, res) => res.send(page('Buyer cancelled the approval.')));

// Step 3: agent-initiated payment using the saved token, no redirect
app.get('/pay', async (req, res, next) => {
  try {
    const amount = String(req.query.amount ?? '');
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) return res.status(400).send(page('Invalid amount'));
    if (!state.paymentTokenId) return res.send(page('No payment token yet. Do step 1 first.'));

    const order = await paypal('POST', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: 'USD', value: amount },
          description: 'Allowance spike: agent-initiated payment',
        },
      ],
      payment_source: { paypal: { vault_id: state.paymentTokenId } },
    });

    // Vaulted orders often complete on create; capture only if still pending
    const result =
      order.status === 'COMPLETED'
        ? order
        : await paypal('POST', `/v2/checkout/orders/${order.id}/capture`);

    const capture = result.purchase_units?.[0]?.payments?.captures?.[0];
    res.send(
      page(result.status === 'COMPLETED' ? 'PAID with no buyer click ✅' : `Status: ${result.status}`, {
        order_id: result.id,
        status: result.status,
        capture_id: capture?.id,
        capture_status: capture?.status,
        amount: capture?.amount,
      }),
    );
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error('\nERROR:', err.message);
  res.status(500).send(page(`Error: ${err.message}`, err.data ?? null));
});

app.listen(PORT, () => console.log(`Spike running on http://localhost:${PORT}`));