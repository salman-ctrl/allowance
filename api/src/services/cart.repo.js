// Path: api/src/services/cart.repo.js
// Every database query the cart flow needs, in one place.
// cart.service.js only talks to this object, so tests can swap in an in-memory version.

export function createCartRepo(db) {
  return {
    getUser: (userId) => db.user.findUnique({ where: { id: userId } }),

    // Budget is per user, not per mandate: creating a new mandate must not reset spending.
    // PENDING counts too, so two payments in flight cannot both slip under the budget.
    async sumSpentSince(userId, since) {
      const result = await db.payment.aggregate({
        _sum: { amountUsd: true },
        where: {
          status: { in: ['PENDING', 'COMPLETED'] },
          createdAt: { gte: since },
          decision: { is: { cartMandate: { is: { intentMandate: { is: { userId } } } } } },
        },
      });
      return Number(result._sum.amountUsd ?? 0);
    },

    createCartWithDecision: ({ intentMandateId, userRequest, cart, decision }) =>
      db.$transaction(async (tx) => {
        const created = await tx.cartMandate.create({
          data: {
            intentMandateId,
            userRequest,
            itemsJson: cart.items,
            totalUsd: cart.total_usd,
            merchant: cart.merchant,
            source: cart.source,
            sourceUrl: cart.source_url ?? null,
          },
        });
        const saved = await tx.decision.create({
          data: {
            cartMandateId: created.id,
            result: decision.result,
            ruleHit: decision.ruleHit,
            intentScore: decision.intentScore,
            aiReason: decision.reason,
            decidedBy: 'system',
          },
        });
        await tx.auditLog.create({
          data: {
            entity: 'cart',
            entityId: created.id,
            event: 'cart.submitted',
            detailJson: { user_request: userRequest, merchant: cart.merchant, total_usd: cart.total_usd },
          },
        });
        await tx.auditLog.create({
          data: {
            entity: 'decision',
            entityId: saved.id,
            event: `decision.${decision.result.toLowerCase()}`,
            detailJson: { cart_id: created.id, rule_hit: decision.ruleHit, reason: decision.reason, intent_score: decision.intentScore },
          },
        });
        return { cartId: created.id, decisionId: saved.id };
      }),

    getCartForUser: (cartId, userId) =>
      db.cartMandate.findFirst({
        where: { id: cartId, intentMandate: { is: { userId } } },
        include: { decision: true },
      }),

    // Compare-and-set: only one request can move a decision out of HELD (stops double clicks)
    async transitionHeld(decisionId, data) {
      if (!decisionId) throw new Error('transitionHeld needs a decision id'); // never run an unfiltered updateMany
      const result = await db.decision.updateMany({ where: { id: decisionId, result: 'HELD' }, data });
      return result.count === 1;
    },

    createPayment: ({ decisionId, amountUsd }) =>
      db.payment.create({ data: { decisionId, amountUsd, status: 'PENDING' } }),

    completePayment: (paymentId, { orderId, captureId }) =>
      db.payment.update({
        where: { id: paymentId },
        data: { status: 'COMPLETED', paypalOrderId: orderId, paypalCaptureId: captureId, capturedAt: new Date() },
      }),

    failPayment: (paymentId) => db.payment.update({ where: { id: paymentId }, data: { status: 'FAILED' } }),

    logEvent: ({ entity, entityId, event, detail = null }) =>
      db.auditLog.create({ data: { entity, entityId: String(entityId), event, detailJson: detail } }),
  };
}