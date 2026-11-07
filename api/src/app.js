// Path: api/src/app.js
import express from 'express';
import { env } from './config/env.js';
import { cors } from './middleware/cors.js';
import { mandatesRouter } from './routes/mandates.routes.js';
import { cartsRouter } from './routes/carts.routes.js';
import { demoRouter } from './routes/demo.routes.js';
import { agentRouter } from './routes/agent.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export const app = express();

// Render sits behind a proxy: needed so rate limiting sees the visitor's IP, not the proxy's
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(cors(env.CORS_ORIGINS));
app.use(express.json({ limit: '50kb' }));

app.get('/', (_req, res) =>
  res.json({
    ok: true,
    service: 'allowance-api',
    description: 'Give your AI agent an allowance, not your wallet.',
    endpoints: [
      'GET  /health',
      'GET  /summary',
      'POST /mandates/draft',
      'POST /mandates',
      'GET  /mandates/active',
      'POST /agent/run',
      'GET  /carts',
      'POST /carts',
      'POST /carts/:id/approve',
      'POST /carts/:id/reject',
      'GET  /audit',
      'POST /demo/reset',
      'GET  /demo/poisoned-page',
    ],
  }),
);
app.get('/health', (_req, res) => res.json({ ok: true, service: 'allowance-api' }));

app.use('/mandates', mandatesRouter);
app.use('/carts', cartsRouter);
app.use('/agent', agentRouter);
app.use('/demo', demoRouter);
app.use('/', dashboardRouter);

app.use(notFound);
app.use(errorHandler);