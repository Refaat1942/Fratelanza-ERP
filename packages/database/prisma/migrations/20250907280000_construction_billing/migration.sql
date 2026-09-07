-- Phase 9.8: Construction Billing

CREATE TYPE "ConstructionBillingStatus" AS ENUM ('draft', 'approved', 'posted', 'cancelled');

CREATE TABLE "construction_billings" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "progressId" UUID,
    "boqId" UUID,
    "salesInvoiceId" UUID,
    "number" TEXT NOT NULL,
    "status" "ConstructionBillingStatus" NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "grossAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "retentionAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "advanceRecoveryAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "netBillableAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "retentionPercent" DECIMAL(8,4),
    "advanceRecoveryPercent" DECIMAL(8,4),
    "sourceModule" TEXT NOT NULL DEFAULT 'construction',
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceEvent" TEXT NOT NULL DEFAULT 'bill',
    "idempotencyKey" TEXT,
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "postedAt" TIMESTAMP(3),
    "postedById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_billings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "construction_billing_lines" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "billingId" UUID NOT NULL,
    "progressItemId" UUID,
    "boqItemId" UUID,
    "variationId" UUID,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT NOT NULL,
    "grossAmount" DECIMAL(18,4) NOT NULL,
    "retentionAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "advanceRecoveryAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "netBillableAmount" DECIMAL(18,4) NOT NULL,
    "costCenterId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_billing_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "construction_billings_tenantId_number_key" ON "construction_billings"("tenantId", "number");
CREATE UNIQUE INDEX "construction_billings_tenantId_sourceModule_sourceType_sourceId_sourceEvent_key" ON "construction_billings"("tenantId", "sourceModule", "sourceType", "sourceId", "sourceEvent");
CREATE UNIQUE INDEX "construction_billings_salesInvoiceId_key" ON "construction_billings"("salesInvoiceId");
CREATE INDEX "construction_billings_tenantId_projectId_idx" ON "construction_billings"("tenantId", "projectId");
CREATE INDEX "construction_billings_tenantId_contractId_status_idx" ON "construction_billings"("tenantId", "contractId", "status");
CREATE INDEX "construction_billings_tenantId_progressId_idx" ON "construction_billings"("tenantId", "progressId");

CREATE UNIQUE INDEX "construction_billing_lines_tenantId_billingId_progressItemId_key" ON "construction_billing_lines"("tenantId", "billingId", "progressItemId");
CREATE INDEX "construction_billing_lines_tenantId_billingId_idx" ON "construction_billing_lines"("tenantId", "billingId");
CREATE INDEX "construction_billing_lines_tenantId_progressItemId_idx" ON "construction_billing_lines"("tenantId", "progressItemId");

ALTER TABLE "construction_billings" ADD CONSTRAINT "construction_billings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "construction_billings" ADD CONSTRAINT "construction_billings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "construction_billings" ADD CONSTRAINT "construction_billings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "construction_billings" ADD CONSTRAINT "construction_billings_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "construction_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "construction_billings" ADD CONSTRAINT "construction_billings_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "construction_progress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_billings" ADD CONSTRAINT "construction_billings_boqId_fkey" FOREIGN KEY ("boqId") REFERENCES "construction_boqs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_billings" ADD CONSTRAINT "construction_billings_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_billings" ADD CONSTRAINT "construction_billings_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_billings" ADD CONSTRAINT "construction_billings_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_billings" ADD CONSTRAINT "construction_billings_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_billings" ADD CONSTRAINT "construction_billings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "construction_billing_lines" ADD CONSTRAINT "construction_billing_lines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "construction_billing_lines" ADD CONSTRAINT "construction_billing_lines_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "construction_billings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "construction_billing_lines" ADD CONSTRAINT "construction_billing_lines_progressItemId_fkey" FOREIGN KEY ("progressItemId") REFERENCES "construction_progress_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_billing_lines" ADD CONSTRAINT "construction_billing_lines_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "construction_boq_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_billing_lines" ADD CONSTRAINT "construction_billing_lines_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "construction_variations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_billing_lines" ADD CONSTRAINT "construction_billing_lines_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
