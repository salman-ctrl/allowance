// Path: api/src/server.js
import { env } from './config/env.js';
import { app } from './app.js';

app.listen(env.PORT, () => {
  console.log(`Allowance API running on http://localhost:${env.PORT}`);
});