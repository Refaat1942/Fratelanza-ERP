-- Phase 4.5.1: Commercial license hardening (perpetual model + signed payloads)

CREATE TYPE "LicenseType" AS ENUM ('perpetual', 'time_limited');
CREATE TYPE "EntitlementTermType" AS ENUM ('perpetual', 'time_limited');

ALTER TABLE "tenant_licenses"
  ADD COLUMN "licenseType" "LicenseType" NOT NULL DEFAULT 'perpetual',
  ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "payloadSignature" TEXT;

ALTER TABLE "license_module_entitlements"
  ADD COLUMN "termType" "EntitlementTermType" NOT NULL DEFAULT 'perpetual',
  ADD COLUMN "expiresAt" TIMESTAMP(3);
