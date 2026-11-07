// Path: api/src/middleware/rateLimit.js
// Small in-memory rate limiter per IP. The public demo calls Gemini and Channel3,
// so this stops one visitor from burning the free quotas during judging.

export function rateLimit({ windowMs, max, message = 'Too many requests. Please wait a few minutes and try again.', now = () => Date.now() }) {
  const hits = new Map(); // ip -> { count, resetAt }

  return (req, res, next) => {
    const t = now();
    const key = req.ip ?? 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
    }
    entry.count++;

    // Keep memory bounded
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - t) / 1000)));
      return res.status(429).json({ ok: false, errors: [message] });
    }
    next();
  };
}