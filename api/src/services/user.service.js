// Path: api/src/services/user.service.js
// The demo has one user. Multi-user login is out of scope for the hackathon.

export const DEMO_USER_EMAIL = 'demo@allowance.dev';

export function getDemoUser(db, { paymentTokenId = null, customerId = null } = {}) {
  return db.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: {
      name: 'Demo User',
      email: DEMO_USER_EMAIL,
      paypalPaymentTokenId: paymentTokenId,
      paypalCustomerId: customerId,
    },
  });
}