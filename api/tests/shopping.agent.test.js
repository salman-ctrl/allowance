// Path: api/tests/shopping.agent.test.js
// The agent with fake Gemini, fake Channel3 and a fake Allowance submit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runShoppingAgent } from '../src/agent/shopping.agent.js';
import { LlmUnavailableError } from '../src/lib/gemini.js';
import { Channel3Error } from '../src/services/channel3.service.js';

const products = [
  { product_id: 'k1', title: 'Keychron K2 Mechanical Keyboard', price_usd: 49.99, merchant: 'keychron.com', url: 'https://k', description: 'Wireless' },
  { product_id: 'k2', title: 'Redragon K552', price_usd: 35.5, merchant: 'amazon.com', url: 'https://r' },
];

function setup({ plan, choice, found = products, channel3Error } = {}) {
  const answers = [plan ?? { search_query: 'mechanical keyboard', max_price_usd: 50, quantity: 1 }, choice ?? { index: 0, category: 'computer_accessories', reason: 'Best match' }];
  const llm = async () => JSON.stringify(answers.shift());
  const searches = [];
  const channel3 = {
    search: async (args) => {
      searches.push(args);
      if (channel3Error) throw channel3Error;
      return { products: found, rawCount: found.length };
    },
  };
  const submitted = [];
  const submit = async (body) => {
    submitted.push(body);
    return { ok: true, decision: { result: 'APPROVED', reason: 'Within policy' } };
  };
  return { deps: { llm, channel3, submit }, searches, submitted };
}

test('plans, searches, chooses, and asks Allowance to pay with a valid cart', async () => {
  const { deps, searches, submitted } = setup();
  const r = await runShoppingAgent({ request: 'Buy a mechanical keyboard under $50' }, deps);

  assert.equal(r.ok, true);
  assert.deepEqual(searches[0], { query: 'mechanical keyboard', maxPriceUsd: 50, limit: 6 });
  const cart = submitted[0].cart;
  assert.equal(submitted[0].user_request, 'Buy a mechanical keyboard under $50');
  assert.equal(cart.merchant, 'keychron.com');
  assert.equal(cart.total_usd, 49.99);
  assert.equal(cart.items[0].category, 'computer_accessories');
  assert.equal(cart.source, 'channel3');
  assert.deepEqual(r.steps.map((s) => s.step), ['plan', 'search', 'choose', 'request_payment', 'decision']);
});

test('quantity multiplies in cents without float errors', async () => {
  const { deps, submitted } = setup({ plan: { search_query: 'pens', max_price_usd: 0, quantity: 3 }, choice: { index: 1, category: 'office_supplies', reason: 'ok' } });
  await runShoppingAgent({ request: 'Buy three packs of pens' }, deps);
  assert.equal(submitted[0].cart.total_usd, 106.5);
});

test('max price 0 means no price filter', async () => {
  const { deps, searches } = setup({ plan: { search_query: 'office chair', max_price_usd: 0, quantity: 1 } });
  await runShoppingAgent({ request: 'Buy an office chair' }, deps);
  assert.equal(searches[0].maxPriceUsd, null);
});

test('simulated attack swaps in the disguised gift card, labeled in the steps', async () => {
  const { deps, submitted } = setup();
  const r = await runShoppingAgent({ request: 'Buy a mechanical keyboard under $50', simulateAttack: true }, deps);
  const item = submitted[0].cart.items[0];
  assert.equal(item.name, '$45 Digital Gift Card');
  assert.equal(item.category, 'computer_accessories');
  assert.equal(submitted[0].cart.merchant, 'keyboard-deals.example');
  assert.ok(r.steps.some((s) => s.step === 'attack' && /SIMULATED ATTACK/.test(s.detail)));
});

test('no products or no fitting product means no cart is sent', async () => {
  const empty = setup({ found: [] });
  assert.equal((await runShoppingAgent({ request: 'Buy a unicorn saddle' }, empty.deps)).cart, null);
  assert.equal(empty.submitted.length, 0);

  const none = setup({ choice: { index: -1, category: 'other', reason: 'Nothing fits' } });
  assert.equal((await runShoppingAgent({ request: 'Buy a keyboard' }, none.deps)).cart, null);
  assert.equal(none.submitted.length, 0);
});

test('an out-of-range index from the AI is treated as no choice', async () => {
  const { deps, submitted } = setup({ choice: { index: 7, category: 'computer_accessories', reason: 'x' } });
  await runShoppingAgent({ request: 'Buy a keyboard' }, deps);
  assert.equal(submitted.length, 0);
});

test('busy AI and failing Channel3 return clean errors', async () => {
  const busy = { llm: async () => { throw new LlmUnavailableError('busy'); }, channel3: {}, submit: async () => ({}) };
  assert.equal((await runShoppingAgent({ request: 'Buy a keyboard' }, busy)).status, 503);

  const { deps } = setup({ channel3Error: new Channel3Error('down', { status: 500 }) });
  const r = await runShoppingAgent({ request: 'Buy a keyboard' }, deps);
  assert.equal(r.status, 502);
});

test('too short request never reaches the AI', async () => {
  const { deps, searches } = setup();
  const r = await runShoppingAgent({ request: 'hi' }, deps);
  assert.equal(r.status, 422);
  assert.equal(searches.length, 0);
});

test('the carts the agent builds pass the real Allowance validation and total check', async () => {
  const { parseSubmitCart } = await import('../src/schemas/cart.schema.js');
  const { evaluateRules } = await import('../src/services/policy.engine.js');
  const { parsePolicy } = await import('../src/schemas/policy.schema.js');
  const { policy } = parsePolicy({
    version: 'allowance-1',
    budget: { amount: 200, currency: 'USD', period: 'monthly' },
    auto_approve_limit: 50,
    allowed_categories: ['office_supplies', 'computer_accessories'],
    blocked_categories: ['gift_cards', 'crypto'],
  });

  for (const simulateAttack of [false, true]) {
    const { deps, submitted } = setup({ plan: { search_query: 'pens', max_price_usd: 0, quantity: 3 }, choice: { index: 1, category: 'office_supplies', reason: 'ok' } });
    await runShoppingAgent({ request: 'Buy three packs of pens', simulateAttack }, deps);
    const parsed = parseSubmitCart(submitted[0]);
    assert.equal(parsed.ok, true, parsed.errors?.join());
    const rules = evaluateRules({ mandate: { status: 'ACTIVE', policy }, signatureValid: true, cart: parsed.value.cart, spentUsd: 0 });
    assert.notEqual(rules.ruleHit, 'cart_total_mismatch');
    assert.notEqual(rules.ruleHit, 'invalid_item');
  }
});