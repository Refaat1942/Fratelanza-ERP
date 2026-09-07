-- CreateEnum
CREATE TYPE "ConstructionVariationType" AS ENUM ('quantity_change', 'rate_change', 'omission', 'addition', 'lump_sum');

-- CreateEnum
CREATE TYPE "ConstructionVariationStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'archived');

-- CreateTable
CREATE TABLE "construction_variations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "boqId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ConstructionVariationStatus" NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "totalAmountDelta" DECIMAL(18,4) NOT NULL DEFAULT 0,
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

    CONSTRAINT "construction_variations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_variation_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "variationId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "variationType" "ConstructionVariationType" NOT NULL,
    "boqItemId" UUID,
    "description" TEXT,
    "quantityDelta" DECIMAL(18,4),
    "rateDelta" DECIMAL(18,4),
    "lumpSumAmount" DECIMAL(18,4),
    "amountDelta" DECIMAL(18,4) NOT NULL,
    "costCenterId" UUID,
    "costCode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_variation_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "construction_variations_tenantId_number_key" ON "construction_variations"("tenantId", "number");

-- CreateIndex
CREATE INDEX "construction_variations_tenantId_contractId_status_idx" ON "construction_variations"("tenantId", "contractId", "status");

-- CreateIndex
CREATE INDEX "construction_variations_tenantId_boqId_idx" ON "construction_variations"("tenantId", "boqId");

-- CreateIndex
CREATE INDEX "construction_variation_items_tenantId_variationId_lineNumber_idx" ON "construction_variation_items"("tenantId", "variationId", "lineNumber");

-- CreateIndex
CREATE INDEX "construction_variation_items_tenantId_boqItemId_idx" ON "construction_variation_items"("tenantId", "boqItemId");

-- AddForeignKey
ALTER TABLE "construction_variations" ADD CONSTRAINT "construction_variations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_variations" ADD CONSTRAINT "construction_variations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_variations" ADD CONSTRAINT "construction_variations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_variations" ADD CONSTRAINT "construction_variations_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "construction_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_variations" ADD CONSTRAINT "construction_variations_boqId_fkey" FOREIGN KEY ("boqId") REFERENCES "construction_boqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_variations" ADD CONSTRAINT "construction_variations_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_variations" ADD CONSTRAINT "construction_variations_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_variations" ADD CONSTRAINT "construction_variations_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_variations" ADD CONSTRAINT "construction_variations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_variation_items" ADD CONSTRAINT "construction_variation_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_variation_items" ADD CONSTRAINT "construction_variation_items_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "construction_variations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_variation_items" ADD CONSTRAINT "construction_variation_items_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "construction_boq_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_variation_items" ADD CONSTRAINT "construction_variation_items_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
