// Path: api/tests/middleware.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cors } from '../src/middleware/cors.js';
import { rateLimit } from '../src/middleware/rateLimit.js';

function fakeRes() {
  const res = { headers: {}, statusCode: 200, body: null };
  res.setHeader = (k, v) => (res.headers[k] = v);
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.sendStatus = (c) => ((res.statusCode = c), res);
  return res;
}

test('CORS allows the configured frontend and nobody else', () => {
  const mw = cors(['https://allowance-web.onrender.com']);

  const okRes = fakeRes();
  let nextCalled = false;
  mw({ method: 'GET', headers: { origin: 'https://allowance-web.onrender.com' } }, okRes, () => (nextCalled = true));
  assert.equal(okRes.headers['Access-Control-Allow-Origin'], 'https://allowance-web.onrender.com');
  assert.equal(nextCalled, true);

  const badRes = fakeRes();
  mw({ method: 'GET', headers: { origin: 'https://evil.example' } }, badRes, () => {});
  assert.equal(badRes.headers['Access-Control-Allow-Origin'], undefined);
});

test('CORS preflight: 204 for our frontend, 403 for others', () => {
  const mw = cors(['http://localhost:5173']);
  const ok = fakeRes();
  mw({ method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } }, ok, () => {});
  assert.equal(ok.statusCode, 204);
  const bad = fakeRes();
  mw({ method: 'OPTIONS', headers: { origin: 'https://evil.example' } }, bad, () => {});
  assert.equal(bad.statusCode, 403);
});

test('rate limit blocks after max requests and resets after the window', () => {
  let t = 0;
  const mw = rateLimit({ windowMs: 1000, max: 2, now: () => t });
  const hit = (ip) => {
    const res = fakeRes();
    let passed = false;
    mw({ ip }, res, () => (passed = true));
    return { passed, res };
  };

  assert.equal(hit('1.1.1.1').passed, true);
  assert.equal(hit('1.1.1.1').passed, true);
  const third = hit('1.1.1.1');
  assert.equal(third.passed, false);
  assert.equal(third.res.statusCode, 429);
  assert.ok(third.res.headers['Retry-After']);

  assert.equal(hit('2.2.2.2').passed, true, 'other visitors are not affected');

  t = 1001;
  assert.equal(hit('1.1.1.1').passed, true, 'window has reset');
});