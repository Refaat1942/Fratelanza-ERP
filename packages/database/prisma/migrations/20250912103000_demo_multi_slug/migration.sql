DROP INDEX IF EXISTS "demo_environments_tenantId_key";
CREATE INDEX IF NOT EXISTS "demo_environments_tenantId_idx" ON "demo_environments"("tenantId");
