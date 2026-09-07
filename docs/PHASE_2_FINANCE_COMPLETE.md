# Phase 2 Complete — Universal Finance Foundation

**Status:** Complete  
**Date:** 2026-09-07  
**Scope:** Universal Finance module foundation — Chart of Accounts enhancements, Fiscal Periods, Posting Rules, FinancialPostingService — **no ERP migration, no PMS GL wiring, no UI**

---

## 1. Existing Accounting Audit

### What existed before Phase 2

| Component | Location | Behavior |
|-----------|----------|----------|
| **Chart of Accounts** | `accounts` table | Tenant-scoped; `code`, `name`, `type`, `parentId`, `isSystem`, `isActive` |
| **General Ledger** | `journal_entries`, `journal_lines` | Balanced entries via `AccountingEngineService.createEntry()` |
| **Fiscal Periods** | `fiscal_periods` | Table existed with `isClosed` only — **never enforced in code** |
| **Posting** | `AccountingEngineService` | Hardcoded COA codes; optional `referenceType`/`referenceId`; no fiscal period check |
| **Reports** | `AccountingService.trialBalance()` | Aggregates `journal_lines` by account |
| **Party balances** | `customers.balance`, `suppliers.balance` | Denormalized caches updated by sales/purchasing |

### Hardcoded COA dependencies (legacy — unchanged)

| Module | Trigger | Accounts used |
|--------|---------|---------------|
| Sales | Post invoice | `1100` AR, `4000` Revenue, `5000` COGS, `1200` Inventory |
| Sales | Customer payment | `1000` Cash, `1100` AR |
| Purchasing | Receive PO | `1200` Inventory, `2000` AP |
| POS | Create sale | `1000` Cash, `4000` Revenue (cash portion only) |

### Transaction boundaries (legacy)

- Sales/purchasing/POS wrap business logic + `AccountingEngineService.createEntry(..., tx)` in `prisma.$transaction`
- No fiscal period validation
- No idempotency on journal entries
- Uses JavaScript `number` for balance check tolerance in `AccountingEngineService` (legacy path only)

### Branch / tenant handling (legacy)

- `tenantId` on all accounting rows
- Optional `branchId` on `journal_entries`
- Branch not validated in `AccountingEngineService`

**Phase 2 decision:** Legacy `AccountingEngineService` and ERP modules remain **unchanged and functional**. New posting goes through `FinancialPostingService`.

---

## 2. Universal Finance Architecture

```
Operational Document (future / optional)
        │
        ▼
FinancialPostingService.post(input, tx)     ← Phase 2 (NEW)
        │
        ├── FiscalPeriodService.assertPostingAllowed
        ├── PostingRuleService.findRule (rule mode)
        ├── AccountRoleService.resolveAccountId
        ├── assertBalancedLines (Decimal-safe)
        └── journalEntry.create + journalLine.create
                │
                ▼
         General Ledger (journal_entries / journal_lines)
```

**Parallel path (legacy, frozen):**

```
Sales/Purchasing/POS → AccountingEngineService.createEntry (hardcoded COA)
```

**PMS path (unchanged):**

```
Patient charges (future) → LedgerPostingService → pms_ledger_entries
PMS → GL bridge: NOT wired (OFF BY DEFAULT)
```

---

## 3. Schema / Migration Changes

**Migration:** `20250907160000_universal_finance`

### Extended tables (additive)

| Table | New columns |
|-------|-------------|
| `accounts` | `normalBalance`, `isPosting` |
| `journal_entries` | `fiscalPeriodId`, `sourceModule`, `sourceType`, `sourceId`, `sourceEvent`, `idempotencyKey`, `postedAt` |
| `journal_lines` | `branchId`, `projectId`, `costCenterId`, `department` |
| `fiscal_periods` | `status` (enum), `updatedAt` |

### New tables

| Table | Purpose |
|-------|---------|
| `finance_account_role_mappings` | Maps semantic roles → account IDs per tenant |
| `finance_posting_rules` | Posting rule headers |
| `finance_posting_rule_lines` | Rule lines (role, side, amount source) |

### New enums

- `AccountNormalBalance`: debit, credit
- `FiscalPeriodStatus`: open, closed, locked
- `PostingSide`: debit, credit

### Idempotency constraints

```sql
UNIQUE (tenantId, idempotencyKey)
UNIQUE (tenantId, sourceModule, sourceType, sourceId, sourceEvent)
```

---

## 4. Files Created / Modified

### Created

| File | Purpose |
|------|---------|
| `apps/api/src/modules/finance/finance.module.ts` | Finance module root |
| `apps/api/src/modules/finance/finance.controller.ts` | COA, rules, posting API |
| `apps/api/src/modules/finance/finance-setup.service.ts` | Tenant finance seed orchestration |
| `apps/api/src/modules/finance/coa/chart-of-accounts.service.ts` | COA list/seed |
| `apps/api/src/modules/finance/fiscal-periods/fiscal-period.service.ts` | Period lifecycle + enforcement |
| `apps/api/src/modules/finance/fiscal-periods/fiscal-period.controller.ts` | Period REST API |
| `apps/api/src/modules/finance/posting/financial-posting.service.ts` | Universal GL posting |
| `apps/api/src/modules/finance/posting/posting-rule.service.ts` | Rule lookup + seed |
| `apps/api/src/modules/finance/posting/account-role.service.ts` | Role → account resolution |
| `apps/api/src/modules/finance/posting/account-roles.constants.ts` | Semantic role definitions |
| `apps/api/src/modules/finance/posting/posting.types.ts` | Types + PMS integration contract |
| `apps/api/src/modules/finance/posting/money.util.ts` | Decimal balance validation |
| `apps/api/test/finance.integration.spec.ts` | 13 integration tests |
| `packages/database/prisma/migrations/20250907160000_universal_finance/` | Schema migration |
| `docs/PHASE_2_FINANCE_COMPLETE.md` | This document |

### Modified

| File | Change |
|------|--------|
| `packages/database/prisma/schema.server.prisma` | Finance schema extensions |
| `packages/database/prisma/seed.ts` | Finance permissions, COA metadata, roles, rules, fiscal period |
| `apps/api/src/app.module.ts` | Registered `FinanceModule` |
| `apps/api/test/test-app.ts` | Finance permissions + foundation seed on test boot |

### Not modified (by design)

- `AccountingEngineService` — legacy ERP path
- `sales.service.ts`, `purchasing.service.ts`, `pos.service.ts` — still use hardcoded COA
- All PMS Phase 1b/1c code — untouched

---

## 5. Chart of Accounts

Existing `accounts` table is the universal COA foundation.

**Enhancements:**
- `normalBalance` — debit or credit (derived from account type on seed)
- `isPosting` — false for future summary/non-posting accounts

**Semantic roles** (via `finance_account_role_mappings`):

| Role | Default code |
|------|--------------|
| cash | 1000 |
| accounts_receivable | 1100 |
| inventory | 1200 |
| accounts_payable | 2000 |
| tax_payable | 2100 |
| owner_equity | 3000 |
| revenue | 4000 |
| cost_of_goods_sold | 5000 |
| operating_expense | 5100 |

Posting logic resolves **roles**, not hardcoded codes.

---

## 6. Fiscal Period

**States:** `open`, `closed`, `locked`

| State | Posting allowed |
|-------|-----------------|
| open | Yes |
| closed | No |
| locked | No |

**Validation (`FiscalPeriodService.assertPostingAllowed`):**
- Period must belong to tenant
- Posting date must fall within `[startDate, endDate]`
- Period status must be `open`

Demo tenant seeded with `FY {currentYear}` open period.

**API:** `/api/v1/finance/fiscal-periods`

---

## 7. Posting Rules

**Tables:** `finance_posting_rules` + `finance_posting_rule_lines`

**Rule key:** `(tenantId, sourceModule, sourceType, event)`

**Seeded rules (mirror legacy ERP flows for future migration):**

| Module | Type | Event | Lines |
|--------|------|-------|-------|
| sales | invoice | post | AR debit, Revenue credit, COGS/Inventory optional |
| sales | payment | post | Cash debit, AR credit |
| purchasing | order | receive | Inventory debit, AP credit |
| pos | sale | post | Cash debit, Revenue credit |
| pms | charge | post | AR debit, Revenue credit (future — not wired) |

**Amount sources:** `total`, `amount`, `cogs`, `cash_portion` — zero amounts skipped (e.g. COGS=0 on invoice without inventory).

---

## 8. FinancialPostingService

**Entry point:** `post(input, tx)` — **requires caller transaction** (same pattern as PMS ledger).

### Modes

| Mode | Input | Use case |
|------|-------|----------|
| `rule` | sourceModule/Type/Event + amounts map | Operational posting via rules |
| `lines` | Explicit balanced lines with accountRole or accountId | Manual journals, tests |

### Validations

1. Branch belongs to tenant
2. Idempotency — return existing entry if `(tenantId, sourceModule, sourceType, sourceId, sourceEvent)` or `idempotencyKey` matches
3. Fiscal period open and covers posting date
4. Accounts resolved via roles; must be active + posting
5. `assertBalancedLines` — Decimal-safe, rejects zero lines, rejects imbalance
6. JE number via `DocumentNumberService`

### Source references

| Field | Example |
|-------|---------|
| sourceModule | `sales`, `pms`, `finance` |
| sourceType | `invoice`, `charge`, `manual` |
| sourceId | UUID of source document |
| sourceEvent | `post`, `receive`, `void` |
| referenceType / referenceId | Legacy-compatible mirror of sourceType/sourceId |

---

## 9. Dimensions

**Journal line columns (optional):**

| Dimension | Column | Phase 2 status |
|-----------|--------|----------------|
| Branch | `branchId` | Populated from posting context |
| Project | `projectId` | Schema ready; no Projects module |
| Cost Center | `costCenterId` | Schema ready; no module |
| Department | `department` | Schema ready |

Not required on every line — controlled per posting input.

---

## 10. Tenant / Branch Isolation

- All finance queries scoped by JWT `tenantId`
- Branch validated on every posting
- Cross-tenant period access returns 404
- Cross-tenant branch on posting returns 400

Integration tests verify tenant isolation.

---

## 11. Idempotency Strategy

**Implemented:**

```
UNIQUE (tenantId, sourceModule, sourceType, sourceId, sourceEvent)
UNIQUE (tenantId, idempotencyKey)
```

**Behavior:**
- Repeated `post()` with same source tuple returns existing journal (no duplicate)
- Concurrent parallel posts race-safe via unique constraint + re-fetch on P2002
- Default idempotency key: `{module}:{type}:{id}:{event}`

**Legacy journals** (NULL source fields) unaffected — PostgreSQL NULL unique semantics allow coexistence.

---

## 12. PMS Integration Status

| Item | Status |
|------|--------|
| PMS ledger (Phase 1b) | **Unchanged** |
| PMS → GL posting | **Not wired** |
| PMS posting rule seeded | Yes (for future use) |
| `PmsFinancialPostingRequest` type | Documented in `posting.types.ts` |
| Default GL integration | **OFF** |

**Distinction preserved:**

| Ledger | Answers |
|--------|---------|
| PMS `pms_ledger_entries` | How much does this **patient** owe? |
| GL `journal_entries` | What does the **business** earn/owe own financially? |

Bridge = `FinancialPostingService` (future, tenant-configurable).

---

## 13. Legacy ERP Compatibility

| Aspect | Status |
|--------|--------|
| ERP modules | Frozen, functional, unchanged |
| `AccountingEngineService` | Still used by sales/purchasing/POS |
| Hardcoded COA in ERP | Still present — migration deferred |
| Existing journal data | Preserved; new columns nullable |
| `/accounting/*` routes | Unchanged |
| Trial balance | Still works on same `journal_lines` |

**Migration strategy (future phase):**
1. Refactor sales/purchasing/POS to call `FinancialPostingService` with `mode: 'rule'`
2. Feature-flag per tenant
3. Reconcile legacy vs rule-based journals before decommissioning `AccountingEngineService`

---

## 14. AR / AP / Treasury / Tax (Design Only)

| Area | Current | Future |
|------|---------|--------|
| **AR** | `customers.balance` + invoices | AR subledger → FinancialPostingService |
| **AP** | `suppliers.balance` + POs | AP subledger → FinancialPostingService |
| **Treasury** | COA role `cash` | Bank accounts, transfers, reconciliation |
| **Tax** | Not modeled | Tax codes + posting lines; Egypt-compatible design slot via `tax_payable` role |

Not implemented in Phase 2.

---

## 15. Reporting Foundation

Existing `journal_lines` + enhanced dimensions support future:

- Trial Balance ✅ (existing)
- General Ledger ✅ (entry + lines + source refs)
- P&L / Balance Sheet ✅ (account type + hierarchy)
- Branch-consolidated reports ✅ (branchId on lines)
- Project/cost center reports ⏳ (columns ready)

---

## 16. API Endpoints

Base: `/api/v1/finance`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/accounts` | `finance:coa:read` |
| GET | `/account-roles` | `finance:coa:read` |
| GET | `/posting-rules` | `finance:posting:read` |
| POST | `/seed` | `finance:setup:seed` |
| POST | `/postings/rule` | `finance:posting:execute` |
| POST | `/postings/lines` | `finance:posting:execute` |
| GET | `/fiscal-periods` | `finance:periods:read` |
| GET | `/fiscal-periods/:id` | `finance:periods:read` |
| POST | `/fiscal-periods` | `finance:periods:manage` |
| PATCH | `/fiscal-periods/:id/status` | `finance:periods:manage` |

Legacy `/accounting/*` routes remain.

---

## 17. Tests

**File:** `apps/api/test/finance.integration.spec.ts` — **13 tests**

| Area | Coverage |
|------|----------|
| Journal | Balanced accepted, unbalanced rejected, zero rejected, Decimal precision |
| Branch | Invalid branch rejected |
| Rules | Role resolution (no hardcoded codes in posting path), source refs preserved |
| Idempotency | Repeated post returns same entry |
| Fiscal period | Open accepted, closed/locked rejected, out-of-range rejected |
| Tenant isolation | Cross-tenant period + posting blocked |
| Concurrency | 5 parallel posts → 1 journal |
| Rollback | Failed JE number allocation rolls back |
| HTTP | Posting rules list + rule-based API post |

---

## 18. Regression Results

```bash
npm run typecheck -w @fratelanza/api   # PASS
npm test -w @fratelanza/api            # 69/69 PASS
```

| Suite | Tests |
|-------|-------|
| auth | 5 |
| concurrency | 5 |
| resilience | 3 |
| pms-ledger | 24 |
| pms-patients | 17 |
| **finance** | **13** |
| **Total** | **69** |

Phase 0 + Phase 1 + PMS tests remain green.

---

## 19. Remaining Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Dual posting paths (legacy + new) | **High** | ERP still uses hardcoded COA until migrated |
| Legacy journals lack source/idempotency fields | **Medium** | NULL-safe; new postings fully traceable |
| No period enforcement on legacy path | **Medium** | Only `FinancialPostingService` enforces periods |
| ~~Fiscal period close race during posting~~ | ~~**High**~~ | **Resolved in Phase 2.1** — see `docs/PHASE_2_1_COMPLETE.md` |
| `AccountingEngineService` uses JS number for balance check | **Low** | Legacy only; new path uses Decimal |
| PMS GL rule seeded but inactive | **Low** | Intentional — OFF BY DEFAULT |
| Project/cost center columns unused | **Low** | Ready for Phase 5 Projects |
| Finance permissions require seed/test boot | **Low** | `test-app.ts` upserts permissions |

---

## 20. Recommended Next Phase

**Option A — Complete PMS vertical (Phase 1d+):** Services, Encounters, Charges calling `LedgerPostingService` — independent of GL.

**Option B — ERP posting migration:** Refactor sales/purchasing/POS to use `FinancialPostingService` behind feature flag.

**Option C — Contacts/Party model (Phase 3):** Universal party registry.

**Recommended:** **A + B in parallel** — PMS subledger work continues; migrate one ERP flow (sales invoice post) to rule-based posting as proof-of-migration.

---

## STOP

Phase 2 is complete. **Do not proceed automatically.** Await approval before next phase.
