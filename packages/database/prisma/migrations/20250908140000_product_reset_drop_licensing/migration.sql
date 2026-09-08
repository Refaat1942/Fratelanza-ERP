-- Product reset: remove commercial licensing tables (evaluation build)
DROP TABLE IF EXISTS "license_feature_entitlements";
DROP TABLE IF EXISTS "license_module_entitlements";
DROP TABLE IF EXISTS "tenant_licenses";
DROP TABLE IF EXISTS "tenant_modules";

DROP TYPE IF EXISTS "LicenseEdition";
DROP TYPE IF EXISTS "EntitlementTermType";
DROP TYPE IF EXISTS "LicenseType";
DROP TYPE IF EXISTS "LicenseStatus";
