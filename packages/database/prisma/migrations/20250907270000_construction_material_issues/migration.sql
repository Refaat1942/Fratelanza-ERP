-- CreateEnum
CREATE TYPE "ConstructionMaterialIssueStatus" AS ENUM ('draft', 'issued', 'cancelled');

-- CreateTable
CREATE TABLE "construction_material_issues" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ConstructionMaterialIssueStatus" NOT NULL DEFAULT 'draft',
    "boqItemId" UUID,
    "costCenterId" UUID,
    "issueDate" DATE,
    "notes" TEXT,
    "sourceModule" TEXT,
    "sourceType" TEXT,
    "sourceId" UUID,
    "sourceEvent" TEXT,
    "totalCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3),
    "issuedById" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_material_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_material_issue_lines" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "costCenterId" UUID,
    "inventoryMovementId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_material_issue_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "construction_material_issues_tenantId_number_key" ON "construction_material_issues"("tenantId", "number");

-- CreateIndex
CREATE INDEX "construction_material_issues_tenantId_projectId_status_idx" ON "construction_material_issues"("tenantId", "projectId", "status");

-- CreateIndex
CREATE INDEX "construction_material_issues_tenantId_warehouseId_idx" ON "construction_material_issues"("tenantId", "warehouseId");

-- CreateIndex
CREATE INDEX "construction_material_issues_tenantId_boqItemId_idx" ON "construction_material_issues"("tenantId", "boqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "construction_material_issues_source_identity_key" ON "construction_material_issues"("tenantId", "sourceModule", "sourceType", "sourceId", "sourceEvent") WHERE "sourceModule" IS NOT NULL AND "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL AND "sourceEvent" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "construction_material_issue_lines_inventoryMovementId_key" ON "construction_material_issue_lines"("inventoryMovementId");

-- CreateIndex
CREATE INDEX "construction_material_issue_lines_tenantId_issueId_idx" ON "construction_material_issue_lines"("tenantId", "issueId");

-- CreateIndex
CREATE INDEX "construction_material_issue_lines_tenantId_productId_idx" ON "construction_material_issue_lines"("tenantId", "productId");

-- AddForeignKey
ALTER TABLE "construction_material_issues" ADD CONSTRAINT "construction_material_issues_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_material_issues" ADD CONSTRAINT "construction_material_issues_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_material_issues" ADD CONSTRAINT "construction_material_issues_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_material_issues" ADD CONSTRAINT "construction_material_issues_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_material_issues" ADD CONSTRAINT "construction_material_issues_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "construction_boq_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_material_issues" ADD CONSTRAINT "construction_material_issues_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_material_issues" ADD CONSTRAINT "construction_material_issues_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_material_issues" ADD CONSTRAINT "construction_material_issues_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_material_issue_lines" ADD CONSTRAINT "construction_material_issue_lines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_material_issue_lines" ADD CONSTRAINT "construction_material_issue_lines_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "construction_material_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_material_issue_lines" ADD CONSTRAINT "construction_material_issue_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_material_issue_lines" ADD CONSTRAINT "construction_material_issue_lines_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_material_issue_lines" ADD CONSTRAINT "construction_material_issue_lines_inventoryMovementId_fkey" FOREIGN KEY ("inventoryMovementId") REFERENCES "inventory_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
