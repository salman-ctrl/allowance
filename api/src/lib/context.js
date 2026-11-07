// Path: api/src/lib/context.js
// Everything the cart flow needs for the demo user, built once per request.
// Shared by the carts routes and the agent routes so both use the exact same path to PayPal.

import { env } from '../config/env.js';
import { prisma } from './prisma.js';
import { generateJson } from './ai.js';
import { paypal } from './paypal.js';
import { getDemoUser } from '../services/user.service.js';
import { createCartRepo } from '../services/cart.repo.js';

const repo = createCartRepo(prisma);

export async function cartDeps() {
  const user = await getDemoUser(prisma, { paymentTokenId: env.PAYMENT_TOKEN_ID, customerId: env.PAYPAL_CUSTOMER_ID });
  return { repo, db: prisma, secret: env.MANDATE_SIGNING_SECRET, llm: generateJson, paypal, userId: user.id };
}