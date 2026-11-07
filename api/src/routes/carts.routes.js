// Path: api/src/routes/carts.routes.js
import { Router } from 'express';
import { cartDeps } from '../lib/context.js';
import { approveHeldCart, rejectHeldCart, submitCart } from '../services/cart.service.js';

export const cartsRouter = Router();

const send = (res, result) => res.status(result.status ?? (result.ok ? 200 : 400)).json(result);

// POST /carts  { user_request, cart }  -> an agent asks permission to pay
cartsRouter.post('/', async (req, res) => send(res, await submitCart(req.body, await cartDeps())));

// POST /carts/:id/approve  -> the user approves a HELD cart
cartsRouter.post('/:id/approve', async (req, res) =>
  send(res, await approveHeldCart({ cartId: req.params.id }, await cartDeps())),
);

// POST /carts/:id/reject  -> the user rejects a HELD cart
cartsRouter.post('/:id/reject', async (req, res) =>
  send(res, await rejectHeldCart({ cartId: req.params.id }, await cartDeps())),
);