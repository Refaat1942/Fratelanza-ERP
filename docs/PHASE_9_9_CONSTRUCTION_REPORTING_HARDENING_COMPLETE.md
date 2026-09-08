# PHASE 9.9 COMPLETE

Construction reporting delivers read-only operational reports across projects, contracts, BOQ, progress, variations, costs, billing, retention, advances, and profitability — tenant-scoped with batched queries and no GL/inventory side effects.

---

## Architecture

```text
Construction sources (Projects, Contracts, BOQ, Progress, Variations,
Retention, Advances, ConstructionCostEntry, Sales billings, JournalLines)
    → ConstructionReportingService (aggregations, no mutations)
    → GET /api/v1/construction/reports/*
```

Operational profitability uses progress valuation minus `ConstructionCostEntry` totals (via `ConstructionCostingService`). Financial journal-line totals are supplementary on the profitability report only.

## Feature

`construction.reports`

## RBAC

| Permission | Actions |
|------------|---------|
| `construction:reports:read` | All construction report endpoints |

## API

Base: `/api/v1/construction/reports`

Shared query filters (where applicable):

| Filter | Scope |
|--------|-------|
| `projectId` | Required for project-scoped reports; optional filter elsewhere |
| `contractId` | Contract-scoped reports and filters |
| `costCenterId` | Progress vs BOQ, costing-derived reports, actual cost |
| `category` | Actual cost / profitability cost layer |
| `dateFrom`, `dateTo` | Cost entries, billing createdAt, journal entryDate |
| `status` | Contextual: contract, BOQ, variation, billing status |

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/project-summary` | Project profile, entity counts, costing snapshot |
| `GET` | `/contract-summary` | Contract list with BOQ/progress/variation/billing counts |
| `GET` | `/boq-status` | BOQ revisions with status, totals, item counts |
| `GET` | `/progress-vs-boq` | Planned vs executed quantities/values per BOQ item |
| `GET` | `/variation-impact` | Variation deltas with approved/pending totals |
| `GET` | `/actual-cost` | `ConstructionCostEntry` grouped by category |
| `GET` | `/cost-by-cost-center` | Cost entries grouped by cost center + unassigned |
| `GET` | `/revenue-billing` | Billing totals by status with linked sales invoice refs |
| `GET` | `/retention` | Retention held/released/balance by contract |
| `GET` | `/advances` | Advance received/recovered/balance by contract |
| `GET` | `/profitability` | Costing snapshot + optional journal-line financial layer |
| `GET` | `/remaining-work` | Remaining BOQ value/items + gross margin |

## Guards

- `@RequireModule('construction')`
- `@RequireFeature('construction.reports')`
- `@RequirePermissions('construction:reports:read')`
- `@TenantId()` on every query — cross-tenant IDs return 404
- Read-only: no GL, inventory, cost subledger, or billing mutations

## Performance

- Actual costs: single `groupBy` on `ConstructionCostEntry`
- Cost by cost center: one `groupBy` + one cost-center lookup
- Progress vs BOQ: batched BOQ items + progress items (latest per item deduped in memory)
- Retention/advances: single entry fetch per scope, aggregated in memory
- Profitability / remaining work: delegated to `ConstructionCostingService` (Phase 9.7 patterns)

## Hardening (quick wins)

- `ListConstructionBillingQueryDto.status` now validated with `@IsEnum(ConstructionBillingStatus)`

## Tests

`apps/api/test/construction-reporting.integration.spec.ts`

Covers all 12 report endpoints, filters, licensing, RBAC, cross-tenant isolation, and read-only boundary (no journal/inventory/cost-entry mutation).

## Files

| File | Purpose |
|------|---------|
| `construction-reporting.service.ts` | Report aggregation logic |
| `construction-reporting.controller.ts` | HTTP routes |
| `dto/construction-reporting.dto.ts` | Query + response DTOs |
| `feature-catalog.ts` | `construction.reports` |
| `seed.ts` / `test-app.ts` | RBAC seed |
| `construction-test.helpers.ts` | License feature list |
| `construction.module.ts` | Module registration |

## Finance boundary

Reporting never calls `FinancialPostingService`, `AccountingEngineService`, or `InventoryLedgerService`. Journal lines are read-only aggregates on profitability only.
