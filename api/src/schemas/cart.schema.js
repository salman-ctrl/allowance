// Path: api/src/schemas/cart.schema.js
// What an agent must send when it asks Allowance for permission to pay.
// Category is a free string on purpose: it comes from untrusted product data,
// and the policy engine decides whether it is allowed.

import { z } from 'zod';

const usd = z.coerce.number().positive().max(10000);

export const cartSchema = z.object({
  merchant: z.string().trim().min(1).max(191),
  total_usd: usd,
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        category: z.string().trim().min(1).max(64),
        unit_price_usd: usd,
        quantity: z.number().int().min(1).max(100),
        description: z.string().max(2000).optional(),
        product_id: z.string().max(64).optional(),
        url: z.string().max(2000).optional(),
      }),
    )
    .min(1)
    .max(20),
  source: z.enum(['manual', 'agent', 'channel3']).default('manual'),
  source_url: z.string().max(2000).optional(),
});

export const submitCartSchema = z.object({
  user_request: z.string().trim().min(3).max(500),
  cart: cartSchema,
});

export function parseSubmitCart(input) {
  const result = submitCartSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`),
  };
}