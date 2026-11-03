// Path: api/src/routes/mandates.routes.js
import { Router } from 'express';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { generateJson } from '../lib/ai.js';
import { getDemoUser } from '../services/user.service.js';
import { createMandate, draftPolicy, getActiveMandate } from '../services/mandate.service.js';

export const mandatesRouter = Router();

const demoUser = () =>
  getDemoUser(prisma, { paymentTokenId: env.PAYMENT_TOKEN_ID, customerId: env.PAYPAL_CUSTOMER_ID });

// POST /mandates/draft  { text }  -> AI-drafted policy for the user to review, nothing saved
mandatesRouter.post('/draft', async (req, res) => {
  const result = await draftPolicy(req.body?.text, { llm: generateJson });
  res.status(result.ok ? 200 : result.unavailable ? 503 : 422).json(result);
});

// POST /mandates  { text, policy }  -> user confirmed the draft: sign and activate
mandatesRouter.post('/', async (req, res) => {
  const user = await demoUser();
  const result = await createMandate(
    { userId: user.id, naturalText: req.body?.text, policy: req.body?.policy },
    { db: prisma, secret: env.MANDATE_SIGNING_SECRET },
  );
  res.status(result.ok ? 201 : 422).json(result);
});

// GET /mandates/active  -> current mandate + whether its signature still verifies
mandatesRouter.get('/active', async (_req, res) => {
  const user = await demoUser();
  const active = await getActiveMandate(user.id, { db: prisma, secret: env.MANDATE_SIGNING_SECRET });
  if (!active) return res.status(404).json({ ok: false, errors: ['No active mandate'] });
  res.json({ ok: true, ...active });
});