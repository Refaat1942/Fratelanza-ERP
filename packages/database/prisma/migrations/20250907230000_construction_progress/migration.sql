-- Phase 9.2: Construction Progress

CREATE TYPE "ConstructionProgressStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'archived');

CREATE TABLE "construction_progress" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "boqId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "status" "ConstructionProgressStatus" NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "totalCurrentAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalCumulativeAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "rejectedAt" TIMESTAMP(3),
    "rejectedById" UUID,
    "rejectionReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "construction_progress_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "progressId" UUID NOT NULL,
    "boqItemId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "currentPeriodQuantity" DECIMAL(18,4) NOT NULL,
    "previousCumulativeQuantity" DECIMAL(18,4) NOT NULL,
    "cumulativeQuantity" DECIMAL(18,4) NOT NULL,
    "unitRateSnapshot" DECIMAL(18,4) NOT NULL,
    "currentPeriodAmount" DECIMAL(18,4) NOT NULL,
    "cumulativeAmount" DECIMAL(18,4) NOT NULL,
    "costCenterId" UUID,
    "costCode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_progress_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "construction_progress_tenantId_contractId_boqId_periodFrom_periodTo_key" ON "construction_progress"("tenantId", "contractId", "boqId", "periodFrom", "periodTo");
CREATE INDEX "construction_progress_tenantId_projectId_idx" ON "construction_progress"("tenantId", "projectId");
CREATE INDEX "construction_progress_tenantId_contractId_status_idx" ON "construction_progress"("tenantId", "contractId", "status");
CREATE INDEX "construction_progress_tenantId_boqId_idx" ON "construction_progress"("tenantId", "boqId");

CREATE UNIQUE INDEX "construction_progress_items_tenantId_progressId_boqItemId_key" ON "construction_progress_items"("tenantId", "progressId", "boqItemId");
CREATE INDEX "construction_progress_items_tenantId_boqItemId_idx" ON "construction_progress_items"("tenantId", "boqItemId");

ALTER TABLE "construction_progress" ADD CONSTRAINT "construction_progress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "construction_progress" ADD CONSTRAINT "construction_progress_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "construction_progress" ADD CONSTRAINT "construction_progress_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "construction_progress" ADD CONSTRAINT "construction_progress_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "construction_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "construction_progress" ADD CONSTRAINT "construction_progress_boqId_fkey" FOREIGN KEY ("boqId") REFERENCES "construction_boqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "construction_progress" ADD CONSTRAINT "construction_progress_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_progress" ADD CONSTRAINT "construction_progress_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_progress" ADD CONSTRAINT "construction_progress_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_progress" ADD CONSTRAINT "construction_progress_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "construction_progress_items" ADD CONSTRAINT "construction_progress_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "construction_progress_items" ADD CONSTRAINT "construction_progress_items_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "construction_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "construction_progress_items" ADD CONSTRAINT "construction_progress_items_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "construction_boq_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "construction_progress_items" ADD CONSTRAINT "construction_progress_items_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
