// Path: api/src/middleware/cors.js
// Lets only our own frontend call the API from a browser. Origins come from CORS_ORIGINS.

export function cors(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.headers.origin;
    const ok = Boolean(origin) && allowed.has(origin);
    if (ok) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(ok ? 204 : 403);
    next();
  };
}