-- CreateEnum
CREATE TYPE "ExchangeRateSource" AS ENUM ('manual', 'system');

-- CreateEnum
CREATE TYPE "AssetDepreciationMethod" AS ENUM ('straight_line', 'declining_balance');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('draft', 'active', 'disposed', 'written_off');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'qualified', 'unqualified', 'converted');

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost');

-- CreateEnum
CREATE TYPE "CrmActivityType" AS ENUM ('call', 'meeting', 'email', 'task', 'note');

-- CreateEnum
CREATE TYPE "CrmActivityStatus" AS ENUM ('open', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'on_leave', 'terminated');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('draft', 'approved', 'posted', 'cancelled');

-- CreateEnum
CREATE TYPE "BankStatementLineStatus" AS ENUM ('unmatched', 'matched', 'ignored');

-- CreateEnum
CREATE TYPE "BankReconciliationStatus" AS ENUM ('in_progress', 'completed');

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "ApprovalActionDecision" AS ENUM ('approved', 'rejected');

-- AlterTable
ALTER TABLE "finance_account_role_mappings" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "finance_posting_rule_lines" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "finance_posting_rules" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "fiscal_periods" ALTER COLUMN "startDate" SET DATA TYPE DATE,
ALTER COLUMN "endDate" SET DATA TYPE DATE,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "currencyCode" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(18,8);

-- AlterTable
ALTER TABLE "journal_lines" ADD COLUMN     "currencyCode" TEXT,
ADD COLUMN     "foreignCredit" DECIMAL(18,4),
ADD COLUMN     "foreignDebit" DECIMAL(18,4);

-- AlterTable
ALTER TABLE "parties" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "party_addresses" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "party_contacts" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "party_identifiers" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "party_roles" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "currencyCode" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(18,8);

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "currencyCode" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(18,8);

-- CreateTable
CREATE TABLE "currencies" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "asOfDate" DATE NOT NULL,
    "source" "ExchangeRateSource" NOT NULL DEFAULT 'manual',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultUsefulLifeMonths" INTEGER NOT NULL DEFAULT 60,
    "defaultDepreciationMethod" "AssetDepreciationMethod" NOT NULL DEFAULT 'straight_line',
    "defaultDecliningRate" DECIMAL(6,4),
    "assetAccountRole" TEXT NOT NULL DEFAULT 'fixed_assets',
    "depreciationExpenseAccountRole" TEXT NOT NULL DEFAULT 'depreciation_expense',
    "accumulatedDepreciationAccountRole" TEXT NOT NULL DEFAULT 'accumulated_depreciation',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "categoryId" UUID NOT NULL,
    "costCenterId" UUID,
    "projectId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "acquisitionDate" DATE NOT NULL,
    "acquisitionCost" DECIMAL(18,4) NOT NULL,
    "salvageValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "depreciationMethod" "AssetDepreciationMethod" NOT NULL DEFAULT 'straight_line',
    "decliningRate" DECIMAL(6,4),
    "accumulatedDepreciation" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "bookValue" DECIMAL(18,4) NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'active',
    "lastDepreciationDate" DATE,
    "disposalDate" DATE,
    "disposalProceeds" DECIMAL(18,4),
    "disposalJournalEntryId" UUID,
    "serialNumber" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_depreciation_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "periodDate" DATE NOT NULL,
    "depreciationAmount" DECIMAL(18,4) NOT NULL,
    "accumulatedDepreciation" DECIMAL(18,4) NOT NULL,
    "bookValue" DECIMAL(18,4) NOT NULL,
    "journalEntryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_depreciation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_leads" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "code" TEXT NOT NULL,
    "companyName" TEXT,
    "contactName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "ownerId" UUID,
    "notes" TEXT,
    "convertedPartyId" UUID,
    "convertedOpportunityId" UUID,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_opportunities" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "leadId" UUID,
    "partyId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'prospecting',
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currencyCode" TEXT,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expectedCloseDate" DATE,
    "ownerId" UUID,
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_activities" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "leadId" UUID,
    "opportunityId" UUID,
    "partyId" UUID,
    "type" "CrmActivityType" NOT NULL DEFAULT 'task',
    "subject" TEXT NOT NULL,
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "CrmActivityStatus" NOT NULL DEFAULT 'open',
    "ownerId" UUID,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_departments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_positions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "departmentId" UUID,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_employees" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "userId" UUID,
    "departmentId" UUID,
    "positionId" UUID,
    "managerId" UUID,
    "code" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "nationalId" TEXT,
    "hireDate" DATE NOT NULL,
    "terminationDate" DATE,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
    "basicSalary" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currencyCode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_leave_types" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "paidLeave" BOOLEAN NOT NULL DEFAULT true,
    "daysPerYear" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_leave_requests" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" DECIMAL(6,2) NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'pending',
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_payroll_runs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "code" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'draft',
    "totalGross" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "journalEntryId" UUID,
    "postedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_payroll_run_lines" (
    "id" UUID NOT NULL,
    "payrollRunId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "basicSalary" DECIMAL(18,4) NOT NULL,
    "allowances" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "hr_payroll_run_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "name" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT,
    "iban" TEXT,
    "currencyCode" TEXT,
    "glAccountId" UUID,
    "openingBalance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "transactionDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(18,4) NOT NULL,
    "status" "BankStatementLineStatus" NOT NULL DEFAULT 'unmatched',
    "matchedJournalEntryId" UUID,
    "reconciliationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "periodEnd" DATE NOT NULL,
    "statementBalance" DECIMAL(18,4) NOT NULL,
    "bookBalance" DECIMAL(18,4) NOT NULL,
    "status" "BankReconciliationStatus" NOT NULL DEFAULT 'in_progress',
    "completedAt" TIMESTAMP(3),
    "completedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minAmount" DECIMAL(18,4),
    "maxAmount" DECIMAL(18,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approverRole" TEXT,
    "approverUserId" UUID,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "amount" DECIMAL(18,4),
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'pending',
    "currentStepSequence" INTEGER NOT NULL DEFAULT 1,
    "requestedById" UUID NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_actions" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "stepSequence" INTEGER NOT NULL,
    "approverId" UUID NOT NULL,
    "decision" "ApprovalActionDecision" NOT NULL,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "currencies_tenantId_isActive_idx" ON "currencies"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "currencies_tenantId_code_key" ON "currencies"("tenantId", "code");

-- CreateIndex
CREATE INDEX "exchange_rates_tenantId_fromCurrency_toCurrency_asOfDate_idx" ON "exchange_rates"("tenantId", "fromCurrency", "toCurrency", "asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_tenantId_fromCurrency_toCurrency_asOfDate_key" ON "exchange_rates"("tenantId", "fromCurrency", "toCurrency", "asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_tenantId_code_key" ON "asset_categories"("tenantId", "code");

-- CreateIndex
CREATE INDEX "assets_tenantId_status_idx" ON "assets"("tenantId", "status");

-- CreateIndex
CREATE INDEX "assets_tenantId_categoryId_idx" ON "assets"("tenantId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "assets_tenantId_code_key" ON "assets"("tenantId", "code");

-- CreateIndex
CREATE INDEX "asset_depreciation_entries_tenantId_assetId_idx" ON "asset_depreciation_entries"("tenantId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_depreciation_entries_tenantId_assetId_periodDate_key" ON "asset_depreciation_entries"("tenantId", "assetId", "periodDate");

-- CreateIndex
CREATE INDEX "crm_leads_tenantId_status_idx" ON "crm_leads"("tenantId", "status");

-- CreateIndex
CREATE INDEX "crm_leads_tenantId_ownerId_idx" ON "crm_leads"("tenantId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_leads_tenantId_code_key" ON "crm_leads"("tenantId", "code");

-- CreateIndex
CREATE INDEX "crm_opportunities_tenantId_stage_idx" ON "crm_opportunities"("tenantId", "stage");

-- CreateIndex
CREATE INDEX "crm_opportunities_tenantId_ownerId_idx" ON "crm_opportunities"("tenantId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_opportunities_tenantId_code_key" ON "crm_opportunities"("tenantId", "code");

-- CreateIndex
CREATE INDEX "crm_activities_tenantId_ownerId_status_idx" ON "crm_activities"("tenantId", "ownerId", "status");

-- CreateIndex
CREATE INDEX "crm_activities_tenantId_dueDate_idx" ON "crm_activities"("tenantId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "hr_departments_tenantId_code_key" ON "hr_departments"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "hr_positions_tenantId_code_key" ON "hr_positions"("tenantId", "code");

-- CreateIndex
CREATE INDEX "hr_employees_tenantId_status_idx" ON "hr_employees"("tenantId", "status");

-- CreateIndex
CREATE INDEX "hr_employees_tenantId_departmentId_idx" ON "hr_employees"("tenantId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "hr_employees_tenantId_code_key" ON "hr_employees"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "hr_leave_types_tenantId_code_key" ON "hr_leave_types"("tenantId", "code");

-- CreateIndex
CREATE INDEX "hr_leave_requests_tenantId_employeeId_status_idx" ON "hr_leave_requests"("tenantId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "hr_payroll_runs_tenantId_status_idx" ON "hr_payroll_runs"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hr_payroll_runs_tenantId_code_key" ON "hr_payroll_runs"("tenantId", "code");

-- CreateIndex
CREATE INDEX "hr_payroll_run_lines_payrollRunId_idx" ON "hr_payroll_run_lines"("payrollRunId");

-- CreateIndex
CREATE INDEX "bank_accounts_tenantId_isActive_idx" ON "bank_accounts"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "bank_statement_lines_tenantId_bankAccountId_status_idx" ON "bank_statement_lines"("tenantId", "bankAccountId", "status");

-- CreateIndex
CREATE INDEX "bank_reconciliations_tenantId_bankAccountId_status_idx" ON "bank_reconciliations"("tenantId", "bankAccountId", "status");

-- CreateIndex
CREATE INDEX "approval_workflows_tenantId_sourceModule_sourceType_isActiv_idx" ON "approval_workflows"("tenantId", "sourceModule", "sourceType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_workflowId_sequence_key" ON "approval_steps"("workflowId", "sequence");

-- CreateIndex
CREATE INDEX "approval_requests_tenantId_status_idx" ON "approval_requests"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_tenantId_sourceModule_sourceType_sourceId_key" ON "approval_requests"("tenantId", "sourceModule", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "approval_actions_requestId_idx" ON "approval_actions"("requestId");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_depreciation_entries" ADD CONSTRAINT "asset_depreciation_entries_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "crm_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_positions" ADD CONSTRAINT "hr_positions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "hr_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "hr_leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_payroll_run_lines" ADD CONSTRAINT "hr_payroll_run_lines_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "hr_payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_payroll_run_lines" ADD CONSTRAINT "hr_payroll_run_lines_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "bank_reconciliations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "construction_advance_entries_tenantId_contractId_partyType_cr_i" RENAME TO "construction_advance_entries_tenantId_contractId_partyType__idx";

-- RenameIndex
ALTER INDEX "construction_advance_entries_tenantId_sourceModule_sourceType_k" RENAME TO "construction_advance_entries_tenantId_sourceModule_sourceTy_key";

-- RenameIndex
ALTER INDEX "construction_billing_lines_tenantId_billingId_progressItemId_ke" RENAME TO "construction_billing_lines_tenantId_billingId_progressItemI_key";

-- RenameIndex
ALTER INDEX "construction_billings_tenantId_sourceModule_sourceType_sourceId" RENAME TO "construction_billings_tenantId_sourceModule_sourceType_sour_key";

-- RenameIndex
ALTER INDEX "construction_cost_entries_tenantId_sourceModule_sourceType_s_ke" RENAME TO "construction_cost_entries_tenantId_sourceModule_sourceType__key";

-- RenameIndex
ALTER INDEX "construction_material_issues_tenantId_sourceModule_sourceType_s" RENAME TO "construction_material_issues_tenantId_sourceModule_sourceTy_idx";

-- RenameIndex
ALTER INDEX "construction_progress_tenantId_contractId_boqId_periodFrom_peri" RENAME TO "construction_progress_tenantId_contractId_boqId_periodFrom__key";

-- RenameIndex
ALTER INDEX "construction_retention_entries_tenantId_contractId_partyType_c_" RENAME TO "construction_retention_entries_tenantId_contractId_partyTyp_idx";

-- RenameIndex
ALTER INDEX "construction_retention_entries_tenantId_sourceModule_sourceTy_k" RENAME TO "construction_retention_entries_tenantId_sourceModule_source_key";

-- RenameIndex
ALTER INDEX "construction_subcontractor_assignments_tenantId_profileId_pr_ke" RENAME TO "construction_subcontractor_assignments_tenantId_profileId_p_key";

-- RenameIndex
ALTER INDEX "construction_variation_items_tenantId_variationId_lineNumber_id" RENAME TO "construction_variation_items_tenantId_variationId_lineNumbe_idx";

-- RenameIndex
ALTER INDEX "finance_posting_rules_tenantId_sourceModule_sourceType_event_ke" RENAME TO "finance_posting_rules_tenantId_sourceModule_sourceType_even_key";

-- RenameIndex
ALTER INDEX "journal_entries_tenantId_sourceModule_sourceType_sourceId_sourc" RENAME TO "journal_entries_tenantId_sourceModule_sourceType_sourceId_s_key";
