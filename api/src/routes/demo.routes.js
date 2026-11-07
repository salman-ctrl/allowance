// Path: api/src/routes/demo.routes.js
import { Router } from 'express';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { getDemoUser } from '../services/user.service.js';
import { resetDemo } from '../services/demo.service.js';
import { resetLimit } from '../middleware/limits.js';
import { renderPoisonedPage } from '../demo/poisoned-page.js';

export const demoRouter = Router();

// POST /demo/reset  -> clean slate: budget back to $0, mandate and PayPal token kept
demoRouter.post('/reset', resetLimit, async (_req, res) => {
  const user = await getDemoUser(prisma, { paymentTokenId: env.PAYMENT_TOKEN_ID, customerId: env.PAYPAL_CUSTOMER_ID });
  res.json(await resetDemo({ userId: user.id }, { db: prisma }));
});

// GET /demo/poisoned-page  -> the scenario 3 product page, for judges to see
demoRouter.get('/poisoned-page', (_req, res) => {
  res.type('html').send(renderPoisonedPage());
});