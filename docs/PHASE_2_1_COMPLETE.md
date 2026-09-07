# Phase 2.1 Complete — Fiscal Period Concurrency Safety

**Status:** Complete  
**Date:** 2026-09-07  
**Scope:** Close the Phase 2 verification gate High finding — fiscal period close/lock race during GL posting

---

## 1. Problem Fixed

**Before:** `FiscalPeriodService.assertPostingAllowed()` read fiscal period status without row locking. Under PostgreSQL `READ COMMITTED`, another transaction could `closePeriod()` or `lockPeriod()` between validation and `journalEntry.create`, allowing a journal to be inserted into a period that had already committed as closed/locked.

**After:** Posting transactions lock the matching fiscal-period row with `SELECT ... FOR UPDATE` inside the caller-owned transaction. `closePeriod()` / `lockPeriod()` acquire the same row lock before updating status, so they block until an in-flight posting transaction completes.

---

## 2. Files Changed

| File | Change |
|------|--------|
| `apps/api/src/modules/finance/fiscal-periods/fiscal-period.service.ts` | `assertPostingAllowed()` uses `FOR UPDATE` when `tx` is supplied; `closePeriod()` / `lockPeriod()` wrap updates in `$transaction` with row lock |
| `apps/api/test/finance.integration.spec.ts` | Added Phase 2.1 integration tests (6 cases) |
| `docs/PHASE_2_1_COMPLETE.md` | This document |
| `docs/PHASE_2_FINANCE_COMPLETE.md` | Updated remaining-risks note for fiscal period race |

No Prisma schema or migration changes.

---

## 3. Locking Strategy

```
FinancialPostingService.post(input, tx)     ← caller-owned transaction (unchanged)
        │
        ▼
assertPostingAllowed(tenantId, date, tx)
        │
        ▼
SELECT * FROM fiscal_periods
  WHERE tenantId = ?
    AND startDate <= postingDate
    AND endDate >= postingDate
  ORDER BY startDate DESC
  LIMIT 1
  FOR UPDATE                              ← row lock held until tx commits/rolls back
        │
        ▼
verify status = open
        │
        ▼
resolve lines + journalEntry.create
        │
        ▼
commit
```

**Close / lock path:**

```
closePeriod() / lockPeriod()
        │
        ▼
prisma.$transaction(tx => ...)
        │
        ▼
SELECT * FROM fiscal_periods WHERE id = ? AND tenantId = ? FOR UPDATE
        │
        ▼
UPDATE status = closed | locked
```

If posting holds the row lock, close/lock **blocks** until posting finishes. If close/lock commits first, posting's `FOR UPDATE` reads `closed`/`locked` and rejects.

When `assertPostingAllowed()` is called **without** `tx` (read-only validation), behavior is unchanged — no lock, same validation rules.

---

## 4. Transaction Behavior

| Rule | Status |
|------|--------|
| `FinancialPostingService.post(input, tx)` uses caller transaction only | ✅ Unchanged |
| No nested `$transaction()` inside posting path | ✅ Unchanged |
| Row lock acquired inside caller `tx` | ✅ New |
| Journal header + lines remain atomic (nested create) | ✅ Unchanged |
| Legacy `AccountingEngineService` untouched | ✅ Unchanged |
| PMS ledger untouched | ✅ Unchanged |

---

## 5. Tests Added

All in `apps/api/test/finance.integration.spec.ts` → `Phase 2.1 fiscal period locking`:

| # | Test | Verifies |
|---|------|----------|
| 1 | Full posting path rejects closed period | `FinancialPostingService.post()` → `BadRequestException`; journal count unchanged |
| 2 | Full posting path rejects locked period | Same for `locked` status |
| 3 | Cross-tenant explicit `accountId` | Tenant A lines post with Tenant B account → `NotFoundException`; no journal |
| 4 | Missing role mapping | Delete `cash` mapping → rule post → `NotFoundException`; mapping restored in `finally` |
| 5 | Posting vs concurrent `closePeriod` | Real concurrent PostgreSQL transactions; close blocks while posting holds `FOR UPDATE`; posting commits before close; no journal in pre-commit closed period |
| 6 | Posting after period already closed | Close wins first → posting rejected; no journal |

Concurrency test uses a deferred barrier (not mocks): posting transaction acquires the row lock, signals, waits, then completes journal creation while a parallel `closePeriod()` attempt blocks on the same row.

---

## 6. Test Results

```bash
npm run typecheck -w @fratelanza/api   # PASS
npm test -w @fratelanza/api            # 75/75 PASS
```

| Suite | Tests |
|-------|-------|
| auth | 5 |
| concurrency | 3 |
| resilience | 7 |
| pms-ledger | 24 |
| pms-patients | 17 |
| **finance** | **19** (+6 from Phase 2.1) |
| **Total** | **75** |

---

## 7. Remaining Phase 2 Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Dual posting paths (legacy + new) | **High** | ERP still uses `AccountingEngineService` |
| Legacy journals lack source/idempotency | **Medium** | NULL-safe unique indexes |
| No period enforcement on legacy path | **Medium** | Only `FinancialPostingService` enforces periods |
| Concurrent idempotency loser may get 409 | **Low** | P2002 re-fetch edge under READ COMMITTED |
| Overlapping open fiscal periods ambiguous | **Low** | App picks latest `startDate`; no DB exclusion constraint |
| Legacy `AccountingEngineService` JS float balance check | **Low** | Legacy only |
| `postedAt` backfill on legacy journals | **Low** | Migration-time default on old rows |

**Resolved in Phase 2.1:** Fiscal period close/lock race during posting.

---

## 8. Phase 3 Readiness

Universal Finance foundation now satisfies the Phase 2 verification gate fiscal-period concurrency requirement. Remaining risks are legacy-path and migration-scope items, not blockers for non-GL Phase 3 work (e.g. Contacts/Party).

**READY FOR PHASE 3** — with the understanding that ERP GL migration and production finance cutover still require addressing dual-path and legacy period-enforcement risks in later phases.

---

## STOP

Phase 2.1 is complete. Do not proceed automatically. Await approval before Phase 3.
