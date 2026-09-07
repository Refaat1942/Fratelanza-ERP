# Phase 8.1 — Finance Dimensions & Posting Integration Design

**Status:** Design complete — **Phase 8.1 implemented** — see [PHASE_8_1_FINANCE_DIMENSIONS_COMPLETE.md](./PHASE_8_1_FINANCE_DIMENSIONS_COMPLETE.md)  
**Prerequisites:** Phase 8.0 Universal Projects + Cost Centers ✅, Phase 2 Finance ✅, Phase 2.1 Fiscal Safety ✅

---

## 1. Executive Summary

Phase 8.0 delivered **Project** and **Cost Center** master data. The Universal Finance layer already has **nullable dimension columns** on `journal_lines` and `FinancialPostingService` (FPS) can **persist** dimensions when supplied internally — but there is **no validation**, **no REST exposure**, and **no FK** to master tables.

Phase 8.1 makes Project and Cost Center **first-class, validated Finance dimensions** on the FPS path:

```text
Business Transaction (future / manual FPS caller)
        ↓
FinancialPostingService
        ↓
Journal Entry
    ├── Account + Debit/Credit
    ├── Project (optional, validated)
    └── Cost Center (optional, validated)
```

**This phase does not:**

- Migrate Sales, Purchasing, or POS off legacy `AccountingEngineService`
- Add project/cost-center fields to commercial documents
- Build dimension reports, profitability, or Construction
- Perform full legacy GL migration

---

## 2. Commercial & Licensing Model

Fratelanza is **perpetual / one-time license**. Modules are independently licensable.

| Module / Feature | Relevance to 8.1 |
|------------------|------------------|
| `finance` module | Required for all FPS posting (`@RequireModule('finance')`) |
| `finance.financial-posting` | Required on `POST /finance/postings/*` |
| `projects` module | **Not** required to *post* dimensions — Finance validates referential integrity only |
| `projects.projects`, `projects.cost-centers` | Master-data CRUD remains separately licensed |

**Decision:** Dimension validation checks **tenant-scoped existence and lifecycle**, not Projects module entitlement on the posting endpoint. A tenant without Projects license may still have historical project rows; invalid IDs are rejected regardless of license state.

---

## 3. Audit — Current State (Evidence-Based)

### 3.1 Schema: `journal_lines` Dimension Columns

**Migration:** `packages/database/prisma/migrations/20250907160000_universal_finance/migration.sql`

| Column | SQL type | Nullable | Index | FK |
|--------|----------|----------|-------|-----|
| `branchId` | UUID | Yes | `journal_lines_branchId_idx` | **No** |
| `projectId` | UUID | Yes | `journal_lines_projectId_idx` | **No** |
| `costCenterId` | UUID | Yes | `journal_lines_costCenterId_idx` | **No** |
| `department` | TEXT | Yes | — | — |

**Prisma model** (`schema.server.prisma`):

```prisma
model JournalLine {
  branchId     String? @db.Uuid
  projectId    String? @db.Uuid
  costCenterId String? @db.Uuid
  department   String?
  // Relations: entry, account only — NO project/costCenter relations
}
```

Phase 8.0 added `projects` and `cost_centers` tables with full FK graph among masters — **did not** add FK from `journal_lines`.

### 3.2 Schema: Master Tables (Phase 8.0)

| Model | Key fields | Lifecycle |
|-------|------------|-----------|
| `Project` | `tenantId`, optional `branchId`, `code`, `status` (`ProjectStatus`), `deletedAt` | Archive → `status=archived`, `deletedAt=now()` |
| `CostCenter` | `tenantId`, optional `branchId`, optional `projectId`, `isActive`, `deletedAt` | Archive → `isActive=false`, `deletedAt=now()` |

**Indexes:** `@@unique([tenantId, code])` on both; cost center `@@index([tenantId, projectId])`.

### 3.3 `PostingDimensions` Type

**File:** `apps/api/src/modules/finance/posting/posting.types.ts`

```typescript
export interface PostingDimensions {
  branchId?: string | null;
  projectId?: string | null;
  costCenterId?: string | null;
  department?: string | null;
}
```

Present on:

- `RuleBasedFinancialPostingInput.dimensions`
- `LineBasedFinancialPostingInput.dimensions`
- Per-line `dimensions` on explicit line input
- `ResolvedPostingLine.dimensions`

**Not exposed** on any REST DTO today.

### 3.4 `FinancialPostingService` — Posting Behavior

**File:** `apps/api/src/modules/finance/posting/financial-posting.service.ts`

**Validation today (before journal insert):**

| Check | Implemented |
|-------|-------------|
| Branch belongs to tenant | ✅ `assertBranchInTenant` |
| Fiscal period open for posting date | ✅ `FiscalPeriodService.assertPostingAllowed` |
| Accounts active + posting-enabled (lines mode) | ✅ per-line lookup |
| Account roles mapped (rule mode) | ✅ |
| Lines balanced | ✅ `assertBalancedLines` |
| Idempotency / duplicate source tuple | ✅ unique constraints + re-fetch |
| **Project exists in tenant** | ❌ |
| **Cost center exists in tenant** | ❌ |
| **Project/cost center active (not archived)** | ❌ |
| **Branch compatibility with dimension masters** | ❌ |
| **Cost center ↔ project association consistency** | ❌ |
| **Department string length / format** | ❌ |

**Dimension merge on line create (L97–100):**

```text
line.dimensions?.X ?? entryDimensions?.X ?? (branchId fallback: input.branchId) ?? null
```

Precedence: **line → entry → posting branch (branchId only) → null**.

Rule-based postings propagate **entry-level** `input.dimensions` to every resolved line. Explicit lines mode supports **per-line override**.

**Critical gap:** Any UUID (including cross-tenant IDs, random UUIDs, archived masters) is written as-is — PostgreSQL accepts orphan values because there is no FK.

**Return shape:** Journal entries include `lines.account` and `fiscalPeriod` — **not** project/cost center names.

### 3.5 Finance REST DTOs & Controller

**File:** `apps/api/src/modules/finance/finance.controller.ts`

| Endpoint | DTO | `dimensions` field |
|----------|-----|-------------------|
| `POST /finance/postings/rule` | `RulePostingDto` | ❌ |
| `POST /finance/postings/lines` | `LinesPostingDto` + `PostingLineDto` | ❌ |

Controller builds `FinancialPostingInput` **without** `dimensions`. Internal callers (tests, future modules) can pass dimensions programmatically; HTTP clients cannot.

**Permissions / licensing on posting routes:**

- `@RequireModule('finance')`
- `@RequireFeature('finance.financial-posting')`
- `@RequirePermissions('finance:posting:execute')`

### 3.6 Legacy `AccountingEngineService`

**File:** `apps/api/src/common/services/accounting-engine.service.ts`

`createEntry()` writes:

- `JournalEntry`: `tenantId`, `branchId`, `number`, `description`, `referenceType`, `referenceId`
- `JournalLine`: `accountId`, `debit`, `credit`, `description` only

**Does not set:** `fiscalPeriodId`, `sourceModule/sourceType/sourceId/sourceEvent`, line `branchId`, `projectId`, `costCenterId`, `department`.

**Callers (verified grep):**

| Module | Usage |
|--------|-------|
| Sales | `sales.service.ts` — invoice post paths |
| Purchasing | `purchasing.service.ts` — PO/receipt paths |
| POS | `pos.service.ts` — sale completion |
| Accounting (seed) | `accounting.service.ts` — COA seed only |

**Phase 8.1 boundary:** Do **not** modify `AccountingEngineService` or commercial modules.

### 3.7 Journal & Ledger APIs

| API | Path | Dimension exposure |
|-----|------|-------------------|
| Legacy accounting | `GET /accounting/journal-entries` | Returns Prisma `lines` with `account` include — raw scalar `projectId`/`costCenterId`/`department` **if present** but no master joins |
| Legacy accounting | `GET /accounting/trial-balance` | Aggregates **by account only** — dimensions ignored |
| Universal finance | — | **No journal read endpoint** in `FinanceController` |
| Fiscal periods | `FiscalPeriodController` | Period management only |

**Desktop:** `AccountingPage.tsx` shows trial balance only — no journal list, no dimension columns.

### 3.8 Reporting Behavior

No server-side report filters by `projectId` or `costCenterId` were found.

`trialBalance()` sums debits/credits per account across **all** journal lines regardless of dimensions.

Dimension-aware reporting (project P&L, cost center burn, etc.) is **out of scope** for 8.1.

### 3.9 Sales / Purchasing / POS / Inventory

| Domain | GL path | Dimensions |
|--------|---------|------------|
| Sales | `AccountingEngineService.createEntry` | None |
| Purchasing | `AccountingEngineService.createEntry` | None |
| POS | `AccountingEngineService.createEntry` | None |
| Inventory | `InventoryLedgerService` — stock movements only | No GL dimensions |
| PMS ledger | Separate patient subledger (`pms/ledger`) | Not wired to universal GL (Phase 2 design) |

Integration tests (`sales.integration.spec.ts`, `purchasing.integration.spec.ts`) assert legacy vs FPS journal coexistence — **no dimension assertions**.

### 3.10 RBAC

**Finance posting (seed):**

- `finance:posting:read`, `finance:posting:execute`
- `finance:journals:read` — permission exists in seed but **no finance journal read route** implements it yet

**Legacy accounting:**

- `accounting:journals:read` — journal list
- `accounting:reports:read` — trial balance

**Projects (Phase 8.0):**

- `projects:projects:*`, `projects:cost-centers:read|manage`

Phase 8.1 does **not** require new permissions for dimension posting — existing `finance:posting:execute` suffices.

### 3.11 AuditService

- **Projects module:** audit events on create/update/archive (`projects.project.*`, `projects.cost_center.*`)
- **FinancialPostingService:** **no** audit logging on successful posts
- **AccountingEngineService:** **no** audit logging

Phase 8.1: optional audit on dimension validation failure is unnecessary; successful FPS posts remain unaudited (consistent with Phase 2). Do **not** introduce audit-in-transaction patterns.

### 3.12 Tenant / Branch Semantics

**Posting context:**

- Every FPS post requires `branchId` — validated against tenant
- Line `branchId` defaults to entry/posting branch when omitted

**Master data (Phase 8.0 rules — reuse in validation):**

| Rule | Source |
|------|--------|
| Project optional `branchId`; null = tenant-wide | `projects.service.ts` |
| Cost center optional `branchId`; null = tenant-wide | `cost-centers.service.ts` |
| Cost center linked to project must pass `assertBranchCompatibility` | `cost-centers.service.ts` |
| Archived project: `status=archived`, `deletedAt` set | `projects.service.ts` |
| Archived cost center: `isActive=false`, `deletedAt` set | `cost-centers.service.ts` |
| Cross-tenant dimension ID | Must return `404`/`400` — no leakage |

**Recommended FPS dimension branch rules (align with masters):**

1. If line/entry `branchId` override is set → must belong to tenant (same as posting branch check)
2. If `project.branchId` is set → must equal posting `branchId` **or** posting accepts tenant-wide project (`project.branchId null`)
3. If `costCenter.branchId` is set → same as project rule
4. If both `projectId` and `costCenterId` set → cost center's `projectId` must be null or match the line's `projectId`

### 3.13 Integration Test Coverage Today

| Test file | Dimension coverage |
|-----------|-------------------|
| `finance.integration.spec.ts` | FPS balance, idempotency, fiscal lock, HTTP rule posting — **zero** dimension tests |
| `projects.integration.spec.ts` | Master CRUD, branch rules, **boundary:** project create does not create journals |
| `sales.integration.spec.ts` / `purchasing.integration.spec.ts` | Legacy GL only |

---

## 4. Architecture — Dimensions Are Not Ledgers

Project and Cost Center are **analytical/management dimensions** on GL lines. They are **not**:

| Concept | Role |
|---------|------|
| Ledger | ❌ No balances stored on Project/CostCenter |
| Account | ❌ Chart of accounts unchanged |
| Subledger | ❌ No AR/AP subledger per project in 8.1 |
| Financial balance entity | ❌ Trial balance remains account-centric |

```text
General Ledger Entry (JournalEntry)
    |
    +-- JournalLine
          +-- Account (required)
          +-- Debit / Credit (required)
          +-- Branch (optional, defaults from posting)
          +-- Project (optional, validated FK target)
          +-- Cost Center (optional, validated FK target)
          +-- Department (optional free text — no master table)
```

**Department:** remains a **free-text** placeholder (`journal_lines.department`). No Department master in 8.1.

---

## 5. Target Architecture (Phase 8.1)

```text
POST /finance/postings/lines|rule
    dimensions?: { projectId?, costCenterId?, branchId?, department? }
    lines[]?.dimensions?: { ... }   // lines mode only

FinancialPostingService.post()
    1. assertBranchInTenant
    2. assertPostingDimensions (NEW)
    3. assertPostingAllowed (fiscal)
    4. resolve lines
    5. assertBalancedLines
    6. journalEntry.create with validated dimensions

journal_lines.projectId  ──FK──► projects.id (ON DELETE SET NULL)   [recommended]
journal_lines.costCenterId ──FK──► cost_centers.id (ON DELETE SET NULL) [recommended]
```

Legacy commercial path **unchanged:**

```text
Sales / Purchasing / POS
    → AccountingEngineService.createEntry()
    → journal_lines without dimensions
```

---

## 6. Recommended Implementation Scope (Phase 8.1)

### 6.1 In Scope ✅

| # | Deliverable |
|---|-------------|
| 1 | **`PostingDimensionsDto`** — nested DTO with optional UUID fields + optional `department` string (max length e.g. 128) |
| 2 | **Wire DTOs** — entry-level on `RulePostingDto` / `LinesPostingDto`; per-line on `PostingLineDto` |
| 3 | **`assertPostingDimensions()`** in FPS (or dedicated `PostingDimensionService`) — collect all dimension sets from entry + lines, validate in one pass inside caller transaction |
| 4 | **Validation rules** — see §7 |
| 5 | **Optional additive migration** — FK `journal_lines.projectId` → `projects.id`, `journal_lines.costCenterId` → `cost_centers.id`, both `ON DELETE SET NULL` |
| 6 | **Prisma relations** on `JournalLine` → `Project?`, `CostCenter?` for includes |
| 7 | **FPS response includes** — optional `project { id, code, name }`, `costCenter { id, code, name }` on lines (read convenience) |
| 8 | **Integration tests** — dimension happy path, invalid ID, archived master, cross-tenant, branch mismatch, cost center/project mismatch, REST round-trip |
| 9 | **Legacy journal list** — optional enhancement: `accounting.service.listJournalEntries` include project/costCenter selects (read-only, backward compatible) |

### 6.2 Out of Scope ❌

| Item | Reason |
|------|--------|
| Sales/Purchasing/POS → FPS migration | Explicit user constraint |
| `AccountingEngineService` dimension params | Legacy path frozen |
| Commercial document fields (`SalesInvoice.projectId`, etc.) | Phase 8.2+ |
| Dimension reports / trial balance by project | Reporting phase |
| Construction module | Hard STOP |
| PMS → GL wiring | Separate phase |
| Finance audit events on post | Not established in Phase 2 |
| New license feature for dimensions | Uses existing `finance.financial-posting` |
| `department` master table | Not requested |
| Blocking archive when journal lines reference project/cost center | Optional hardening — defer unless required (archive + SET NULL FK is sufficient for 8.1) |

### 6.3 Optional Micro-Step (8.1b)

If team prefers **validate-in-service before FK**:

1. Ship validation + REST DTOs without migration
2. Add FK in follow-up migration once production confidence gained

Phase 8.0 explicitly deferred FK for this reason. **Recommendation:** include FK in 8.1 — no writers populate orphan IDs today; validation + FK gives defense in depth.

---

## 7. Validation Rules (Normative for Implementation)

### 7.1 Project (`projectId`)

When non-null:

| Rule | Error |
|------|-------|
| UUID exists in `projects` for `tenantId` | `404 Project not found` |
| `deletedAt IS NULL` | `400 Project is archived` |
| `status NOT IN (archived)` | `400 Project is not postable` |
| If `project.branchId` set → equals posting `branchId` | `400 Project branch mismatch` |

**Postable statuses:** `draft`, `active`, `on_hold`, `completed`, `cancelled` — **exclude** `archived` only (business may post closing entries to completed projects).

### 7.2 Cost Center (`costCenterId`)

When non-null:

| Rule | Error |
|------|-------|
| UUID exists in `cost_centers` for `tenantId` | `404 Cost center not found` |
| `deletedAt IS NULL` AND `isActive = true` | `400 Cost center is inactive or archived` |
| If `costCenter.branchId` set → equals posting `branchId` | `400 Cost center branch mismatch` |
| If `costCenter.projectId` set → must equal line/entry `projectId` (when projectId also set) | `400 Cost center not linked to project` |

When `costCenterId` set but `projectId` null and cost center requires project (`costCenter.projectId` non-null): **reject** — cost center is project-scoped.

### 7.3 Branch override (`dimensions.branchId`)

When non-null on line/entry:

| Rule | Error |
|------|-------|
| Branch exists in tenant | `400 Branch not found` |

Default: omit override → use posting `branchId` (current behavior).

### 7.4 Department

| Rule | Error |
|------|-------|
| Optional string, trim whitespace | — |
| Max length 128 (recommended) | `400 Department too long` |
| Empty string → store as `null` | — |

### 7.5 Cross-Tenant

Any dimension lookup scoped by JWT `tenantId`. Missing row → **404** with generic message (match Party/Projects pattern).

---

## 8. REST API Changes

### 8.1 DTO Shape (additive, backward compatible)

```typescript
class PostingDimensionsDto {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() costCenterId?: string;
  @IsOptional() @IsString() @MaxLength(128) department?: string;
}

class RulePostingDto {
  // ... existing fields ...
  @IsOptional() @ValidateNested() @Type(() => PostingDimensionsDto)
  dimensions?: PostingDimensionsDto;
}

class PostingLineDto {
  // ... existing fields ...
  @IsOptional() @ValidateNested() @Type(() => PostingDimensionsDto)
  dimensions?: PostingDimensionsDto;
}
```

### 8.2 Example — Lines posting with entry-level dimensions

```json
POST /api/v1/finance/postings/lines
{
  "branchId": "...",
  "postingDate": "2026-09-07T00:00:00.000Z",
  "description": "Manual project allocation",
  "sourceModule": "finance",
  "sourceType": "manual",
  "sourceId": "...",
  "sourceEvent": "post",
  "dimensions": {
    "projectId": "...",
    "costCenterId": "..."
  },
  "lines": [
    { "accountRole": "cash", "debit": "100.0000", "credit": "0" },
    { "accountRole": "revenue", "debit": "0", "credit": "100.0000" }
  ]
}
```

### 8.3 Example — Per-line override (lines mode)

Second line posts to different cost center within same project — line `dimensions` overrides entry `dimensions` for that line only.

---

## 9. Schema Migration (Recommended)

**New migration** (additive):

```sql
ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_costCenterId_fkey"
  FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

**Prisma:**

```prisma
model JournalLine {
  project    Project?    @relation(fields: [projectId], references: [id], onDelete: SetNull)
  costCenter CostCenter? @relation(fields: [costCenterId], references: [id], onDelete: SetNull)
}
```

Add inverse relations on `Project` and `CostCenter` (`journalLines JournalLine[]`) — no cascade delete on masters.

**Migration constraints:**

- Safe today: no production orphan `projectId`/`costCenterId` values expected (columns never written by legacy engine)
- Pre-migration check: `SELECT COUNT(*) FROM journal_lines WHERE projectId IS NOT NULL OR costCenterId IS NOT NULL` → expect 0 in greenfield tests

---

## 10. Module Dependencies

```
FinanceModule
  imports: ProjectsModule (or exports ProjectsService / CostCentersService for validation)
```

**Avoid circular imports:** extract shared validation to `PostingDimensionService` in finance posting folder, injecting `PrismaService` only — mirror `assertBranchInTenant` pattern without importing entire ProjectsModule if unnecessary.

Reuse logic from:

- `ProjectsService.assertProjectForTenant(tenantId, id, { allowArchived: false })`
- Cost center active check mirroring `cost-centers.service.ts` find patterns

---

## 11. Integration Test Plan

Add to `finance.integration.spec.ts` (or `finance-dimensions.integration.spec.ts`):

| # | Test |
|---|------|
| 1 | Lines post with entry `dimensions.projectId` + `costCenterId` → persisted on all lines |
| 2 | Per-line dimension override → lines differ |
| 3 | Rule post with entry dimensions → all rule lines inherit |
| 4 | Invalid `projectId` → 404, no journal row |
| 5 | Archived project → 400, journal count unchanged |
| 6 | Cross-tenant project ID → 404 |
| 7 | Cost center with mismatched `projectId` → 400 |
| 8 | Branch mismatch (project.branchId ≠ posting.branchId) → 400 |
| 9 | HTTP `POST /finance/postings/lines` with dimensions → 200/201 + response includes IDs |
| 10 | Idempotent repost returns same journal with dimensions intact |
| 11 | **Regression:** Sales invoice still creates legacy journal **without** dimensions |

**Boundary test (reuse projects pattern):**

- Creating/updating Project/CostCenter still does **not** create GL entries

---

## 12. Migration Constraints & Legacy Coexistence

| Constraint | Handling |
|------------|----------|
| Dual GL paths (FPS + AccountingEngine) | Expected — legacy journals have NULL dimensions |
| NULL unique on source tuple | Legacy entries unaffected |
| Existing journals without dimensions | Valid — dimensions optional |
| Trial balance | Still account-aggregated — numbers unchanged |
| Archive project with posted lines | FK `ON DELETE SET NULL` clears line reference OR block archive if lines exist — **recommend SET NULL** (Phase 8.0 archive policy already allows historical read) |

---

## 13. Exact Phase Boundaries

```text
┌─────────────────────────────────────────────────────────────┐
│ PHASE 8.1 BOUNDARY                                          │
├─────────────────────────────────────────────────────────────┤
│ IN:  FPS validation, REST dimensions, optional FK, tests  │
│ OUT: Sales/Purchasing/POS, commercial docs, reports,      │
│      Construction, PMS GL, AccountingEngine changes         │
└─────────────────────────────────────────────────────────────┘
```

**Future phases (not 8.1):**

| Phase | Scope |
|-------|-------|
| 8.2 | Optional `projectId`/`costCenterId` on Sales/Purchasing documents + FPS migration plan |
| 8.3 | Project cost subledger, profitability reports |
| Construction vertical | BOQ, sites, certificates — separate module |

---

## 14. STOP Conditions

Do **not** proceed with implementation if:

1. Scope expands to Sales/Purchasing/POS accounting migration without approved design
2. Construction features are requested in the same phase
3. Dimension reporting is required before validation lands
4. FK migration fails due to orphan `journal_lines` data — **remediate data first**, do not skip FK indefinitely

Do **not** declare Phase 8.1 complete unless:

- [ ] FPS rejects invalid/archived/cross-tenant dimensions
- [ ] REST clients can pass `dimensions` on posting endpoints
- [ ] Integration tests cover validation matrix + legacy regression
- [ ] Typecheck passes all workspaces
- [ ] Full integration suite passes (227+ tests)
- [ ] Sales/Purchasing/POS code paths unchanged
- [ ] No Construction code introduced

---

## 15. Key File References

| Area | Path |
|------|------|
| FPS | `apps/api/src/modules/finance/posting/financial-posting.service.ts` |
| Posting types | `apps/api/src/modules/finance/posting/posting.types.ts` |
| Finance REST | `apps/api/src/modules/finance/finance.controller.ts` |
| Legacy GL | `apps/api/src/common/services/accounting-engine.service.ts` |
| Legacy journals API | `apps/api/src/modules/accounting/accounting.service.ts` |
| Projects validation | `apps/api/src/modules/projects/projects.service.ts` |
| Cost centers validation | `apps/api/src/modules/projects/cost-centers.service.ts` |
| Schema | `packages/database/prisma/schema.server.prisma` |
| Finance migration | `packages/database/prisma/migrations/20250907160000_universal_finance/` |
| Projects migration | `packages/database/prisma/migrations/20250907193000_universal_projects/` |
| Finance tests | `apps/api/test/finance.integration.spec.ts` |
| Phase 8.0 design | `docs/PHASE_8_PROJECTS_DESIGN.md` §13 |
| Phase 8.0 complete | `docs/PHASE_8_PROJECTS_COMPLETE.md` |

---

## 16. Summary

Phase 8.0 created the **master data**. Phase 8.1 closes the gap between masters and Universal Finance by:

1. **Exposing** dimensions on Finance REST posting DTOs  
2. **Validating** project/cost center existence, lifecycle, tenant, and branch rules in FPS  
3. **Optionally enforcing** referential integrity via FK on `journal_lines`  
4. **Testing** the full validation matrix while leaving legacy commercial GL untouched  

Dimensions remain **optional** on every journal line — but when provided, they become **trustworthy, first-class Finance attributes** ready for future commercial document integration in Phase 8.2+.
