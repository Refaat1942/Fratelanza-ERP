-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('stripe', 'paymob', 'manual');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'suspended');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'yearly');

-- CreateEnum
CREATE TYPE "SubscriptionInvoiceStatus" AS ENUM ('draft', 'open', 'paid', 'void', 'uncollectible');

-- CreateEnum
CREATE TYPE "CustodyType" AS ENUM ('cash', 'asset', 'mixed');

-- CreateEnum
CREATE TYPE "CustodyStatus" AS ENUM ('active', 'partially_settled', 'settled', 'overdue', 'written_off');

-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('draft', 'planned', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('draft', 'posted');

-- CreateEnum
CREATE TYPE "DispatchNoteStatus" AS ENUM ('draft', 'posted');

-- CreateTable
CREATE TABLE "saas_plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMonthly" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "priceYearly" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "maxUsers" INTEGER,
    "maxBranches" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saas_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_plan_modules" (
    "planId" UUID NOT NULL,
    "moduleId" TEXT NOT NULL,

    CONSTRAINT "saas_plan_modules_pkey" PRIMARY KEY ("planId","moduleId")
);

-- CreateTable
CREATE TABLE "saas_subscriptions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'monthly',
    "provider" "BillingProvider" NOT NULL DEFAULT 'manual',
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "seats" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saas_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_subscription_invoices" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "providerInvoiceId" TEXT,
    "providerPaymentId" TEXT,
    "status" "SubscriptionInvoiceStatus" NOT NULL DEFAULT 'draft',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "hostedInvoiceUrl" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saas_subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_billing_webhook_events" (
    "id" UUID NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saas_billing_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_records" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "number" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "assetId" UUID,
    "type" "CustodyType" NOT NULL,
    "cashAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currencyCode" TEXT,
    "purpose" TEXT,
    "status" "CustodyStatus" NOT NULL DEFAULT 'active',
    "issuedById" UUID,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "settledAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custody_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_settlements" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "custodyId" UUID NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL DEFAULT 'cash_return',
    "settledById" UUID,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_bill_of_materials" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "outputQuantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mfg_bill_of_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_bom_components" (
    "id" UUID NOT NULL,
    "bomId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "scrapPercent" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "mfg_bom_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_production_orders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "warehouseId" UUID NOT NULL,
    "bomId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'draft',
    "plannedQuantity" DECIMAL(18,4) NOT NULL,
    "completedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mfg_production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_production_material_consumption" (
    "id" UUID NOT NULL,
    "productionOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "plannedQuantity" DECIMAL(18,4) NOT NULL,
    "consumedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "inventoryMovementId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfg_production_material_consumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_goods_receipt_notes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "warehouseId" UUID NOT NULL,
    "purchaseOrderId" UUID,
    "number" TEXT NOT NULL,
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'draft',
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_goods_receipt_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_goods_receipt_lines" (
    "id" UUID NOT NULL,
    "grnId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "purchaseOrderLineId" UUID,
    "orderedQuantity" DECIMAL(18,4),
    "receivedQuantity" DECIMAL(18,4) NOT NULL,
    "rejectedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "inventoryMovementId" UUID,
    "notes" TEXT,

    CONSTRAINT "inv_goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_dispatch_notes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "warehouseId" UUID NOT NULL,
    "salesInvoiceId" UUID,
    "number" TEXT NOT NULL,
    "status" "DispatchNoteStatus" NOT NULL DEFAULT 'draft',
    "dispatchDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedById" UUID,
    "deliveryAddress" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_dispatch_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_dispatch_note_lines" (
    "id" UUID NOT NULL,
    "dispatchNoteId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "salesInvoiceLineId" UUID,
    "orderedQuantity" DECIMAL(18,4),
    "dispatchedQuantity" DECIMAL(18,4) NOT NULL,
    "inventoryMovementId" UUID,
    "notes" TEXT,

    CONSTRAINT "inv_dispatch_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saas_plans_code_key" ON "saas_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "saas_subscriptions_tenantId_key" ON "saas_subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "saas_subscriptions_planId_idx" ON "saas_subscriptions"("planId");

-- CreateIndex
CREATE INDEX "saas_subscriptions_status_idx" ON "saas_subscriptions"("status");

-- CreateIndex
CREATE INDEX "saas_subscription_invoices_tenantId_idx" ON "saas_subscription_invoices"("tenantId");

-- CreateIndex
CREATE INDEX "saas_subscription_invoices_subscriptionId_idx" ON "saas_subscription_invoices"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "saas_billing_webhook_events_providerEventId_key" ON "saas_billing_webhook_events"("providerEventId");

-- CreateIndex
CREATE INDEX "saas_billing_webhook_events_provider_eventType_idx" ON "saas_billing_webhook_events"("provider", "eventType");

-- CreateIndex
CREATE INDEX "custody_records_tenantId_employeeId_status_idx" ON "custody_records"("tenantId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "custody_records_tenantId_status_idx" ON "custody_records"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "custody_records_tenantId_number_key" ON "custody_records"("tenantId", "number");

-- CreateIndex
CREATE INDEX "custody_settlements_tenantId_custodyId_idx" ON "custody_settlements"("tenantId", "custodyId");

-- CreateIndex
CREATE INDEX "mfg_bill_of_materials_tenantId_productId_idx" ON "mfg_bill_of_materials"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "mfg_bill_of_materials_tenantId_productId_version_key" ON "mfg_bill_of_materials"("tenantId", "productId", "version");

-- CreateIndex
CREATE INDEX "mfg_bom_components_bomId_idx" ON "mfg_bom_components"("bomId");

-- CreateIndex
CREATE INDEX "mfg_production_orders_tenantId_status_idx" ON "mfg_production_orders"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "mfg_production_orders_tenantId_number_key" ON "mfg_production_orders"("tenantId", "number");

-- CreateIndex
CREATE INDEX "mfg_production_material_consumption_productionOrderId_idx" ON "mfg_production_material_consumption"("productionOrderId");

-- CreateIndex
CREATE INDEX "inv_goods_receipt_notes_tenantId_status_idx" ON "inv_goods_receipt_notes"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inv_goods_receipt_notes_tenantId_number_key" ON "inv_goods_receipt_notes"("tenantId", "number");

-- CreateIndex
CREATE INDEX "inv_goods_receipt_lines_grnId_idx" ON "inv_goods_receipt_lines"("grnId");

-- CreateIndex
CREATE INDEX "inv_dispatch_notes_tenantId_status_idx" ON "inv_dispatch_notes"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inv_dispatch_notes_tenantId_number_key" ON "inv_dispatch_notes"("tenantId", "number");

-- CreateIndex
CREATE INDEX "inv_dispatch_note_lines_dispatchNoteId_idx" ON "inv_dispatch_note_lines"("dispatchNoteId");

-- AddForeignKey
ALTER TABLE "saas_plan_modules" ADD CONSTRAINT "saas_plan_modules_planId_fkey" FOREIGN KEY ("planId") REFERENCES "saas_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_subscriptions" ADD CONSTRAINT "saas_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_subscriptions" ADD CONSTRAINT "saas_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "saas_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_subscription_invoices" ADD CONSTRAINT "saas_subscription_invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "saas_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_records" ADD CONSTRAINT "custody_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_records" ADD CONSTRAINT "custody_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_settlements" ADD CONSTRAINT "custody_settlements_custodyId_fkey" FOREIGN KEY ("custodyId") REFERENCES "custody_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_bill_of_materials" ADD CONSTRAINT "mfg_bill_of_materials_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_bom_components" ADD CONSTRAINT "mfg_bom_components_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "mfg_bill_of_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_bom_components" ADD CONSTRAINT "mfg_bom_components_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_production_orders" ADD CONSTRAINT "mfg_production_orders_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "mfg_bill_of_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_production_orders" ADD CONSTRAINT "mfg_production_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_production_material_consumption" ADD CONSTRAINT "mfg_production_material_consumption_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "mfg_production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_production_material_consumption" ADD CONSTRAINT "mfg_production_material_consumption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_goods_receipt_notes" ADD CONSTRAINT "inv_goods_receipt_notes_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_goods_receipt_notes" ADD CONSTRAINT "inv_goods_receipt_notes_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_goods_receipt_lines" ADD CONSTRAINT "inv_goods_receipt_lines_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "inv_goods_receipt_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_goods_receipt_lines" ADD CONSTRAINT "inv_goods_receipt_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_dispatch_notes" ADD CONSTRAINT "inv_dispatch_notes_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_dispatch_notes" ADD CONSTRAINT "inv_dispatch_notes_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_dispatch_note_lines" ADD CONSTRAINT "inv_dispatch_note_lines_dispatchNoteId_fkey" FOREIGN KEY ("dispatchNoteId") REFERENCES "inv_dispatch_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_dispatch_note_lines" ADD CONSTRAINT "inv_dispatch_note_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
