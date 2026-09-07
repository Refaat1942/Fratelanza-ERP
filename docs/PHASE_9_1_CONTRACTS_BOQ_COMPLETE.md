# PHASE 9.1 COMPLETE

Construction Contracts and BOQ are Construction-specific vertical capabilities.

Universal Project remains the project identity.

BOQ planned values are not actual ConstructionCostEntry values.

Phase 9.1 does not implement Progress, Variations, Retention Accounting, Material Consumption, or Construction GL posting.

---

## Architecture

```text
Universal Project
      ↓
ConstructionProjectProfile (Phase 9.0)
      ↓
ConstructionContract (Phase 9.1)
      ↓
ConstructionBoq → Sections → Items
```

No duplicate project master. Contract inherits branch from project/default branch for numbering.

## Construction Contracts

Unified `ConstructionContract` model with:

- `direction`: `customer` | `subcontractor`
- `pricingModel`: `lump_sum` | `unit_price` | `cost_plus` | `mixed`
- Numbering: `CNT-YYYY-NNNNNN` via `DocumentNumberService`
- Retention/advance/payment metadata fields only (no accounting)

## Contract Lifecycle

Statuses: `draft`, `active`, `suspended`, `completed`, `cancelled`, `archived`

Implemented in `construction-contract-lifecycle.ts`. Archived contracts are immutable.

## Party Integration

Counterparty is Universal Party with role validation:

- Customer contracts require active `customer` role
- Subcontractor contracts require active `subcontractor` role

## BOQ

`ConstructionBoq` header with sections and items. Numbering: `BOQ-YYYY-NNNNNN` plus `revisionNumber`.

## BOQ Revisions

Approved BOQ is immutable. Revisions create new BOQ rows; prior approved revision becomes `superseded`. Partial unique index enforces one approved BOQ per contract.

## BOQ Sections

Max two hierarchy levels (section + sub-section). Cycle and self-parent rejected.

## BOQ Items

`originalAmount = plannedQuantity × unitRate` using `Prisma.Decimal` (4 dp). Optional Product, UOM, Cost Center, and `costCode` string.

## Decimal Calculations

`construction-money.util.ts` — no JavaScript float arithmetic.

## Cost Center

Optional FK on BOQ item; validated via `PostingDimensionService.assertCostEntryDimensions`.

## Cost Code

String field on BOQ item only — no CostCode master table.

## Product / UOM

Optional references; BOQ item ≠ Product.

## Licensing

Features: `construction.contracts`, `construction.boq` (plus `construction.foundation` dependency).

## RBAC

- `construction:contracts:read`, `construction:contracts:manage`
- `construction:boq:read`, `construction:boq:manage`, `construction:boq:approve`

## Tenant Isolation

All entities tenant-scoped; cross-tenant references rejected in service layer and integration tests.

## Branch Semantics

Contract `branchId` resolved from project branch or tenant default — never null for numbering.

## Audit

Contract/BOQ lifecycle events logged via `AuditService`.

## API

- `/api/v1/construction/contracts`
- `/api/v1/construction/contracts/:contractId/boqs`
- `/api/v1/construction/boqs/:id` (+ approve, revise, sections, items)

## Desktop

Minimal UI: Construction Contracts list/create, BOQ editor with approve/revise flow. Gated by module + feature entitlements.

## Finance Boundary

No `JournalEntry`, `FinancialPostingService`, or `AccountingEngineService` on contract/BOQ CRUD.

## Inventory Boundary

No `InventoryMovement` or stock mutation from BOQ operations.

## Cost Subledger Boundary

No `ConstructionCostEntry` created from contract or BOQ lifecycle.

## Tests

`apps/api/test/construction-contracts-boq.integration.spec.ts` — 42 Phase 9.1 scenarios.

## Typecheck

Pass after Prisma generate and API build.

## Full Regression

Full API integration suite run after migration apply.

## Risks

- Contract value vs BOQ total alignment uses first-approval sync unless `originalValueLocked`
- Concurrent BOQ revision relies on DB constraints + service checks

## Future Progress

Phase 9.2+ — sites/WBS, progress certificates (not started).

## Future Variations

Commercial variations module deferred.

## Phase 9.2 Recommendation

Implement construction sites/WBS on top of this contract/BOQ baseline before progress billing.
