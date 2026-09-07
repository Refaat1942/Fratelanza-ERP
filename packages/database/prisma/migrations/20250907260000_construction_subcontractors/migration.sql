-- CreateEnum
CREATE TYPE "ConstructionSubcontractorProfileStatus" AS ENUM ('active', 'inactive', 'suspended');

-- CreateEnum
CREATE TYPE "ConstructionSubcontractorAssignmentStatus" AS ENUM ('active', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "construction_subcontractor_profiles" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "trade" TEXT,
    "specialty" TEXT,
    "complianceNotes" TEXT,
    "status" "ConstructionSubcontractorProfileStatus" NOT NULL DEFAULT 'active',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_subcontractor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_subcontractor_assignments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "contractId" UUID,
    "status" "ConstructionSubcontractorAssignmentStatus" NOT NULL DEFAULT 'active',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_subcontractor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "construction_subcontractor_profiles_tenantId_partyId_key" ON "construction_subcontractor_profiles"("tenantId", "partyId");

-- CreateIndex
CREATE INDEX "construction_subcontractor_profiles_tenantId_status_idx" ON "construction_subcontractor_profiles"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "construction_subcontractor_assignments_tenantId_profileId_pr_key" ON "construction_subcontractor_assignments"("tenantId", "profileId", "projectId", "contractId");

-- CreateIndex
CREATE UNIQUE INDEX "construction_subcontractor_assignments_project_only_key" ON "construction_subcontractor_assignments"("tenantId", "profileId", "projectId") WHERE "contractId" IS NULL;

-- CreateIndex
CREATE INDEX "construction_subcontractor_assignments_tenantId_projectId_idx" ON "construction_subcontractor_assignments"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "construction_subcontractor_assignments_tenantId_contractId_idx" ON "construction_subcontractor_assignments"("tenantId", "contractId");

-- CreateIndex
CREATE INDEX "construction_subcontractor_assignments_tenantId_profileId_idx" ON "construction_subcontractor_assignments"("tenantId", "profileId");

-- AddForeignKey
ALTER TABLE "construction_subcontractor_profiles" ADD CONSTRAINT "construction_subcontractor_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_subcontractor_profiles" ADD CONSTRAINT "construction_subcontractor_profiles_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_subcontractor_profiles" ADD CONSTRAINT "construction_subcontractor_profiles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_subcontractor_assignments" ADD CONSTRAINT "construction_subcontractor_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_subcontractor_assignments" ADD CONSTRAINT "construction_subcontractor_assignments_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "construction_subcontractor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_subcontractor_assignments" ADD CONSTRAINT "construction_subcontractor_assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_subcontractor_assignments" ADD CONSTRAINT "construction_subcontractor_assignments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "construction_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_subcontractor_assignments" ADD CONSTRAINT "construction_subcontractor_assignments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
