# Phase 8.1 — Finance Dimensions & Posting Integration COMPLETE

**Status:** COMPLETE — 2026-09-07  
**Prerequisites:** Phase 8.0 Projects + Cost Centers ✅, Phase 2 Finance ✅

---

## Summary

Phase 8.1 makes **Project** and **Cost Center** first-class, validated Finance dimensions on the Universal Finance posting path (`FinancialPostingService`). Legacy commercial GL (`AccountingEngineService`) is unchanged.

```text
POST /finance/postings/rule|lines
    dimensions?: { projectId?, costCenterId? }
        ↓
FinancialPostingService
    → PostingDimensionService (validate + row lock)
        ↓
journal_lines.projectId / costCenterId (FK-enforced)
```

---

## Deliverables

| Item | Status |
|------|--------|
| `PostingDimensionService` — tenant, lifecycle, branch, project↔CC compatibility | ✅ |
| `FinancialPostingService` — validates before insert, includes project/costCenter in response | ✅ |
| REST `dimensions` on `POST /finance/postings/rule` and `/lines` | ✅ |
| Fixed `LinesPostingDto` (no longer inherits required `amounts`) | ✅ |
| FK `journal_lines` → `projects` / `cost_centers` (`ON DELETE SET NULL`) | ✅ |
| Prisma relations on `JournalLine` | ✅ |
| Integration tests (10 new cases in `finance.integration.spec.ts`) | ✅ |
| Legacy regression — `AccountingEngineService` without dimensions | ✅ |

---

## Validation Rules (Implemented)

### Project (`projectId`)

| Rule | HTTP |
|------|------|
| Exists in tenant | 404 `Project not found` |
| `deletedAt` null | 400 `Project is archived` |
| Status in `draft`, `active`, `on_hold`, `completed` | 400 `Project is not postable` |
| `cancelled`, `archived` rejected | 400 |
| Branch-specific project must match posting `branchId` | 400 `Project branch mismatch` |

Rows locked with `SELECT … FOR UPDATE` inside caller transaction.

### Cost Center (`costCenterId`)

| Rule | HTTP |
|------|------|
| Exists in tenant | 404 `Cost center not found` |
| Active, not archived | 400 `Cost center is inactive or archived` |
| Branch-specific CC must match posting branch | 400 `Cost center branch mismatch` |
| CC with `projectId` requires matching line `projectId` | 400 `Cost center not linked to project` |
| CC with `projectId` but no line `projectId` | 400 (same message) |
| Shared CC (`projectId` null) | Allowed with any project |

### Security

- Tenant ID always from JWT — never from client body
- Cross-tenant dimension IDs → 404 (no leakage)

---

## Schema Migration

**File:** `packages/database/prisma/migrations/20250907194500_finance_dimension_fks/migration.sql`

```sql
journal_lines.projectId    → projects.id    (ON DELETE SET NULL)
journal_lines.costCenterId → cost_centers.id (ON DELETE SET NULL)
```

---

## Key Files

| Path | Change |
|------|--------|
| `apps/api/src/modules/finance/posting/posting-dimension.service.ts` | **New** — validation + locking |
| `apps/api/src/modules/finance/posting/financial-posting.service.ts` | Dimension assert + response includes |
| `apps/api/src/modules/finance/finance.controller.ts` | `PostingDimensionsDto`, DTO refactor |
| `apps/api/src/modules/finance/finance.module.ts` | Register `PostingDimensionService` |
| `packages/database/prisma/schema.server.prisma` | JournalLine ↔ Project/CostCenter relations |
| `apps/api/test/finance.integration.spec.ts` | Phase 8.1 test suite |
| `docs/PHASE_8_1_FINANCE_DIMENSIONS_DESIGN.md` | Audit / design (pre-implementation) |

---

## Explicitly NOT Changed

- `AccountingEngineService`
- Sales / Purchasing / POS services
- Commercial document schemas
- Inventory, PMS, Party modules
- Trial balance / dimension reports
- Construction

---

## Verification

| Check | Result |
|-------|--------|
| `finance.integration.spec.ts` | **29/29 PASS** (+10 dimension tests) |
| Full API integration suite | **235/237 PASS** (2 unrelated PMS patient search flakes) |
| Typecheck | Run `npm run typecheck` at repo root |

---

## Next Phase Candidates

| Phase | Scope |
|-------|-------|
| **8.2** | Optional project/cost center on Sales/Purchasing documents + FPS migration plan |
| **8.3** | Project cost subledger + dimension reporting |
| **Construction** | Separate vertical — not started |

---

## Design Reference

See [PHASE_8_1_FINANCE_DIMENSIONS_DESIGN.md](./PHASE_8_1_FINANCE_DIMENSIONS_DESIGN.md) for full audit baseline and boundaries.
