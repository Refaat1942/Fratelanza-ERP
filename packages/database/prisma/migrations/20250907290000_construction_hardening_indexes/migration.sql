-- Phase 9.10: Construction hardening indexes for idempotency and source lookups

CREATE INDEX "construction_billings_tenantId_idempotencyKey_idx"
  ON "construction_billings" ("tenantId", "idempotencyKey");

CREATE INDEX "construction_material_issues_tenantId_sourceModule_sourceType_sourceId_sourceEvent_idx"
  ON "construction_material_issues" ("tenantId", "sourceModule", "sourceType", "sourceId", "sourceEvent");
