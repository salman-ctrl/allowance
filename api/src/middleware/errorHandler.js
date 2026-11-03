// Path: api/src/middleware/errorHandler.js
// Express 5 forwards errors from async routes here automatically.

export function notFound(_req, res) {
  res.status(404).json({ ok: false, errors: ['Not found'] });
}

export function errorHandler(err, _req, res, _next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, errors: ['Request body is not valid JSON'] });
  }
  console.error(err);
  res.status(500).json({ ok: false, errors: ['Something went wrong on our side'] });
}