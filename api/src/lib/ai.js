// Path: api/src/lib/ai.js
// The one Gemini instance the app uses: main model first, lighter model as backup.

import { env } from '../config/env.js';
import { createGenerateJson } from './gemini.js';

export const generateJson = createGenerateJson({
  apiKey: env.GEMINI_API_KEY,
  models: [env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL],
});