// Path: api/src/lib/paypal.js
// The one PayPal client the app uses (sandbox).

import { env } from '../config/env.js';
import { createPaypal } from '../services/paypal.service.js';

export const paypal = createPaypal({
  clientId: env.PAYPAL_CLIENT_ID,
  clientSecret: env.PAYPAL_CLIENT_SECRET,
});