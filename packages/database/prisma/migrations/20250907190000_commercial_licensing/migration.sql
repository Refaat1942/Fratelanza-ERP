-- Phase 4.5: Commercial Licensing & Module Entitlements (additive)

CREATE TYPE "LicenseStatus" AS ENUM ('pending', 'active', 'grace', 'expired', 'suspended', 'revoked');
CREATE TYPE "LicenseEdition" AS ENUM ('starter', 'professional', 'business', 'enterprise');

CREATE TABLE "tenant_licenses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "licenseKey" TEXT NOT NULL,
  "edition" "LicenseEdition" NOT NULL DEFAULT 'business',
  "status" "LicenseStatus" NOT NULL DEFAULT 'pending',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "graceEndsAt" TIMESTAMP(3),
  "maxUsers" INTEGER NOT NULL DEFAULT 25,
  "maxBranches" INTEGER NOT NULL DEFAULT 5,
  "maxDevices" INTEGER NOT NULL DEFAULT 10,
  "maxStorageMb" INTEGER,
  "installationId" TEXT,
  "payloadDigest" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_licenses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "license_module_entitlements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "licenseId" UUID NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "license_module_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "license_feature_entitlements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "licenseId" UUID NOT NULL,
  "featureKey" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "license_feature_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_licenses_tenantId_key" ON "tenant_licenses"("tenantId");
CREATE UNIQUE INDEX "tenant_licenses_licenseKey_key" ON "tenant_licenses"("licenseKey");
CREATE INDEX "tenant_licenses_tenantId_status_idx" ON "tenant_licenses"("tenantId", "status");

CREATE UNIQUE INDEX "license_module_entitlements_licenseId_moduleKey_key"
  ON "license_module_entitlements"("licenseId", "moduleKey");
CREATE UNIQUE INDEX "license_module_entitlements_tenantId_moduleKey_key"
  ON "license_module_entitlements"("tenantId", "moduleKey");
CREATE INDEX "license_module_entitlements_tenantId_isEnabled_idx"
  ON "license_module_entitlements"("tenantId", "isEnabled");

CREATE UNIQUE INDEX "license_feature_entitlements_licenseId_featureKey_key"
  ON "license_feature_entitlements"("licenseId", "featureKey");
CREATE UNIQUE INDEX "license_feature_entitlements_tenantId_featureKey_key"
  ON "license_feature_entitlements"("tenantId", "featureKey");
CREATE INDEX "license_feature_entitlements_tenantId_isEnabled_idx"
  ON "license_feature_entitlements"("tenantId", "isEnabled");

ALTER TABLE "tenant_licenses"
  ADD CONSTRAINT "tenant_licenses_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "license_module_entitlements"
  ADD CONSTRAINT "license_module_entitlements_licenseId_fkey"
  FOREIGN KEY ("licenseId") REFERENCES "tenant_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "license_feature_entitlements"
  ADD CONSTRAINT "license_feature_entitlements_licenseId_fkey"
  FOREIGN KEY ("licenseId") REFERENCES "tenant_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
