-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('active', 'inactive', 'deceased');

-- CreateEnum
CREATE TYPE "PatientGender" AS ENUM ('male', 'female', 'other', 'unknown');

-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('draft', 'posted', 'partially_paid', 'paid', 'voided');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('posted', 'voided', 'refunded', 'partially_refunded');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'bank_transfer', 'other');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('posted', 'voided');

-- CreateEnum
CREATE TYPE "AdjustmentStatus" AS ENUM ('posted', 'voided');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('opening_balance', 'credit', 'debit', 'write_off');

-- CreateEnum
CREATE TYPE "AdjustmentDirection" AS ENUM ('increase_balance', 'decrease_balance');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('opening_balance', 'charge', 'discount', 'payment', 'refund', 'adjustment', 'reversal');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "PatientAccountStatus" AS ENUM ('open', 'closed', 'on_hold');

-- CreateEnum
CREATE TYPE "PatientNoteType" AS ENUM ('general', 'billing', 'administrative');

-- CreateTable
CREATE TABLE "pms_patients" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "code" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "dateOfBirth" DATE,
    "gender" "PatientGender",
    "status" "PatientStatus" NOT NULL DEFAULT 'active',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pms_patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_patient_profiles" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "preferredLocale" TEXT,
    "referralSource" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_patient_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_patient_notes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "noteType" "PatientNoteType" NOT NULL DEFAULT 'general',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pms_patient_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_patient_accounts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "cachedBalance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "balanceAsOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "status" "PatientAccountStatus" NOT NULL DEFAULT 'open',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_patient_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_service_categories" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pms_service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_services" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "categoryId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "department" TEXT,
    "durationMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pms_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_encounters" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "encounterDate" DATE NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "status" "EncounterStatus" NOT NULL DEFAULT 'scheduled',
    "providerId" UUID,
    "department" TEXT,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pms_encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_charges" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "encounterId" UUID,
    "number" TEXT NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'draft',
    "chargeDate" DATE NOT NULL,
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "headerDiscount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "postedAt" TIMESTAMP(3),
    "postedById" UUID,
    "voidedAt" TIMESTAMP(3),
    "voidedById" UUID,
    "voidReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_charge_lines" (
    "id" UUID NOT NULL,
    "chargeId" UUID NOT NULL,
    "serviceId" UUID,
    "serviceCode" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "lineSubtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pms_charge_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_payments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "encounterId" UUID,
    "number" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "reference" TEXT,
    "notes" TEXT,
    "paymentDate" DATE NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'posted',
    "idempotencyKey" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedById" UUID,
    "voidedAt" TIMESTAMP(3),
    "voidedById" UUID,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_payment_allocations" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "chargeId" UUID NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_refunds" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "status" "RefundStatus" NOT NULL DEFAULT 'posted',
    "refundDate" DATE NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedById" UUID,
    "voidedAt" TIMESTAMP(3),
    "voidedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_adjustments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "adjustmentType" "AdjustmentType" NOT NULL,
    "direction" "AdjustmentDirection" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'posted',
    "adjustmentDate" DATE NOT NULL,
    "approvedById" UUID,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedById" UUID,
    "voidedAt" TIMESTAMP(3),
    "voidedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_ledger_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceType" TEXT NOT NULL,
    "referenceId" UUID NOT NULL,
    "reversalOfId" UUID,
    "description" TEXT,
    "runningBalance" DECIMAL(18,4) NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_patients_tenantId_status_idx" ON "pms_patients"("tenantId", "status");

-- CreateIndex
CREATE INDEX "pms_patients_tenantId_lastName_firstName_idx" ON "pms_patients"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "pms_patients_tenantId_branchId_idx" ON "pms_patients"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_patients_tenantId_code_key" ON "pms_patients"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "pms_patient_profiles_patientId_key" ON "pms_patient_profiles"("patientId");

-- CreateIndex
CREATE INDEX "pms_patient_notes_tenantId_patientId_createdAt_idx" ON "pms_patient_notes"("tenantId", "patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "pms_patient_accounts_patientId_key" ON "pms_patient_accounts"("patientId");

-- CreateIndex
CREATE INDEX "pms_patient_accounts_tenantId_status_idx" ON "pms_patient_accounts"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pms_patient_accounts_tenantId_patientId_key" ON "pms_patient_accounts"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "pms_service_categories_tenantId_isActive_idx" ON "pms_service_categories"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "pms_service_categories_tenantId_code_key" ON "pms_service_categories"("tenantId", "code");

-- CreateIndex
CREATE INDEX "pms_services_tenantId_isActive_idx" ON "pms_services"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "pms_services_tenantId_categoryId_idx" ON "pms_services"("tenantId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_services_tenantId_code_key" ON "pms_services"("tenantId", "code");

-- CreateIndex
CREATE INDEX "pms_encounters_tenantId_patientId_encounterDate_idx" ON "pms_encounters"("tenantId", "patientId", "encounterDate");

-- CreateIndex
CREATE INDEX "pms_encounters_tenantId_branchId_status_idx" ON "pms_encounters"("tenantId", "branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pms_encounters_tenantId_number_key" ON "pms_encounters"("tenantId", "number");

-- CreateIndex
CREATE INDEX "pms_charges_tenantId_patientId_status_idx" ON "pms_charges"("tenantId", "patientId", "status");

-- CreateIndex
CREATE INDEX "pms_charges_tenantId_branchId_chargeDate_idx" ON "pms_charges"("tenantId", "branchId", "chargeDate");

-- CreateIndex
CREATE INDEX "pms_charges_tenantId_accountId_idx" ON "pms_charges"("tenantId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_charges_tenantId_number_key" ON "pms_charges"("tenantId", "number");

-- CreateIndex
CREATE INDEX "pms_charge_lines_chargeId_idx" ON "pms_charge_lines"("chargeId");

-- CreateIndex
CREATE INDEX "pms_payments_tenantId_patientId_paymentDate_idx" ON "pms_payments"("tenantId", "patientId", "paymentDate");

-- CreateIndex
CREATE INDEX "pms_payments_tenantId_branchId_paymentDate_idx" ON "pms_payments"("tenantId", "branchId", "paymentDate");

-- CreateIndex
CREATE INDEX "pms_payments_tenantId_accountId_idx" ON "pms_payments"("tenantId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_payments_tenantId_number_key" ON "pms_payments"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "pms_payments_tenantId_idempotencyKey_key" ON "pms_payments"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "pms_payment_allocations_chargeId_idx" ON "pms_payment_allocations"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_payment_allocations_paymentId_chargeId_key" ON "pms_payment_allocations"("paymentId", "chargeId");

-- CreateIndex
CREATE INDEX "pms_refunds_tenantId_paymentId_idx" ON "pms_refunds"("tenantId", "paymentId");

-- CreateIndex
CREATE INDEX "pms_refunds_tenantId_patientId_refundDate_idx" ON "pms_refunds"("tenantId", "patientId", "refundDate");

-- CreateIndex
CREATE UNIQUE INDEX "pms_refunds_tenantId_number_key" ON "pms_refunds"("tenantId", "number");

-- CreateIndex
CREATE INDEX "pms_adjustments_tenantId_patientId_adjustmentDate_idx" ON "pms_adjustments"("tenantId", "patientId", "adjustmentDate");

-- CreateIndex
CREATE INDEX "pms_adjustments_tenantId_accountId_idx" ON "pms_adjustments"("tenantId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_adjustments_tenantId_number_key" ON "pms_adjustments"("tenantId", "number");

-- CreateIndex
CREATE INDEX "pms_ledger_entries_accountId_postedAt_idx" ON "pms_ledger_entries"("accountId", "postedAt");

-- CreateIndex
CREATE INDEX "pms_ledger_entries_tenantId_referenceType_referenceId_idx" ON "pms_ledger_entries"("tenantId", "referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "pms_ledger_entries_tenantId_branchId_entryDate_idx" ON "pms_ledger_entries"("tenantId", "branchId", "entryDate");

-- AddForeignKey
ALTER TABLE "pms_patients" ADD CONSTRAINT "pms_patients_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_patients" ADD CONSTRAINT "pms_patients_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_patient_profiles" ADD CONSTRAINT "pms_patient_profiles_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "pms_patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_patient_notes" ADD CONSTRAINT "pms_patient_notes_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "pms_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_patient_accounts" ADD CONSTRAINT "pms_patient_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_patient_accounts" ADD CONSTRAINT "pms_patient_accounts_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "pms_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_service_categories" ADD CONSTRAINT "pms_service_categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_services" ADD CONSTRAINT "pms_services_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_services" ADD CONSTRAINT "pms_services_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "pms_service_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_encounters" ADD CONSTRAINT "pms_encounters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_encounters" ADD CONSTRAINT "pms_encounters_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_encounters" ADD CONSTRAINT "pms_encounters_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "pms_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_encounters" ADD CONSTRAINT "pms_encounters_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_charges" ADD CONSTRAINT "pms_charges_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_charges" ADD CONSTRAINT "pms_charges_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_charges" ADD CONSTRAINT "pms_charges_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "pms_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_charges" ADD CONSTRAINT "pms_charges_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "pms_patient_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_charges" ADD CONSTRAINT "pms_charges_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "pms_encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_charge_lines" ADD CONSTRAINT "pms_charge_lines_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "pms_charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_charge_lines" ADD CONSTRAINT "pms_charge_lines_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "pms_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_payments" ADD CONSTRAINT "pms_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_payments" ADD CONSTRAINT "pms_payments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_payments" ADD CONSTRAINT "pms_payments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "pms_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_payments" ADD CONSTRAINT "pms_payments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "pms_patient_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_payments" ADD CONSTRAINT "pms_payments_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "pms_encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_payment_allocations" ADD CONSTRAINT "pms_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "pms_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_payment_allocations" ADD CONSTRAINT "pms_payment_allocations_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "pms_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_refunds" ADD CONSTRAINT "pms_refunds_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_refunds" ADD CONSTRAINT "pms_refunds_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_refunds" ADD CONSTRAINT "pms_refunds_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "pms_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_refunds" ADD CONSTRAINT "pms_refunds_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "pms_patient_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_refunds" ADD CONSTRAINT "pms_refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "pms_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_adjustments" ADD CONSTRAINT "pms_adjustments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_adjustments" ADD CONSTRAINT "pms_adjustments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_adjustments" ADD CONSTRAINT "pms_adjustments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "pms_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_adjustments" ADD CONSTRAINT "pms_adjustments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "pms_patient_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_ledger_entries" ADD CONSTRAINT "pms_ledger_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_ledger_entries" ADD CONSTRAINT "pms_ledger_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_ledger_entries" ADD CONSTRAINT "pms_ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "pms_patient_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_ledger_entries" ADD CONSTRAINT "pms_ledger_entries_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "pms_ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

