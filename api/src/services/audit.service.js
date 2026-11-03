// Path: api/src/services/audit.service.js
// Every important event goes here; the AG Grid audit trail reads this table.

export function logEvent(db, { entity, entityId, event, detail = null }) {
  return db.auditLog.create({
    data: { entity, entityId: String(entityId), event, detailJson: detail },
  });
}