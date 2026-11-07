// Path: api/src/services/paypal.service.js
// PayPal sandbox client, cleaned up from spike/vault-spike.js.
// Vault v3 flow: setup token -> user approves once -> payment token -> agent charges it with no click.
// This file never reads .env (see lib/paypal.js), so tests can pass a fake fetch.

import { randomUUID } from 'node:crypto';

export class PaypalError extends Error {
  constructor(message, { status, data } = {}) {
    super(message);
    this.name = 'PaypalError';
    this.status = status;
    this.data = data;
  }
}

export function createPaypal({
  clientId,
  clientSecret,
  baseUrl = 'https://api-m.sandbox.paypal.com',
  fetchFn = fetch,
  timeoutMs = 20_000,
}) {
  let cached = null; // { token, expiresAt }

  async function accessToken() {
    if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetchFn(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new PaypalError('PayPal authentication failed', { status: res.status, data });
    cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 300) * 1000 };
    return cached.token;
  }

  // requestId makes the call idempotent: PayPal returns the first result if the same id is sent again
  async function request(method, path, body, requestId = randomUUID()) {
    const res = await fetchFn(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': requestId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data?.details?.[0]?.issue ?? data?.name ?? 'UNKNOWN_ERROR';
      throw new PaypalError(`PayPal ${method} ${path} failed: ${detail}`, { status: res.status, data });
    }
    return data;
  }

  return {
    // Step 1: the user is sent to approveUrl once to "fund" the allowance
    async createSetupToken({ returnUrl, cancelUrl }) {
      const data = await request('POST', '/v3/vault/setup-tokens', {
        payment_source: {
          paypal: {
            usage_type: 'MERCHANT',
            customer_type: 'CONSUMER',
            experience_context: {
              brand_name: 'Allowance',
              shipping_preference: 'NO_SHIPPING',
              return_url: returnUrl,
              cancel_url: cancelUrl,
            },
          },
        },
      });
      return { setupTokenId: data.id, approveUrl: data.links?.find((l) => l.rel === 'approve')?.href ?? null };
    },

    // Step 2: after approval, exchange the setup token for a reusable payment token
    async createPaymentToken(setupTokenId) {
      const data = await request('POST', '/v3/vault/payment-tokens', {
        payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } },
      });
      return { paymentTokenId: data.id, customerId: data.customer?.id ?? null };
    },

    // Step 3: the agent pays with the saved token, no buyer interaction
    async chargeVaulted({ paymentTokenId, amountUsd, description, requestId }) {
      const order = await request(
        'POST',
        '/v2/checkout/orders',
        {
          intent: 'CAPTURE',
          purchase_units: [
            {
              amount: { currency_code: 'USD', value: Number(amountUsd).toFixed(2) },
              description: String(description ?? 'Allowance purchase').slice(0, 127),
              custom_id: requestId,
            },
          ],
          payment_source: { paypal: { vault_id: paymentTokenId } },
        },
        requestId,
      );

      // Vaulted orders usually complete on create; capture only if still pending
      const result =
        order.status === 'COMPLETED'
          ? order
          : await request('POST', `/v2/checkout/orders/${order.id}/capture`, {}, `${requestId}-capture`);

      const capture = result.purchase_units?.[0]?.payments?.captures?.[0];
      return {
        orderId: result.id,
        status: result.status,
        captureId: capture?.id ?? null,
        captureStatus: capture?.status ?? null,
      };
    },
  };
}