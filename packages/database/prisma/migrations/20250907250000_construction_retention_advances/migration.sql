-- CreateEnum
CREATE TYPE "ConstructionSubledgerPartyType" AS ENUM ('customer', 'subcontractor');

-- CreateEnum
CREATE TYPE "ConstructionRetentionDirection" AS ENUM ('hold', 'release');

-- CreateEnum
CREATE TYPE "ConstructionRetentionSourceEvent" AS ENUM ('hold', 'release');

-- CreateEnum
CREATE TYPE "ConstructionAdvanceEntryType" AS ENUM ('received', 'recovered', 'adjustment');

-- CreateTable
CREATE TABLE "construction_retention_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "partyType" "ConstructionSubledgerPartyType" NOT NULL,
    "direction" "ConstructionRetentionDirection" NOT NULL,
    "sourceModule" TEXT NOT NULL DEFAULT 'construction',
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID,
    "sourceEvent" "ConstructionRetentionSourceEvent" NOT NULL,
    "grossBaseAmount" DECIMAL(18,4),
    "retentionPercentSnapshot" DECIMAL(8,4),
    "amount" DECIMAL(18,4) NOT NULL,
    "balanceAfter" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "construction_retention_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_advance_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "partyType" "ConstructionSubledgerPartyType" NOT NULL,
    "entryType" "ConstructionAdvanceEntryType" NOT NULL,
    "sourceModule" TEXT NOT NULL DEFAULT 'construction',
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID,
    "sourceEvent" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "balanceAfter" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "construction_advance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "construction_retention_entries_tenantId_sourceModule_sourceTy_key" ON "construction_retention_entries"("tenantId", "sourceModule", "sourceType", "sourceId", "sourceEvent", "partyType");

-- CreateIndex
CREATE INDEX "construction_retention_entries_tenantId_contractId_partyType_c_idx" ON "construction_retention_entries"("tenantId", "contractId", "partyType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "construction_advance_entries_tenantId_sourceModule_sourceType_key" ON "construction_advance_entries"("tenantId", "sourceModule", "sourceType", "sourceId", "sourceEvent", "partyType");

-- CreateIndex
CREATE INDEX "construction_advance_entries_tenantId_contractId_partyType_cr_idx" ON "construction_advance_entries"("tenantId", "contractId", "partyType", "createdAt");

-- AddForeignKey
ALTER TABLE "construction_retention_entries" ADD CONSTRAINT "construction_retention_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_retention_entries" ADD CONSTRAINT "construction_retention_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_retention_entries" ADD CONSTRAINT "construction_retention_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_retention_entries" ADD CONSTRAINT "construction_retention_entries_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "construction_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_retention_entries" ADD CONSTRAINT "construction_retention_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_advance_entries" ADD CONSTRAINT "construction_advance_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_advance_entries" ADD CONSTRAINT "construction_advance_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_advance_entries" ADD CONSTRAINT "construction_advance_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_advance_entries" ADD CONSTRAINT "construction_advance_entries_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "construction_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_advance_entries" ADD CONSTRAINT "construction_advance_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
