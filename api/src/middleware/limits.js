// Path: api/src/middleware/limits.js
// Shared limits. One AI bucket for every route that calls Gemini, so they add up per visitor.

import { rateLimit } from './rateLimit.js';

const TEN_MINUTES = 10 * 60 * 1000;

export const aiLimit = rateLimit({ windowMs: TEN_MINUTES, max: 30 });
export const resetLimit = rateLimit({ windowMs: TEN_MINUTES, max: 10 });