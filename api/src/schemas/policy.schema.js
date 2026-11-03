// Path: api/src/schemas/policy.schema.js
// The shape every Intent Mandate policy must have.
// Gemini writes policy_json from the user's plain-English rules, and nothing
// it writes is trusted until it passes this schema.

import { z } from 'zod';

export const POLICY_VERSION = 'allowance-1';

export const CATEGORIES = [
  'office_supplies',
  'computer_accessories',
  'electronics',
  'books',
  'software',
  'home',
  'apparel',
  'groceries',
  'gift_cards',
  'crypto',
  'other',
];

// At most 2 decimals, so every amount converts cleanly to cents
const hasCents = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
const usd = (min) =>
  z.number().min(min).max(10000).refine(hasCents, 'Must have at most 2 decimals');

export const policySchema = z
  .object({
    version: z.literal(POLICY_VERSION),
    budget: z
      .object({
        amount: usd(0.01),
        currency: z.literal('USD'),
        period: z.enum(['weekly', 'monthly']),
      })
      .strict(),
    // Carts at or below this amount are paid without asking the user
    auto_approve_limit: usd(0),
    allowed_categories: z.array(z.enum(CATEGORIES)).min(1),
    blocked_categories: z.array(z.enum(CATEGORIES)).default([]),
    // Empty list means any merchant is allowed
    allowed_merchants: z.array(z.string().trim().min(1).max(191)).default([]),
    require_intent_match: z.boolean().default(true),
  })
  .strict()
  .refine((p) => p.auto_approve_limit <= p.budget.amount, {
    message: 'auto_approve_limit cannot be higher than the budget',
    path: ['auto_approve_limit'],
  })
  .refine((p) => !p.allowed_categories.some((c) => p.blocked_categories.includes(c)), {
    message: 'A category cannot be both allowed and blocked',
    path: ['blocked_categories'],
  });

// Returns { ok: true, policy } with defaults filled in, or { ok: false, errors }
export function parsePolicy(input) {
  const result = policySchema.safeParse(input);
  if (result.success) return { ok: true, policy: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join('.') || 'policy'}: ${i.message}`),
  };
}