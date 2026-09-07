-- Phase 3: Universal Party & Business Contacts (additive)

CREATE TYPE "PartyType" AS ENUM ('individual', 'organization');
CREATE TYPE "PartyStatus" AS ENUM ('active', 'archived');
CREATE TYPE "PartyRoleType" AS ENUM ('customer', 'supplier');
CREATE TYPE "PartyAddressType" AS ENUM ('billing', 'shipping', 'office', 'home', 'other');
CREATE TYPE "PartyIdentifierType" AS ENUM ('tax_id', 'vat', 'commercial_registration', 'national_id', 'other');

ALTER TABLE "customers"
  ADD COLUMN "partyId" UUID;

ALTER TABLE "suppliers"
  ADD COLUMN "partyId" UUID;

CREATE TABLE "parties" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "type" "PartyType" NOT NULL,
  "code" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "legalName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "notes" TEXT,
  "status" "PartyStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "party_roles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "partyId" UUID NOT NULL,
  "role" "PartyRoleType" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "party_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "party_contacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "partyId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "title" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "mobile" TEXT,
  "notes" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "party_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "party_addresses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "partyId" UUID NOT NULL,
  "type" "PartyAddressType" NOT NULL DEFAULT 'office',
  "line1" TEXT NOT NULL,
  "line2" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postalCode" TEXT,
  "country" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "party_addresses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "party_identifiers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "partyId" UUID NOT NULL,
  "type" "PartyIdentifierType" NOT NULL,
  "value" TEXT NOT NULL,
  "country" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "party_identifiers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_partyId_key" ON "customers"("partyId");
CREATE UNIQUE INDEX "suppliers_partyId_key" ON "suppliers"("partyId");
CREATE UNIQUE INDEX "parties_tenantId_code_key" ON "parties"("tenantId", "code");
CREATE INDEX "parties_tenantId_displayName_idx" ON "parties"("tenantId", "displayName");
CREATE INDEX "parties_tenantId_status_idx" ON "parties"("tenantId", "status");
CREATE INDEX "parties_tenantId_type_idx" ON "parties"("tenantId", "type");
CREATE UNIQUE INDEX "party_roles_tenantId_partyId_role_key" ON "party_roles"("tenantId", "partyId", "role");
CREATE INDEX "party_roles_tenantId_role_idx" ON "party_roles"("tenantId", "role");
CREATE INDEX "party_roles_partyId_idx" ON "party_roles"("partyId");
CREATE INDEX "party_contacts_tenantId_partyId_idx" ON "party_contacts"("tenantId", "partyId");
CREATE INDEX "party_addresses_tenantId_partyId_idx" ON "party_addresses"("tenantId", "partyId");
CREATE UNIQUE INDEX "party_identifiers_tenantId_type_value_key" ON "party_identifiers"("tenantId", "type", "value");
CREATE INDEX "party_identifiers_tenantId_partyId_idx" ON "party_identifiers"("tenantId", "partyId");

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_partyId_fkey"
  FOREIGN KEY ("partyId") REFERENCES "parties"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_partyId_fkey"
  FOREIGN KEY ("partyId") REFERENCES "parties"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "parties"
  ADD CONSTRAINT "parties_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "party_roles"
  ADD CONSTRAINT "party_roles_partyId_fkey"
  FOREIGN KEY ("partyId") REFERENCES "parties"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "party_contacts"
  ADD CONSTRAINT "party_contacts_partyId_fkey"
  FOREIGN KEY ("partyId") REFERENCES "parties"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "party_addresses"
  ADD CONSTRAINT "party_addresses_partyId_fkey"
  FOREIGN KEY ("partyId") REFERENCES "parties"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "party_identifiers"
  ADD CONSTRAINT "party_identifiers_partyId_fkey"
  FOREIGN KEY ("partyId") REFERENCES "parties"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
