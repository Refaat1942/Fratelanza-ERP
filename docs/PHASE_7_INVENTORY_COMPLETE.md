# PHASE 7 COMPLETE

**Universal Inventory & Warehousing Foundation — Phase 7.0 Hardening**

**Date:** 2026-09-07  
**Status:** Complete

> **This phase is inventory foundation hardening, not a full legacy inventory rewrite.**

**Inventory is a separately licensable Business Core module, while stock mutations originating from separately licensed Sales, Purchasing, or POS transactions are not blocked solely by absence of the standalone Inventory license.**

---

## Universal Inventory Scope

Phase 7.0 delivered:

- `inventory.stock` feature entitlement
- Server-side feature guards on inventory-native routes
- Hardened adjustment validation (tenant, warehouse, product, branch)
- Audit on manual adjustments
- Dedicated integration test suite
- Minimal desktop entitlement gating
- No stock transfers, returns, batches, GL changes, or commercial module rewrites

---

## Current Inventory Architecture

```text
Inventory Product (licensed Business Core)
       │
       ├── Product / SKU / Barcode  (products module)
       ├── UOM                      (products module)
       ├── Warehouse                (warehouses module)
       ├── Stock Balance            (StockBalance)
       └── Stock Ledger             (InventoryMovement via InventoryLedgerService)
              ▲
              │ applyMovement() only
              │
    Sales post │ Purchasing receive │ POS sale │ Manual adjust
```

All stock mutations route through `InventoryLedgerService.applyMovement()`. No parallel engines.

---

## Licensing Model

| Layer | Inventory-native routes | Commercial stock side effects |
|-------|-------------------------|------------------------------|
| Module | `@RequireModule('inventory')` | `sales`, `purchasing`, or `pos` |
| Feature | `@RequireFeature('inventory.stock')` | `sales.invoices`, `purchasing.orders`, or none (POS) |
| RBAC | `inventory:stock:*`, `inventory:movements:read` | Module-specific permissions |

Feature registered: **`inventory.stock`** only (no fake transfer/return keys).

Demo license includes `inventory` module and `inventory.stock` via updated `DEMO_ENABLED_FEATURES`.

---

## Inventory-native Operations

Protected routes:

| Method | Route | Permission |
|--------|-------|------------|
| GET | `/inventory/balances` | `inventory:stock:read` |
| GET | `/inventory/movements` | `inventory:movements:read` |
| POST | `/inventory/adjust` | `inventory:stock:adjust` |

All require inventory module + `inventory.stock` feature + RBAC.

---

## Cross-module Stock Side Effects

Verified by integration tests — **no inventory license required**:

| Flow | Route | movementType |
|------|-------|--------------|
| Sales post | `POST /sales/invoices/:id/post` | `sale` |
| PO receive | `POST /purchasing/orders/:id/receive` | `purchase` |
| POS sale | `POST /pos/sales` (with `warehouseId`) | `pos_sale` |

Sales/Purchasing/POS services unchanged. No `@RequireFeature('inventory.stock')` inside `InventoryLedgerService`.

---

## Inventory Adjustment

**File:** `apps/api/src/modules/inventory/inventory.service.ts`

Hardening added:

- Warehouse must belong to tenant (not deleted)
- Product must belong to tenant (not deleted)
- Branch context must match warehouse branch when provided
- Movement via `InventoryLedgerService.applyMovement()` inside `$transaction`
- Audit logged after successful movement (`inventory.adjustment.created`)
- Generic errors for cross-tenant IDs (`Product not found`, `Warehouse not found`)

---

## Tenant Isolation

- Cross-tenant product/warehouse on adjust → 400 with generic message
- Cross-tenant warehouse filter on balances/movements → 400 `Warehouse not found`
- No information leakage about other tenants' inventory

---

## Warehouse Semantics

Preserved branch-scoped warehouse model. Warehouse belongs to one branch; adjust validates branch alignment when `branchId` is supplied.

---

## Stock Ledger

`InventoryLedgerService` remains frozen. Weighted-average costing unchanged. Movement types unchanged:

- `sale`, `purchase`, `pos_sale`, `adjustment_in`, `adjustment_out`

---

## Atomicity

Adjustments use `$transaction` for movement + balance update. Audit follows movement commit (same pattern as Sales/Purchasing Party flows — avoids connection pool contention under concurrency).

Insufficient stock rolls back movement and balance update.

---

## Audit

| Event | Entity | Action |
|-------|--------|--------|
| Manual adjust | `inventory_movement` | `inventory.adjustment.created` |

Payload: productId, warehouseId, movementType, quantity, notes. Does not duplicate full ledger row.

---

## Sales Integration

Unchanged. Sales post continues to deduct stock via `InventoryLedgerService` when invoice has warehouse and product tracks inventory. Legacy `AccountingEngineService` COGS/inventory GL unchanged.

Regression test: sales post succeeds without standalone inventory license.

---

## Purchasing Integration

Unchanged. PO receive continues to increase stock via `InventoryLedgerService`. Legacy AP/inventory GL unchanged.

Regression test: PO receive succeeds without standalone inventory license.

---

## POS Integration

Unchanged. POS sale deducts stock when `warehouseId` provided. No COGS/inventory GL (known gap, not fixed).

Regression test: POS sale with warehouse succeeds without standalone inventory license.

---

## Finance Boundary

| Operation | GL path | Phase 7 change |
|-----------|---------|----------------|
| Sales post | `AccountingEngineService` | None |
| PO receive | `AccountingEngineService` | None |
| POS sale | Revenue/cash only | None |
| Stock adjust | No GL | None |

`FinancialPostingService` not wired. No duplicate GL entries.

---

## RBAC

Existing permissions preserved:

- `inventory:stock:read`
- `inventory:movements:read`
- `inventory:stock:adjust`

No new permissions invented.

---

## Desktop

- `LicensedRoute` accepts optional `featureKey`
- Inventory route: `moduleKey="inventory"` + `featureKey="inventory.stock"`
- Nav hides inventory when module or feature disabled
- Sales/Purchasing nav unaffected when inventory unlicensed

---

## Tests

**New:** `apps/api/test/inventory.integration.spec.ts` — 17 tests

Covers: licensing, feature disable, cross-module stock regression (Sales/Purchasing/POS), adjustment validation, tenant isolation, audit, RBAC, rollback.

**Full regression:** **200/200 PASS**

---

## Typecheck

API typecheck: PASS  
Desktop: pre-existing `PartiesPage.tsx` error unrelated to Phase 7

---

## Full Regression

All integration suites pass including Sales, Purchasing, Party, Finance, PMS, Licensing, Auth, concurrency, resilience.

---

## Known Risks

| Risk | Status |
|------|--------|
| Three separate modules (products/warehouses/inventory) | Documented — not merged |
| Commercial flows bypass inventory license | By design (Phase 7.0) |
| No GL on adjustments | Documented — future finance sub-phase |
| POS stock without COGS GL | Documented — unchanged |
| Audit after movement commit (not same DB tx) | Matches Sales/Purchasing pattern |

---

## Future Inventory Evolution

Phase 7.1+ candidates (not started):

- Inter-warehouse transfers with numbered documents
- Partial PO receive
- Sales/purchase return inventory flows
- Optional inventory license enforcement on commercial post/receive
- GL for adjustments
- Location/bin, batch/lot, expiry, reservations

---

## Phase 8 Recommendation

**Do not start Phase 8.** Next inventory work should be an explicit Phase 7.1 sub-phase (e.g. transfers or commercial license coupling policy) with its own design approval — not an ad-hoc expansion.

See [PHASE_7_INVENTORY_DESIGN.md](./PHASE_7_INVENTORY_DESIGN.md) for full audit baseline.
