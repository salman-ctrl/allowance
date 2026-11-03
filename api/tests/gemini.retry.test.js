// Path: api/tests/gemini.retry.test.js
// Simulates a busy or broken Gemini without calling the real API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGenerateJson, LlmUnavailableError } from '../src/lib/gemini.js';
import { draftPolicy } from '../src/services/mandate.service.js';

const apiError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

// call() fails with the given errors in order, then succeeds; records which model was used
function scripted(...failures) {
  const used = [];
  const call = async (model) => {
    used.push(model);
    const next = failures.shift();
    if (next) throw next;
    return '{"ok":true}';
  };
  return { call, used };
}

const build = (call) =>
  createGenerateJson({ apiKey: 'x', models: ['main', 'backup'], call, sleep: async () => {} });

test('503 twice on the main model, then the backup model answers', async () => {
  const { call, used } = scripted(apiError(503), apiError(503));
  assert.equal(await build(call)({}), '{"ok":true}');
  assert.deepEqual(used, ['main', 'main', 'backup']);
});

test('one 429 then success stays on the main model', async () => {
  const { call, used } = scripted(apiError(429));
  await build(call)({});
  assert.deepEqual(used, ['main', 'main']);
});

test('404 model not found skips straight to the backup', async () => {
  const { call, used } = scripted(apiError(404));
  await build(call)({});
  assert.deepEqual(used, ['main', 'backup']);
});

test('a timeout counts as retryable', async () => {
  const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  const { call, used } = scripted(timeout);
  await build(call)({});
  assert.deepEqual(used, ['main', 'main']);
});

test('a network drop (no HTTP status) counts as retryable', async () => {
  const offline = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  const { call, used } = scripted(offline);
  await build(call)({});
  assert.deepEqual(used, ['main', 'main']);
});

test('every model busy ends in LlmUnavailableError', async () => {
  const { call, used } = scripted(apiError(503), apiError(503), apiError(503), apiError(503));
  await assert.rejects(build(call)({}), LlmUnavailableError);
  assert.equal(used.length, 4);
});

test('a bad API key fails at once and is not hidden as "busy"', async () => {
  const { call, used } = scripted(apiError(401));
  await assert.rejects(build(call)({}), (err) => err.status === 401 && !(err instanceof LlmUnavailableError));
  assert.deepEqual(used, ['main']);
});

test('draftPolicy reports a busy AI clearly and does not re-prompt it', async () => {
  let calls = 0;
  const llm = async () => {
    calls++;
    throw new LlmUnavailableError('busy');
  };
  const r = await draftPolicy('Office supplies only, max $200 a month', { llm });
  assert.equal(r.ok, false);
  assert.equal(r.unavailable, true);
  assert.match(r.errors[0], /busy/);
  assert.equal(calls, 1);
});