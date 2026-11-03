// Path: api/src/config/env.js
// Loads .env once and fails fast with a clear message if something is missing.

import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().startsWith('mysql://'),
  MANDATE_SIGNING_SECRET: z.string().min(32),
  GEMINI_API_KEY: z.string().min(10),
  GEMINI_MODEL: z.string().default('gemini-flash-latest'),
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-flash-lite-latest'),
  PAYPAL_CLIENT_ID: z.string().min(10),
  PAYPAL_CLIENT_SECRET: z.string().min(10),
  PAYMENT_TOKEN_ID: z.string().optional(),
  PAYPAL_CUSTOMER_ID: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`\nInvalid or missing environment variables in api/.env:\n${missing}\n`);
  process.exit(1);
}

export const env = parsed.data;