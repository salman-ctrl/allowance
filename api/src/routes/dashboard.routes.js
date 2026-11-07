// Path: api/src/routes/dashboard.routes.js
import { Router } from 'express';
import { cartDeps } from '../lib/context.js';
import { getSummary, listAudit } from '../services/dashboard.service.js';

export const dashboardRouter = Router();

const send = (res, result) => res.status(result.status ?? 200).json(result);

// GET /summary  -> active mandate, budget used and left, counts per decision
dashboardRouter.get('/summary', async (_req, res) => {
  const deps = await cartDeps();
  send(res, await getSummary(deps.userId, deps));
});

// GET /audit?limit=200  -> raw audit events, newest first
dashboardRouter.get('/audit', async (req, res) => {
  const deps = await cartDeps();
  send(res, await listAudit(req.query, deps));
});