# PHASE 9.3 COMPLETE

Construction Variations record approved commercial changes against a BOQ revision without mutating historical BOQ data.

Approved variations adjust effective construction state: contract `revisedValue` and progress quantity caps via `effectiveQuantity = plannedQuantity + approvedVariationDeltas`.

Historical approved BOQ revisions and approved progress remain immutable.

No GL, Inventory, or ConstructionCostEntry side effects in this phase.

---

## Architecture

```text
Contract → BOQ (approved revision) → Variation → Variation Items
                                              ↓
                         effective quantity limits for Progress
                         contract.revisedValue on approval
```

## Entities

- `ConstructionVariation` — `VAR-YYYY-NNNNNN`, lifecycle, total amount delta
- `ConstructionVariationItem` — quantity/rate/lump-sum deltas with computed `amountDelta`

## Variation Types

- `quantity_change` — delta against existing BOQ line
- `rate_change` — rate adjustment valued against planned quantity
- `omission` — negative quantity delta
- `addition` — new scope (lump sum or qty × rate)
- `lump_sum` — contract-level amount adjustment

## Effective Quantity

`getEffectiveQuantityLimit(tenantId, boqId, boqItemId)` sums approved quantity deltas on the same BOQ revision. Progress service uses this instead of raw `plannedQuantity`.

## Contract Value

On variation approval: `revisedValue = originalValue + sum(approved variation totalAmountDelta)`.

## Lifecycle

`draft` → `submitted` → `approved` | `rejected` → `draft` (reopen) | `archived`

Approved variations are immutable.

## Licensing

Feature: `construction.variations`

## RBAC

- `construction:variations:read`
- `construction:variations:manage`
- `construction:variations:approve`

## API

`/api/v1/construction/variations` with submit, approve, reject, reopen, archive, and nested items.

## Tests

`apps/api/test/construction-variations.integration.spec.ts` — 25 tests

## Full Regression

361/361 API integration tests PASS

## Typecheck

PASS

## Finance Boundary

No JournalEntry, FinancialPostingService, or AccountingEngineService.

## Inventory Boundary

No inventory movement.

## Cost Subledger Boundary

No ConstructionCostEntry from variations.

## Future

Phase 9.4 Retention + Advances
