// Path: api/src/app.js
import express from 'express';
import { mandatesRouter } from './routes/mandates.routes.js';
import { cartsRouter } from './routes/carts.routes.js';
import { demoRouter } from './routes/demo.routes.js';
import { agentRouter } from './routes/agent.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export const app = express();

app.use(express.json({ limit: '50kb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'allowance-api' }));
app.use('/mandates', mandatesRouter);
app.use('/carts', cartsRouter);
app.use('/demo', demoRouter);
app.use('/agent', agentRouter);

app.use(notFound);
app.use(errorHandler);