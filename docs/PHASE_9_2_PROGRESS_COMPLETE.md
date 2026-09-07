# PHASE 9.2 COMPLETE

Construction Progress measures executed work against an approved BOQ revision. It is operational measurement only — not billing, not GL, not actual cost.

Progress remains permanently tied to the exact BOQ revision (`boqId`). Approved progress is immutable.

Phase 9.2 does not implement Variations, Certificates, Retention Accounting, Material Consumption, or Construction GL posting.

---

## Architecture

```text
Universal Project → Profile → Contract → BOQ (approved revision) → Progress → Progress Items
```

## Progress Header

`ConstructionProgress` with `PRG-YYYY-NNNNNN` numbering, period dates, lifecycle status, cached valuation totals.

## Progress Items

Lines reference `boqItemId` with current period quantity, previous/cumulative quantities, rate snapshot, and amounts.

## BOQ Revision Binding

Every progress record references one `boqId`. Historical progress on superseded revisions remains readable and unchanged.

## Quantity Rules

`cumulative = previousApprovedCumulative + currentPeriod`. MVP rejects cumulative quantity above BOQ planned quantity.

## Valuation

`Prisma.Decimal(18,4)` — `currentAmount = currentQty × rateSnapshot`, `cumulativeAmount = cumulativeQty × rateSnapshot`.

## Lifecycle

`draft` → `submitted` → `approved` | `rejected` → `draft` (reopen) | `archived`

## Licensing

Feature: `construction.progress`

## RBAC

- `construction:progress:read`
- `construction:progress:manage`
- `construction:progress:submit`
- `construction:progress:approve`

## API

`/api/v1/construction/progress` with submit, approve, reject, reopen, archive, and nested items.

## Desktop

Minimal Construction Progress page gated by module + feature + RBAC.

## Finance Boundary

No JournalEntry, FinancialPostingService, or AccountingEngineService on progress operations.

## Inventory Boundary

No inventory movement on progress operations.

## Cost Subledger Boundary

No ConstructionCostEntry created from progress.

## Tests

`apps/api/test/construction-progress.integration.spec.ts`

## Typecheck

PASS

## Full Regression

All API integration tests PASS after migration apply.

## Risks

- Post-approval corrections require new period or future reversal entity
- Cross-revision contract rollups deferred to reporting phases

## Future

Phase 9.3 Variations — effective quantity caps for progress
