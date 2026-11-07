// Path: api/tests/channel3.service.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChannel3, normalizeProduct, Channel3Error } from '../src/services/channel3.service.js';

test('picks the cheapest USD in-stock offer (documented { amount, currency } price shape)', () => {
  const p = normalizeProduct({
    id: 'p1',
    title: 'Keychron K2',
    brands: [{ name: 'Keychron' }],
    offers: [
      { domain: 'a.com', price: { amount: 89, currency: 'USD' }, availability: 'InStock', url: 'https://a' },
      { domain: 'b.com', price: { amount: 79.999, currency: 'USD' }, availability: 'InStock', url: 'https://b' },
      { domain: 'c.com', price: { amount: 50, currency: 'EUR' }, availability: 'InStock' },
      { domain: 'd.com', price: { amount: 40, currency: 'USD' }, availability: 'OutOfStock' },
    ],
  });
  assert.equal(p.merchant, 'b.com');
  assert.equal(p.price_usd, 80);
  assert.equal(p.brand, 'Keychron');
});

test('also reads the flat { price, currency, merchant_domain } shape', () => {
  const p = normalizeProduct({ id: 'p2', title: 'Mouse', offers: [{ merchant_domain: 'x.com', price: 25, currency: 'USD' }] });
  assert.equal(p.price_usd, 25);
  assert.equal(p.merchant, 'x.com');
});

test('products without a usable offer are dropped', () => {
  assert.equal(normalizeProduct({ id: 'p3', title: 'Only EUR', offers: [{ domain: 'e.de', price: { amount: 9, currency: 'EUR' } }] }), null);
  assert.equal(normalizeProduct({ id: 'p4', title: 'No offers' }), null);
});

test('search sends the key and price filter, and reports raw vs usable counts', async () => {
  let sent;
  const fetchFn = async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        products: [
          { id: '1', title: 'A', offers: [{ domain: 'a.com', price: { amount: 30, currency: 'USD' } }] },
          { id: '2', title: 'B', offers: [{ domain: 'b.de', price: { amount: 30, currency: 'EUR' } }] },
        ],
      }),
    };
  };
  const r = await createChannel3({ apiKey: 'ch3_test', fetchFn }).search({ query: 'mouse', maxPriceUsd: 40 });
  assert.equal(sent.url, 'https://api.trychannel3.com/v1/search');
  assert.equal(sent.init.headers['x-api-key'], 'ch3_test');
  assert.deepEqual(sent.body.filters, { price: { max_price: 40 } });
  assert.equal(r.rawCount, 2);
  assert.equal(r.products.length, 1);
});

test('API errors become Channel3Error', async () => {
  const fetchFn = async () => ({ ok: false, status: 401, json: async () => ({ detail: 'bad key' }) });
  await assert.rejects(createChannel3({ apiKey: 'x', fetchFn }).search({ query: 'mouse' }), Channel3Error);
});

test('a network drop also becomes Channel3Error, not a crash', async () => {
  const fetchFn = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
  await assert.rejects(createChannel3({ apiKey: 'x', fetchFn }).search({ query: 'mouse' }), Channel3Error);
});

// Trimmed copy of a real /v1/search product, captured 7 Nov 2026
const LIVE_SAMPLE = {
  id: 'Nm5SVOB',
  title: '530 Wireless Mouse',
  description: 'The Lenovo 530 Wireless Mouse in Abyss Blue is a reliable and portable plug-and-play device.',
  brands: [{ id: 'NKbC', name: 'Lenovo' }],
  images: [{ url: 'https://cdn.trychannel3.com/0dd8', is_main_image: true }],
  category: {
    slug: 'mice-trackballs',
    title: 'Mice & Trackballs',
    path: [
      { slug: 'electronics', title: 'Electronics' },
      { slug: 'input-devices', title: 'Input Devices' },
      { slug: 'mice-trackballs', title: 'Mice & Trackballs' },
    ],
  },
  offers: [
    {
      url: 'https://buy.trychannel3.com/Nm5SVOB-hl1t-uNQKp8',
      domain: 'lenovo.com',
      price: { price: 9.99, compare_at_price: 17.99, currency: 'USD' },
      availability: 'InStock',
      condition: 'new',
    },
  ],
  ratings: { value: 4.5, count: 579 },
};

test('reads the real live response shape: price.price, domain, InStock', () => {
  const p = normalizeProduct(LIVE_SAMPLE);
  assert.ok(p, 'the live sample must not be filtered out');
  assert.equal(p.price_usd, 9.99);
  assert.equal(p.merchant, 'lenovo.com');
  assert.equal(p.brand, 'Lenovo');
  assert.equal(p.store_category, 'Electronics > Input Devices > Mice & Trackballs');
  assert.equal(p.rating, 4.5);
  assert.equal(p.image, 'https://cdn.trychannel3.com/0dd8');
});