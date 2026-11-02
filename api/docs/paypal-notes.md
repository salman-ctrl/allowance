# PayPal spike notes (2 Nov 2026)
- Vault v3 works in sandbox with US accounts
- Flow: setup-token -> buyer approves once -> payment-token -> orders with vault_id
- Order with vault_id returns COMPLETED on create, no capture call needed
- App feature "Save payment methods" must be enabled