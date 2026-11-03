// Path: api/src/lib/hmac.js
// Signs a mandate so nobody can change its policy after the user approved it.
// AP2 uses W3C Verifiable Credentials for this; HMAC is the hackathon-sized version.

import { createHmac, timingSafeEqual } from 'node:crypto';

// MySQL/TiDB JSON columns can return object keys in a different order than we
// saved them. Sorting keys first means the same policy always signs the same.
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function getSecret(secret) {
  const s = secret ?? process.env.MANDATE_SIGNING_SECRET;
  if (!s || s.length < 32) {
    throw new Error('MANDATE_SIGNING_SECRET is missing or shorter than 32 characters');
  }
  return s;
}

// The signature covers the user too, so a policy cannot be moved to another user
export function signMandate({ userId, policy }, secret) {
  return createHmac('sha256', getSecret(secret))
    .update(canonicalize({ user_id: userId, policy }))
    .digest('hex');
}

export function verifyMandate({ userId, policy }, signature, secret) {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = Buffer.from(signMandate({ userId, policy }, secret), 'hex');
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}