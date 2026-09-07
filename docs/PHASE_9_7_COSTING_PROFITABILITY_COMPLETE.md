# PHASE 9.7 COMPLETE

Construction costing and profitability reporting aggregates planned BOQ value, contractual revisions, progress valuation, and actual `ConstructionCostEntry` costs — read-only, with no GL or inventory side effects.

---

## Architecture

```text
PLANNED          → approved BOQ totalOriginalAmount (or cost-center BOQ items)
CONTRACTUAL      → contract originalValue + approved variation deltas
EXECUTED VALUE   → latest approved progress totalCumulativeAmount
ACTUAL COST      → ConstructionCostEntry grouped by category
PROFITABILITY    → executed value − actual cost (gross margin)
```

BOQ, progress, and variations supply valuation layers. Only `ConstructionCostEntry` records operational spend. Reporting never posts to GL, inventory, or the cost subledger.

## Feature

`construction.costing`

## RBAC

- `construction:costing:read`

## API

- `GET /api/v1/construction/costing/projects/:projectId`
  - Query filters: `contractId`, `costCenterId`, `category`, `dateFrom`, `dateTo`
  - `category` / `dateFrom` / `dateTo` / `costCenterId` filter **actual cost** only
  - `contractId` scopes planned/contractual/progress to one contract
- `GET /api/v1/construction/costing/contracts/:contractId`
- `GET /api/v1/construction/costing/cost-centers/:costCenterId`

## Response layers

| Layer | Source | DTO field |
|-------|--------|-----------|
| PLANNED | Approved BOQ | `planned.originalBoqValue` |
| CONTRACTUAL | Contract + approved variations | `contractual.contractValue`, `approvedVariationsValue`, `currentContractValue` |
| EXECUTED VALUE | Approved progress certificates | `executedValue.progressValuation` |
| ACTUAL COST | Cost subledger | `actualCost.byCategory` |
| PROFITABILITY | Derived | `profitability.grossMargin`, `grossMarginPercent` |
| REMAINING BOQ | BOQ items − approved progress | `remainingBoq` |

Project costing returns a rolled-up snapshot plus per-contract breakdown in `contracts[]`.

Cost-center costing attributes BOQ items, variation deltas, progress lines, and cost entries linked to the cost center.

## Decimal safety

All amounts use `Prisma.Decimal` via `construction-money.util` helpers (`sumBoqAmounts`, `toBoqDecimal`) and are serialized with 4 decimal places.

## Performance

- Actual costs: single `groupBy` on `ConstructionCostEntry`
- Remaining BOQ: batched BOQ items, variation items, and progress items (no per-line N+1)
- Progress valuation: latest approved certificate per contract (or deduped per BOQ item for cost centers)

## Tests

`apps/api/test/construction-costing.integration.spec.ts`

Covers calculations, variation/progress impact, category and date filters, cost-center attribution, decimal precision, cross-tenant isolation, licensing, RBAC, and no GL/inventory/cost-entry mutation on read.

## Finance boundary

No `JournalEntry`, `FinancialPostingService`, `AccountingEngineService`, or `InventoryLedgerService` calls from costing endpoints.

## Files

| File | Purpose |
|------|---------|
| `construction-costing.service.ts` | Aggregation logic |
| `construction-costing.controller.ts` | HTTP routes |
| `dto/construction-costing.dto.ts` | Query + response DTOs |
| `feature-catalog.ts` | `construction.costing` |
| `seed.ts` / `test-app.ts` | RBAC seed |
| `construction-test.helpers.ts` | License feature list |
