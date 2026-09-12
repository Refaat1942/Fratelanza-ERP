-- Platform SaaS schema additions
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

ALTER TABLE "tenants"
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "businessType" TEXT,
  ADD COLUMN "country" TEXT NOT NULL DEFAULT 'SA',
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'SAR',
  ADD COLUMN "language" TEXT NOT NULL DEFAULT 'ar',
  ADD COLUMN "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "demoSlug" TEXT;

CREATE UNIQUE INDEX "tenants_demoSlug_key" ON "tenants"("demoSlug");

ALTER TABLE "users"
  ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "demo_environments" (
  "id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tenantId" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "modules" JSONB NOT NULL DEFAULT '[]',
  "demoUserId" UUID,
  "restrictions" JSONB NOT NULL DEFAULT '{}',
  "linkToken" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "demo_environments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "demo_environments_slug_key" ON "demo_environments"("slug");
CREATE UNIQUE INDEX "demo_environments_tenantId_key" ON "demo_environments"("tenantId");
CREATE UNIQUE INDEX "demo_environments_linkToken_key" ON "demo_environments"("linkToken");

ALTER TABLE "demo_environments"
  ADD CONSTRAINT "demo_environments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "demo_environments"
  ADD CONSTRAINT "demo_environments_demoUserId_fkey"
  FOREIGN KEY ("demoUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "tenant_module_access" (
  "tenantId" UUID NOT NULL,
  "moduleId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "tenant_module_access_pkey" PRIMARY KEY ("tenantId","moduleId")
);

ALTER TABLE "tenant_module_access"
  ADD CONSTRAINT "tenant_module_access_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
