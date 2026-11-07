// Path: api/src/lib/channel3.js
// The one Channel3 client the app uses. null when CHANNEL3_API_KEY is not set.

import { env } from '../config/env.js';
import { createChannel3 } from '../services/channel3.service.js';

export const channel3 = env.CHANNEL3_API_KEY ? createChannel3({ apiKey: env.CHANNEL3_API_KEY }) : null;