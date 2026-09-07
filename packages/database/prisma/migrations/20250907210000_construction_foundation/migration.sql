-- AlterEnum
ALTER TYPE "PartyRoleType" ADD VALUE 'contractor';
ALTER TYPE "PartyRoleType" ADD VALUE 'subcontractor';

-- CreateEnum
CREATE TYPE "ConstructionCostCategory" AS ENUM ('material', 'labor', 'subcontract', 'equipment', 'other');

-- CreateTable
CREATE TABLE "construction_project_profiles" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_project_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_cost_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "costCenterId" UUID,
    "category" "ConstructionCostCategory" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "sourceModule" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceEvent" TEXT NOT NULL,
    "description" TEXT,
    "occurredAt" DATE NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "construction_cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "construction_project_profiles_projectId_key" ON "construction_project_profiles"("projectId");

-- CreateIndex
CREATE INDEX "construction_project_profiles_tenantId_idx" ON "construction_project_profiles"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "construction_project_profiles_tenantId_projectId_key" ON "construction_project_profiles"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "construction_cost_entries_tenantId_projectId_occurredAt_idx" ON "construction_cost_entries"("tenantId", "projectId", "occurredAt");

-- CreateIndex
CREATE INDEX "construction_cost_entries_tenantId_costCenterId_idx" ON "construction_cost_entries"("tenantId", "costCenterId");

-- CreateIndex
CREATE UNIQUE INDEX "construction_cost_entries_tenantId_sourceModule_sourceType_s_key" ON "construction_cost_entries"("tenantId", "sourceModule", "sourceType", "sourceId", "sourceEvent");

-- AddForeignKey
ALTER TABLE "construction_project_profiles" ADD CONSTRAINT "construction_project_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_project_profiles" ADD CONSTRAINT "construction_project_profiles_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_project_profiles" ADD CONSTRAINT "construction_project_profiles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_cost_entries" ADD CONSTRAINT "construction_cost_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_cost_entries" ADD CONSTRAINT "construction_cost_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_cost_entries" ADD CONSTRAINT "construction_cost_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_cost_entries" ADD CONSTRAINT "construction_cost_entries_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_cost_entries" ADD CONSTRAINT "construction_cost_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
