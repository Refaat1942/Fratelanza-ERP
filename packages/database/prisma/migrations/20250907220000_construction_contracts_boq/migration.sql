-- Phase 9.1: Construction Contracts + BOQ

CREATE TYPE "ConstructionContractDirection" AS ENUM ('customer', 'subcontractor');
CREATE TYPE "ConstructionContractPricingModel" AS ENUM ('lump_sum', 'unit_price', 'cost_plus', 'mixed');
CREATE TYPE "ConstructionContractStatus" AS ENUM ('draft', 'active', 'suspended', 'completed', 'cancelled', 'archived');
CREATE TYPE "ConstructionBoqStatus" AS ENUM ('draft', 'approved', 'superseded', 'archived');

CREATE TABLE "construction_contracts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "direction" "ConstructionContractDirection" NOT NULL,
    "partyId" UUID NOT NULL,
    "pricingModel" "ConstructionContractPricingModel" NOT NULL,
    "originalValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "revisedValue" DECIMAL(18,4),
    "originalValueLocked" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "startDate" DATE,
    "endDate" DATE,
    "retentionPercent" DECIMAL(8,4),
    "retentionCap" DECIMAL(18,4),
    "advanceAmount" DECIMAL(18,4),
    "advancePercent" DECIMAL(8,4),
    "paymentTerms" TEXT,
    "status" "ConstructionContractStatus" NOT NULL DEFAULT 'draft',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_contracts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "construction_boqs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "supersedesBoqId" UUID,
    "status" "ConstructionBoqStatus" NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "totalOriginalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_boqs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "construction_boq_sections" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "boqId" UUID NOT NULL,
    "parentSectionId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_boq_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "construction_boq_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "boqId" UUID NOT NULL,
    "sectionId" UUID,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "itemCode" TEXT,
    "description" TEXT NOT NULL,
    "unitId" UUID,
    "unitCode" TEXT,
    "plannedQuantity" DECIMAL(18,4) NOT NULL,
    "unitRate" DECIMAL(18,4) NOT NULL,
    "originalAmount" DECIMAL(18,4) NOT NULL,
    "costCode" TEXT,
    "costCenterId" UUID,
    "productId" UUID,
    "category" "ConstructionCostCategory",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_boq_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "construction_contracts_tenantId_number_key" ON "construction_contracts"("tenantId", "number");
CREATE INDEX "construction_contracts_tenantId_projectId_idx" ON "construction_contracts"("tenantId", "projectId");
CREATE INDEX "construction_contracts_tenantId_status_idx" ON "construction_contracts"("tenantId", "status");
CREATE INDEX "construction_contracts_tenantId_partyId_idx" ON "construction_contracts"("tenantId", "partyId");

CREATE UNIQUE INDEX "construction_boqs_tenantId_contractId_revisionNumber_key" ON "construction_boqs"("tenantId", "contractId", "revisionNumber");
CREATE INDEX "construction_boqs_tenantId_contractId_status_idx" ON "construction_boqs"("tenantId", "contractId", "status");
CREATE INDEX "construction_boqs_tenantId_number_idx" ON "construction_boqs"("tenantId", "number");
CREATE UNIQUE INDEX "construction_boqs_one_approved_per_contract" ON "construction_boqs"("tenantId", "contractId") WHERE ("status" = 'approved');

CREATE UNIQUE INDEX "construction_boq_sections_tenantId_boqId_code_key" ON "construction_boq_sections"("tenantId", "boqId", "code");
CREATE INDEX "construction_boq_sections_tenantId_boqId_sequence_idx" ON "construction_boq_sections"("tenantId", "boqId", "sequence");

CREATE INDEX "construction_boq_items_tenantId_boqId_lineNumber_idx" ON "construction_boq_items"("tenantId", "boqId", "lineNumber");
CREATE INDEX "construction_boq_items_tenantId_sectionId_idx" ON "construction_boq_items"("tenantId", "sectionId");

ALTER TABLE "construction_contracts" ADD CONSTRAINT "construction_contracts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "construction_contracts" ADD CONSTRAINT "construction_contracts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "construction_contracts" ADD CONSTRAINT "construction_contracts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "construction_contracts" ADD CONSTRAINT "construction_contracts_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "construction_contracts" ADD CONSTRAINT "construction_contracts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "construction_boqs" ADD CONSTRAINT "construction_boqs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "construction_boqs" ADD CONSTRAINT "construction_boqs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "construction_boqs" ADD CONSTRAINT "construction_boqs_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "construction_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "construction_boqs" ADD CONSTRAINT "construction_boqs_supersedesBoqId_fkey" FOREIGN KEY ("supersedesBoqId") REFERENCES "construction_boqs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_boqs" ADD CONSTRAINT "construction_boqs_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_boqs" ADD CONSTRAINT "construction_boqs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "construction_boq_sections" ADD CONSTRAINT "construction_boq_sections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "construction_boq_sections" ADD CONSTRAINT "construction_boq_sections_boqId_fkey" FOREIGN KEY ("boqId") REFERENCES "construction_boqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "construction_boq_sections" ADD CONSTRAINT "construction_boq_sections_parentSectionId_fkey" FOREIGN KEY ("parentSectionId") REFERENCES "construction_boq_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "construction_boq_items" ADD CONSTRAINT "construction_boq_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "construction_boq_items" ADD CONSTRAINT "construction_boq_items_boqId_fkey" FOREIGN KEY ("boqId") REFERENCES "construction_boqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "construction_boq_items" ADD CONSTRAINT "construction_boq_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "construction_boq_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_boq_items" ADD CONSTRAINT "construction_boq_items_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units_of_measure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_boq_items" ADD CONSTRAINT "construction_boq_items_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_boq_items" ADD CONSTRAINT "construction_boq_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
