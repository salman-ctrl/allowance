// Path: api/src/routes/agent.routes.js
import { Router } from 'express';
import { channel3 } from '../lib/channel3.js';
import { generateJson } from '../lib/ai.js';
import { cartDeps } from '../lib/context.js';
import { submitCart } from '../services/cart.service.js';
import { runShoppingAgent } from '../agent/shopping.agent.js';

export const agentRouter = Router();

// POST /agent/run  { request, simulate_attack? }  -> the demo agent shops, then asks Allowance to pay
agentRouter.post('/run', async (req, res) => {
  if (!channel3) return res.status(503).json({ ok: false, errors: ['CHANNEL3_API_KEY is not set on the server'] });

  const deps = await cartDeps();
  const result = await runShoppingAgent(
    { request: req.body?.request, simulateAttack: req.body?.simulate_attack === true },
    { llm: generateJson, channel3, submit: (body) => submitCart(body, deps) },
  );
  res.status(result.status ?? 200).json(result);
});