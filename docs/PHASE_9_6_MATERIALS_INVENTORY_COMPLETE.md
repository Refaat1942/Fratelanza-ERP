# PHASE 9.6 COMPLETE

Construction material issues link warehouse inventory to construction projects via `InventoryLedgerService` and the construction cost subledger — without GL posting.

---

## Architecture

```text
Construction Project (+ profile)
    ↓
Material Issue (draft) → issue action
    ↓
InventoryLedgerService.applyMovement (project_issue)
    ↓
ConstructionCostEntry (material category, per line)
```

BOQ item and cost center are optional attribution dimensions. Cost uses authoritative `StockBalance.avgCost` at issue time (weighted-average inventory costing).

## Entities

- `ConstructionMaterialIssue` — header with `MIS-YYYY-NNNNNN` number, status (`draft` | `issued` | `cancelled`)
- `ConstructionMaterialIssueLine` — product, quantity, unit/total cost snapshots, `inventoryMovementId` link

## Validation

- Construction profile required on project
- Active warehouse, product (track inventory), optional cost center on project
- Optional BOQ item must belong to project
- Stock availability enforced by `InventoryLedgerService` on issue
- Issue and cost entry in same `$transaction`; full rollback on failure

## Licensing

Feature: `construction.materials`

## RBAC

- `construction:materials:read`
- `construction:materials:issue`

## API

- `GET/POST /api/v1/construction/material-issues`
- `GET /api/v1/construction/material-issues/:id`
- `POST /api/v1/construction/material-issues/:id/issue`
- `POST /api/v1/construction/material-issues/:id/cancel`

## Inventory Integration

- Movement type: `project_issue`
- Reference: `construction_material_issue` / issue id
- Uses global `InventoryLedgerService` only — no `ConstructionInventory`

## Cost Subledger

Per-line idempotency: `(construction, material_issue_line, lineId, issue)`

## Tests

`apps/api/test/construction-materials.integration.spec.ts`

## Finance Boundary

No JournalEntry, FinancialPostingService, or AccountingEngineService.

## Future

Phase 9.7+ may add material requisitions, returns, and BOQ consumption tracking.
