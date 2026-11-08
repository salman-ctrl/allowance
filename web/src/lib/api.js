// Path: web/src/lib/api.js
// Every call to the Allowance API goes through here.
// Always resolves to the API's JSON ({ ok, ... } or { ok: false, errors }), never throws,
// so pages only have one shape to handle.

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return {
      ok: false,
      errors: ['Cannot reach the Allowance server. If it was idle, it may take up to a minute to wake up. Try again.'],
    };
  }
  const data = await res.json().catch(() => null);
  if (data && typeof data === 'object') return data;
  return { ok: false, errors: [`The server answered with an unexpected response (${res.status}).`] };
}

export const api = {
  summary: () => request('GET', '/summary'),
  draftMandate: (text) => request('POST', '/mandates/draft', { text }),
  createMandate: (text, policy) => request('POST', '/mandates', { text, policy }),
  runAgent: (text, simulateAttack) => request('POST', '/agent/run', { request: text, simulate_attack: simulateAttack }),
  carts: (result) => request('GET', result ? `/carts?result=${result}` : '/carts'),
  approve: (id) => request('POST', `/carts/${id}/approve`),
  reject: (id) => request('POST', `/carts/${id}/reject`),
  audit: () => request('GET', '/audit'),
  resetDemo: () => request('POST', '/demo/reset'),
};

export const poisonedPageUrl = `${API_URL}/demo/poisoned-page`;
