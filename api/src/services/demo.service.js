// Path: api/src/services/demo.service.js
// Puts the demo back to a clean state, for testing, for recording the video, and for judges.
// Keeps the user, the PayPal vault token and the active mandate. Removes every cart,
// decision, payment and audit row of that user, so the budget starts at $0 again.
// Sandbox money already sent through PayPal is not refunded; it is fake money anyway.

export async function resetDemo({ userId }, { db }) {
  const ownedBy = { intentMandate: { is: { userId } } };

  const counts = await db.$transaction(async (tx) => {
    const carts = await tx.cartMandate.findMany({ where: ownedBy, select: { id: true } });
    const cartIds = carts.map((c) => c.id);

    // Children first: payment -> decision -> cart (foreign keys)
    const payments = await tx.payment.deleteMany({
      where: { decision: { is: { cartMandateId: { in: cartIds } } } },
    });
    const decisions = await tx.decision.deleteMany({ where: { cartMandateId: { in: cartIds } } });
    const cartRows = await tx.cartMandate.deleteMany({ where: { id: { in: cartIds } } });
    const audit = await tx.auditLog.deleteMany({ where: { entity: { in: ['cart', 'decision', 'payment', 'demo'] } } });

    await tx.auditLog.create({
      data: { entity: 'demo', entityId: userId, event: 'demo.reset', detailJson: { carts_removed: cartRows.count } },
    });

    return { carts: cartRows.count, decisions: decisions.count, payments: payments.count, auditRows: audit.count };
  });

  return { ok: true, removed: counts };
}