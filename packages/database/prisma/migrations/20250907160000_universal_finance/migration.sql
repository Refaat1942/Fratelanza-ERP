-- Phase 2: Universal Finance Foundation (additive)

CREATE TYPE "AccountNormalBalance" AS ENUM ('debit', 'credit');
CREATE TYPE "FiscalPeriodStatus" AS ENUM ('open', 'closed', 'locked');
CREATE TYPE "PostingSide" AS ENUM ('debit', 'credit');

ALTER TABLE "accounts"
  ADD COLUMN "normalBalance" "AccountNormalBalance",
  ADD COLUMN "isPosting" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "journal_entries"
  ADD COLUMN "fiscalPeriodId" UUID,
  ADD COLUMN "sourceModule" TEXT,
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "sourceEvent" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "journal_lines"
  ADD COLUMN "branchId" UUID,
  ADD COLUMN "projectId" UUID,
  ADD COLUMN "costCenterId" UUID,
  ADD COLUMN "department" TEXT;

ALTER TABLE "fiscal_periods"
  ADD COLUMN "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'open',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "fiscal_periods"
SET "status" = CASE WHEN "isClosed" = true THEN 'closed'::"FiscalPeriodStatus" ELSE 'open'::"FiscalPeriodStatus" END;

UPDATE "accounts"
SET "normalBalance" = CASE
  WHEN "type" IN ('asset', 'expense') THEN 'debit'::"AccountNormalBalance"
  WHEN "type" IN ('liability', 'equity', 'revenue') THEN 'credit'::"AccountNormalBalance"
  ELSE 'debit'::"AccountNormalBalance"
END
WHERE "normalBalance" IS NULL;

CREATE TABLE "finance_account_role_mappings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "accountId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_account_role_mappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_posting_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "sourceModule" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_posting_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_posting_rule_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ruleId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "accountRole" TEXT NOT NULL,
  "side" "PostingSide" NOT NULL,
  "amountSource" TEXT NOT NULL,
  "description" TEXT,
  CONSTRAINT "finance_posting_rule_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_account_role_mappings_tenantId_role_key"
  ON "finance_account_role_mappings"("tenantId", "role");
CREATE INDEX "finance_account_role_mappings_tenantId_accountId_idx"
  ON "finance_account_role_mappings"("tenantId", "accountId");

CREATE UNIQUE INDEX "finance_posting_rules_tenantId_sourceModule_sourceType_event_key"
  ON "finance_posting_rules"("tenantId", "sourceModule", "sourceType", "event");
CREATE INDEX "finance_posting_rules_tenantId_isActive_idx"
  ON "finance_posting_rules"("tenantId", "isActive");

CREATE UNIQUE INDEX "finance_posting_rule_lines_ruleId_sequence_key"
  ON "finance_posting_rule_lines"("ruleId", "sequence");

CREATE UNIQUE INDEX "journal_entries_tenantId_idempotencyKey_key"
  ON "journal_entries"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "journal_entries_tenantId_sourceModule_sourceType_sourceId_sourceEvent_key"
  ON "journal_entries"("tenantId", "sourceModule", "sourceType", "sourceId", "sourceEvent");
CREATE INDEX "journal_entries_tenantId_sourceModule_sourceType_sourceId_idx"
  ON "journal_entries"("tenantId", "sourceModule", "sourceType", "sourceId");
CREATE INDEX "journal_lines_branchId_idx" ON "journal_lines"("branchId");
CREATE INDEX "journal_lines_projectId_idx" ON "journal_lines"("projectId");
CREATE INDEX "journal_lines_costCenterId_idx" ON "journal_lines"("costCenterId");
CREATE INDEX "fiscal_periods_tenantId_status_idx" ON "fiscal_periods"("tenantId", "status");

ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_fiscalPeriodId_fkey"
  FOREIGN KEY ("fiscalPeriodId") REFERENCES "fiscal_periods"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance_account_role_mappings"
  ADD CONSTRAINT "finance_account_role_mappings_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finance_posting_rule_lines"
  ADD CONSTRAINT "finance_posting_rule_lines_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "finance_posting_rules"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
