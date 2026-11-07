// Path: api/src/services/channel3.service.js
// Product search through Channel3 (one API for products across many stores).
// Results are normalized to what the agent needs, and only USD, in-stock offers are kept.
// This file never reads .env (see lib/channel3.js), so tests can pass a fake fetch.

export class Channel3Error extends Error {
  constructor(message, { status, data } = {}) {
    super(message);
    this.name = 'Channel3Error';
    this.status = status;
    this.data = data;
  }
}

// The live API sends price as { price, compare_at_price, currency } (seen 7 Nov 2026).
// Docs show { amount, currency } and old samples a plain number: accept all three
// so a format change does not silently return nothing.
function bestOffer(offers) {
  const usable = (Array.isArray(offers) ? offers : [])
    .map((o) => ({
      price: Number(o?.price?.price ?? o?.price?.amount ?? o?.price),
      currency: o?.price?.currency ?? o?.currency ?? 'USD',
      merchant: o?.domain ?? o?.merchant_domain ?? o?.merchant ?? null,
      url: o?.url ?? null,
      availability: o?.availability ?? null,
    }))
    .filter(
      (o) =>
        Number.isFinite(o.price) &&
        o.price > 0 &&
        o.currency === 'USD' &&
        o.merchant &&
        (!o.availability || /instock/i.test(o.availability)),
    );
  return usable.sort((a, b) => a.price - b.price)[0] ?? null;
}

export function normalizeProduct(p) {
  const offer = bestOffer(p?.offers);
  if (!offer || !p?.id || !p?.title) return null;
  return {
    product_id: String(p.id).slice(0, 64),
    title: String(p.title).slice(0, 200),
    description: typeof p.description === 'string' ? p.description.slice(0, 300) : undefined,
    brand: p.brands?.[0]?.name ?? p.brand?.name ?? null,
    // e.g. "Electronics > Input Devices > Mice & Trackballs": a hint for the agent, never trusted by the rules
    store_category: Array.isArray(p.category?.path)
      ? p.category.path.map((c) => c?.title).filter(Boolean).join(' > ').slice(0, 200)
      : (p.category?.title ?? null),
    rating: typeof p.ratings?.value === 'number' ? p.ratings.value : null,
    price_usd: Math.round(offer.price * 100) / 100,
    merchant: String(offer.merchant).slice(0, 191),
    url: offer.url ? String(offer.url).slice(0, 2000) : undefined,
    image: p.images?.[0]?.url ?? p.image_url ?? null,
  };
}

export function createChannel3({ apiKey, baseUrl = 'https://api.trychannel3.com', fetchFn = fetch, timeoutMs = 15_000 }) {
  return {
    // Returns { products, rawCount } so the agent can report how many were dropped (non-USD, out of stock)
    async search({ query, maxPriceUsd = null, limit = 6 }) {
      const body = { query, limit: Math.min(limit * 2, 20) };
      if (maxPriceUsd) body.filters = { price: { max_price: maxPriceUsd } };

      let res;
      try {
        res = await fetchFn(`${baseUrl}/v1/search`, {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        // Network drop or timeout: never reached Channel3
        throw new Channel3Error(`Channel3 unreachable (${err?.name ?? 'network error'})`, { data: { cause: err?.message } });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Channel3Error(`Channel3 search failed (${res.status})`, { status: res.status, data });

      const raw = Array.isArray(data?.products) ? data.products : [];
      const products = raw.map(normalizeProduct).filter(Boolean).slice(0, limit);
      return { products, rawCount: raw.length };
    },
  };
}