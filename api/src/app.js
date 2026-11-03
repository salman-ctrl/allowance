// Path: api/src/app.js
import express from 'express';
import { mandatesRouter } from './routes/mandates.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export const app = express();

app.use(express.json({ limit: '50kb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'allowance-api' }));
app.use('/mandates', mandatesRouter);

app.use(notFound);
app.use(errorHandler);