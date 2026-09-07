# Phase 7 — Universal Inventory & Warehousing Foundation Design

**Status:** Phase 7.0 implemented — 2026-09-07  
**Prerequisites:** Phase 5 Sales ✅, Phase 6 Purchasing ✅, Phase 2.1 Finance ✅

> **Principle:** Establish inventory as a horizontal Business Core capability. **Do not rewrite legacy inventory blindly.** Extend the existing `InventoryLedgerService` foundation.

---

## Commercial Licensing Model (Phase 7.0 — Implemented)

Inventory is a **separately licensable Business Core module**. Stock mutations are split into two categories:

### A. Inventory-native operations

Require **all** of:

- `inventory` module license
- `inventory.stock` feature entitlement
- RBAC (`inventory:stock:read`, `inventory:movements:read`, `inventory:stock:adjust`)

Examples: direct stock balance view, movement ledger view, manual stock adjustment.

Protected server-side via `@RequireModule('inventory')` + `@RequireFeature('inventory.stock')` on inventory controller routes.

### B. Stock side effects of other licensed business operations

**Do NOT** require standalone Inventory license.

| Flow | Controlling license | Stock engine |
|------|---------------------|--------------|
| Sales invoice post | `sales` + `sales.invoices` | `InventoryLedgerService.applyMovement()` |
| PO receive | `purchasing` + `purchasing.orders` | `InventoryLedgerService.applyMovement()` |
| POS sale (with warehouse) | `pos` module + RBAC | `InventoryLedgerService.applyMovement()` |

The controlling business module remains responsible for authorization. Stock mutations still go exclusively through `InventoryLedgerService.applyMovement()` — no second engine, no inventory license check inside the ledger service.

**Explicit product statement:** Inventory is a separately licensable Business Core module, while stock mutations originating from separately licensed Sales, Purchasing, or POS transactions are not blocked solely by absence of the standalone Inventory license.

---

## 1. Repository Audit Summary

This audit searched the full repository: schema, services, controllers, licensing, accounting, sync, desktop, and tests. Findings below are evidence-based — not assumptions.

### 1.1 What Exists Today

| Layer | Implementation | Status |
|-------|----------------|--------|
| Product master | `Product`, `ProductCategory`, `UnitOfMeasure` | Production-ready legacy |
| Warehousing | `Warehouse` (branch-scoped) | Production-ready legacy |
| Stock balance | `StockBalance` (tenant + warehouse + product) | Active |
| Stock ledger | `InventoryMovement` + `InventoryLedgerService` | **Single source of stock mutations** |
| Inventory API | balances, movements list, adjust | Module-licensed |
| Products API | CRUD + categories + UOM | Separate `products` module |
| Warehouses API | CRUD | Separate `warehouses` module |

### 1.2 What Does NOT Exist

| Capability | Status |
|------------|--------|
| `ProductVariant` | Not in schema |
| Warehouse bin/location hierarchy | Not in schema |
| Batch/lot tracking | Not in schema |
| Expiry dates | Not in schema |
| Serial numbers | Not in schema |
| Stock transfer (inter-warehouse) | No API, model, or service |
| Sales/purchase returns (inventory) | No dedicated flow |
| Stock reservation/allocation | Not implemented |
| Numbered adjustment documents | Adjust is ad-hoc POST |
| Inventory-specific feature entitlements | Module-only licensing |
| GL posting for stock adjustments | No accounting call |
| Dedicated inventory integration test suite | Indirect coverage only |
| Inventory audit events (`AuditService`) | Movements table only |

---

## 2. Schema Audit

**Primary file:** `packages/database/prisma/schema.server.prisma`

### 2.1 Product Domain

**`Product`** (`products`)

| Field | Notes |
|-------|-------|
| `tenantId`, `sku` | `@@unique([tenantId, sku])` |
| `unitId` | Single UOM per product — no conversion table |
| `barcode` | Optional, indexed |
| `costPrice`, `salePrice`, `taxRate` | Master prices |
| `trackInventory` | When `false`, commercial flows skip ledger |
| `type` | Free-text string, default `"product"` |

**`UnitOfMeasure`** — tenant-scoped, `@@unique([tenantId, code])`  
**`ProductCategory`** — hierarchical via `parentId`  
**`ProductVariant`:** **does not exist**

### 2.2 Warehouse Domain

**`Warehouse`** (`warehouses`)

| Field | Notes |
|-------|-------|
| `tenantId`, `branchId` | Warehouse belongs to one branch |
| `code` | `@@unique([tenantId, code])` |
| Soft delete via `deletedAt` | |

**Location/bin/aisle models:** **do not exist**. Warehouse is the only storage granularity.

### 2.3 Stock Domain

**`StockBalance`** (`stock_balances`)

| Field | Notes |
|-------|-------|
| `@@unique([tenantId, warehouseId, productId])` | One balance row per product per warehouse |
| `quantity`, `avgCost` | Weighted-average costing only |
| No `reservedQty`, branchId on balance | |

**`InventoryMovement`** (`inventory_movements`)

| Field | Notes |
|-------|-------|
| `movementType` | Free-text string (not DB enum) |
| `quantity` | Signed decimal (+ in, − out) |
| `unitCost` | Used for weighted avg on inbound |
| `referenceType`, `referenceId` | Links to commercial document |
| `branchId?`, `createdById?` | Optional metadata |

### 2.4 Local/Offline Schema

**File:** `packages/database/prisma/schema.local.prisma`

- Has `StockBalance` for sync pull
- **No `InventoryMovement`** offline — movement ledger is server-only
- Product model simplified (no `description`, `type`, `taxRate`)

---

## 3. InventoryLedgerService — The Stock Mutation Engine

**File:** `apps/api/src/common/services/inventory-ledger.service.ts`  
**Registration:** `@Global()` via `apps/api/src/common/common.module.ts`

### 3.1 Public API

```typescript
export interface StockMovementInput {
  tenantId: string;
  branchId?: string | null;
  warehouseId: string;
  productId: string;
  movementType: string;
  quantity: number;           // signed
  unitCost?: number;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
  createdById?: string;
}

async applyMovement(input: StockMovementInput, tx?: Prisma.TransactionClient)
```

### 3.2 Behavior (Critical — Do Not Break)

1. Rejects zero quantity
2. Creates `InventoryMovement` row
3. Upserts `stock_balances` via raw SQL `INSERT ... ON CONFLICT DO UPDATE`
4. **Weighted average cost** on inbound (`qty > 0`, `unitCost ≠ 0`)
5. Outbound does not change `avgCost`
6. Rejects resulting `quantity < 0` → `Insufficient stock for this movement`
7. Participates in caller `$transaction` when `tx` provided

### 3.3 Observed `movementType` Values

| movementType | Caller | referenceType |
|--------------|--------|---------------|
| `sale` | `SalesService.postInvoice` | `sales_invoice` |
| `purchase` | `PurchasingService.receiveOrder` | `purchase_order` |
| `pos_sale` | `PosService.createSale` | `pos_sale` |
| `adjustment_in` / `adjustment_out` | `InventoryService.adjustStock` | `stock_adjustment` |

**All verticals must continue routing stock changes through this service** — no parallel ledgers.

---

## 4. Current API Surface

### 4.1 Inventory Module

**Controller:** `apps/api/src/modules/inventory/inventory.controller.ts`  
**Guard:** `@RequireModule('inventory')`

| Method | Route | Permission | Service |
|--------|-------|------------|---------|
| GET | `/inventory/movements` | `inventory:movements:read` | `listMovements` (max 200) |
| GET | `/inventory/balances` | `inventory:stock:read` | `getBalances` |
| POST | `/inventory/adjust` | `inventory:stock:adjust` | `adjustStock` |

**Gaps:** No `@RequireFeature`, no audit, no document number, no GL.

### 4.2 Products Module

**Controller:** `apps/api/src/modules/products/` (+ categories, units)  
**Guard:** `@RequireModule('products')`

Permissions: `products:products:*`, `products:categories:*`, `products:units:*`

### 4.3 Warehouses Module

**Controller:** `apps/api/src/modules/warehouses/warehouses.controller.ts`  
**Guard:** `@RequireModule('warehouses')`

Permissions: `warehouses:warehouses:*`

### 4.4 Commercial Flows That Mutate Stock (Not Under Inventory Controller)

| Flow | Route | Stock trigger | Inventory module required? |
|------|-------|---------------|----------------------------|
| Sales post | `POST /sales/invoices/:id/post` | `movementType: sale` | **No** — gated by `sales` module |
| PO receive | `POST /purchasing/orders/:id/receive` | `movementType: purchase` | **No** — gated by `purchasing` module |
| POS sale | `POST /pos/sales` | `movementType: pos_sale` (if warehouseId) | **No** — gated by `pos` module |
| Stock adjust | `POST /inventory/adjust` | `adjustment_in/out` | **Yes** |

**Architecture note:** Stock side-effects are embedded in commercial modules. Phase 7 should **not** immediately relocate them — but should document the contract and optionally add inventory-license checks on those paths in a later sub-phase.

---

## 5. Commercial Integration Audit

### 5.1 Sales → Inventory

**File:** `apps/api/src/modules/sales/sales.service.ts` — `postInvoice()`

- Requires `invoice.warehouseId`
- Skips lines without `productId` or `trackInventory === false`
- COGS unit cost: `stockBalance.avgCost` ?? `product.costPrice`
- `quantity: -line.quantity`
- Same transaction as legacy GL (AR/Revenue/COGS/Inventory accounts)

### 5.2 Purchasing → Inventory

**File:** `apps/api/src/modules/purchasing/purchasing.service.ts` — `receiveOrder()`

- Receives all remaining qty per line in one operation
- `quantity: remaining`, `unitCost: line.unitPrice`
- Updates `receivedQty = line.quantity` (full receive only in practice)
- Same transaction as legacy GL (Inventory/AP)

### 5.3 POS → Inventory

**File:** `apps/api/src/modules/pos/pos.service.ts` — `createSale()`

- Stock deduction only if `warehouseId` provided on payload
- `movementType: pos_sale`
- **No COGS/inventory GL lines** — revenue/cash only (known gap)

### 5.4 Returns / Reversals

- No sales credit note, purchase return, or void-invoice stock reversal
- Manual negative adjustment is the only workaround

---

## 6. Branch & Tenant Semantics

| Entity | tenantId | branchId | Notes |
|--------|----------|----------|-------|
| Product, UOM, Category | ✓ | — | Tenant-wide catalog |
| Warehouse | ✓ | ✓ required | Branch-scoped storage |
| StockBalance | ✓ | — | Branch indirect via warehouse |
| InventoryMovement | ✓ | optional | From commercial doc branch |
| SalesInvoice | ✓ | ✓ | Optional `warehouseId` |
| PurchaseOrder | ✓ | ✓ | Required `warehouseId` |

**Gap:** No validation that document `branchId` matches `warehouse.branchId`.

**Party:** Not involved in inventory (correct for Phase 7).

---

## 7. Document Numbering

**Service:** `apps/api/src/common/services/document-number.service.ts`

Inventory operations today use **no numbered documents**:

| Operation | Numbered? | documentType |
|-----------|-----------|--------------|
| Stock adjust | **No** | — |
| Stock transfer | N/A | — |
| Sales invoice | Yes | `INV` |
| Purchase order | Yes | `PO` |
| POS sale | Yes | `POS` |

Phase 7 numbered adjustment/transfer docs would require new document types (e.g. `ADJ`, `ST`) — design decision for implementation spec.

---

## 8. Finance Boundary Audit

### 8.1 Legacy Path (Active for Inventory-Related Commercial Docs)

**`AccountingEngineService`** — hardcoded COA codes:

| Flow | Journal lines |
|------|---------------|
| Sales post | Dr 1100 AR, Cr 4000 Revenue; optional Dr 5000 COGS / Cr 1200 Inventory |
| PO receive | Dr 1200 Inventory, Cr 2000 AP |
| POS sale | Dr 1000 Cash, Cr 4000 Revenue (**no COGS/Inventory**) |
| Stock adjust | **None** |

Journal entries use `referenceType` (`sales_invoice`, `purchase_order`) — **not** `sourceModule`.

### 8.2 Universal Finance Path (Not Wired to Inventory Ops)

**`FinancialPostingService`** has seeded rules for:
- `sales / invoice / post` (includes COGS + inventory roles)
- `purchasing / order / receive`

Sales/Purchasing services **do not call FPS** (verified in Phase 5/6 tests).

**Phase 7 decision:** Do **not** wire inventory operations to FPS. Preserve legacy path for commercial-triggered inventory GL. Document adjustment GL as a future sub-phase.

### 8.3 Valuation

**Dashboard:** `inventoryValue = Σ(quantity × avgCost)` — `apps/api/src/modules/dashboard/dashboard.service.ts`  
**Low stock:** hardcoded threshold `quantity <= 10`

---

## 9. Licensing Audit

### 9.1 Module Catalog

**File:** `apps/api/src/modules/license/catalog/module-catalog.ts`

| Module | tier | dependencies | description |
|--------|------|--------------|-------------|
| `products` | business | `core` | Product catalog |
| `warehouses` | business | `core` | Warehouse locations |
| `inventory` | business | `core` | Stock movements and balances |

All three in `DEMO_ENABLED_MODULES` and all edition defaults.

**Note:** `products`, `warehouses`, and `inventory` are **three separate licensable modules** today — not one unified "Inventory Product" bundle.

### 9.2 Feature Catalog

**File:** `apps/api/src/modules/license/catalog/feature-catalog.ts`

**No inventory-specific features** exist (unlike `sales.invoices`, `purchasing.orders`).

### 9.3 Enforcement Gaps

| Route group | Module guard | Feature guard |
|-------------|--------------|---------------|
| `/inventory/*` | `@RequireModule('inventory')` | None |
| `/products/*` | `@RequireModule('products')` | None |
| `/warehouses/*` | `@RequireModule('warehouses')` | None |
| Sales post (stock) | `@RequireModule('sales')` | `sales.invoices` |
| PO receive (stock) | `@RequireModule('purchasing')` | `purchasing.orders` |

Commercial stock mutations do **not** require `inventory` module license today.

---

## 10. RBAC Audit

**Seed:** `packages/database/prisma/seed.ts`

### Inventory
- `inventory:movements:read`
- `inventory:stock:read`
- `inventory:stock:adjust`

### Products
- `products:products:read|create|update|delete`
- `products:categories:*`
- `products:units:read|create|update`

### Warehouses
- `warehouses:warehouses:read|create|update|delete`

### Commercial (stock side-effects)
- `sales:invoices:post`
- `purchasing:orders:receive`
- `pos:sales:create`

---

## 11. Audit Events

**`AuditService`** is **not used** by inventory, products, or warehouses modules.

Stock changes are recorded only in `inventory_movements`. No mirror in `audit_logs`.

Phase 5/6 pattern: audit only for Party-aware additive flows — inventory may follow similar selective audit approach.

---

## 12. Tests Audit

**No dedicated** `inventory.integration.spec.ts`.

| File | Inventory coverage |
|------|-------------------|
| `concurrency.integration.spec.ts` | Concurrent `POST /inventory/adjust` |
| `resilience.integration.spec.ts` | Adjust rollback; insufficient stock blocks invoice post |
| `sales.integration.spec.ts` | Stock decrease on post |
| `purchasing.integration.spec.ts` | Stock increase on receive |
| `finance.integration.spec.ts` | FPS only — not inventory flows |

**Total regression baseline:** 183/183 PASS

---

## 13. Sync / Offline

**Pull:** `product`, `warehouse`, `stock_balance` — `sync.service.ts`  
**Push:** `product`, `pos_sale` (optional warehouseId)  
**Not synced:** `inventory_movements`, adjust operations

Offline LAN can read cached balances but cannot append to movement ledger locally.

---

## 14. Target Conceptual Architecture

Perpetual-license horizontal inventory foundation (target state — not all in Phase 7.0):

```text
Inventory Product (licensed Business Core)
       │
       ├── Product / SKU / Barcode  (products module today)
       ├── UOM                      (products module today)
       ├── Warehouse                (warehouses module today)
       ├── Location                 (future — not in schema)
       ├── Stock Balance            (StockBalance)
       └── Stock Ledger             (InventoryMovement via InventoryLedgerService)
              ▲
              │ applyMovement() only
              │
    ┌─────────┼─────────┬─────────┬─────────┐
    │         │         │         │         │
  Sales    Purchasing   POS    Adjustments  Transfers
  post     receive              (today)    (future)
```

**Design rule:** All verticals consume the **same** ledger. No PMS-specific stock table, no construction-specific warehouse model.

---

## 15. Phase 7.0 Scope — IMPLEMENTED

### Delivered in Phase 7.0

1. **`inventory.stock` feature** registered in `feature-catalog.ts`; demo license includes it
2. **`@RequireFeature('inventory.stock')`** on all inventory-native routes (balances, movements, adjust)
3. **Tenant/warehouse/product validation** on adjust and filtered reads
4. **Branch/warehouse consistency** validation on adjust
5. **Audit** — `inventory.adjustment.created` on manual adjustments
6. **`inventory.integration.spec.ts`** — 17 tests (licensing, adjust, tenant isolation, audit, RBAC, cross-module regression)
7. **Desktop** — inventory route/nav gated by module + `inventory.stock` feature
8. **No changes** to Sales/Purchasing/POS licensing or stock call paths

### 7.0 Explicitly Out of Scope

| Item | Reason |
|------|--------|
| Stock transfer API | No schema/service — needs design approval |
| Batch/lot/expiry | No schema |
| ProductVariant | No schema |
| Location hierarchy | No schema |
| Rewrite InventoryLedgerService | Frozen core |
| Wire adjustments to GL | Finance architecture decision |
| Wire commercial flows to FPS | Phase 2/5/6 precedent |
| Merge products/warehouses/inventory modules | Commercial/licensing breaking change |
| Party-aware inventory | Not applicable |
| POS COGS fix | Separate finance scope |

### 7.1+ Deferred (Future Sub-Phases)

- Inter-warehouse transfer with numbered documents
- Partial PO receive
- Sales/purchase return inventory flows
- Inventory license enforcement on commercial post/receive
- GL for adjustments via legacy engine or FPS migration
- Location/bin model
- Batch/lot/expiry
- Stock reservation
- POS COGS posting alignment

---

## 16. Licensing Model Recommendation

**Commercial model:** Perpetual license — inventory is a separately purchasable horizontal module (already in catalog).

### Proposed feature keys (existing functionality only)

| Feature key | Covers |
|-------------|--------|
| `inventory.stock` | balances read, movements read, adjust |

**Do not register:** `inventory.transfers`, `inventory.returns`, `inventory.receiving` until implemented.

### Module bundle question

Today customers may license:
- `inventory` without `products` (can adjust stock for products created elsewhere?)
- `products` without `inventory` (catalog only)
- `warehouses` without `inventory`

**Recommendation:** Document current behavior; consider catalog dependency `inventory → products, warehouses` in a future commercial policy update (not Phase 7.0 without explicit approval).

---

## 17. Finance Boundary Decision

| Operation | Phase 7 posting path |
|-----------|---------------------|
| Sales post (stock + COGS) | **Unchanged** — `AccountingEngineService` |
| PO receive (stock + AP) | **Unchanged** — `AccountingEngineService` |
| POS sale (stock only) | **Unchanged** — no COGS GL (document gap) |
| Stock adjust | **Unchanged** — no GL |

**Do not mix** `AccountingEngineService` and `FinancialPostingService` in the same transaction.

---

## 18. Where Party-Aware Resolution Applies

**Not applicable to Phase 7.** Inventory does not reference Party, Customer, or Supplier directly — only `productId` and `warehouseId`.

Sales and Purchasing already resolve Party → legacy identity before commercial docs that trigger stock movements.

---

## 19. Risks

| Risk | Mitigation |
|------|------------|
| Three modules (products/warehouses/inventory) vs unified "Inventory Product" | Document; defer merge |
| Commercial flows bypass inventory license | Document; optional Phase 7.1 enforcement |
| No GL on adjustments | Document; defer to finance sub-phase |
| branchId vs warehouse.branchId mismatch | Document; validate in 7.0 if low-risk |
| movementType is free-text | Document canonical values; enum is future schema change |
| POS stock without COGS GL | Document known gap |
| Dual accounting paths in codebase | Inventory stays on legacy for commercial docs |

---

## 20. Production-Ready vs Legacy/Frozen

| Component | Classification |
|-----------|----------------|
| `InventoryLedgerService.applyMovement` | **Frozen core** — extend via callers, do not fork |
| `StockBalance` / `InventoryMovement` schema | **Frozen** for Phase 7.0 (no migration) |
| `InventoryService.adjustStock` | Legacy — enhance with validation/audit, don't rewrite ledger |
| `InventoryController` routes | Legacy — add feature guards |
| `ProductsService` / `WarehousesService` | Legacy — separate modules, no Phase 7 rewrite |
| Sales/Purchasing/POS stock calls | **Frozen call pattern** — keep using `applyMovement` in same transactions |

---

## 21. Acceptance Criteria (For Future Phase 7 Implementation)

When the full implementation spec is provided, completion should require:

- [ ] Inventory server-side license + feature enforcement on inventory routes
- [ ] No rewrite of `InventoryLedgerService`
- [ ] Sales/Purchasing/POS stock behavior unchanged (regression green)
- [ ] Dedicated inventory integration tests
- [ ] Finance boundary documented and tested (no duplicate GL, no accidental FPS)
- [ ] Tenant isolation on inventory operations
- [ ] Numbering semantics preserved (no null branchId on new numbered docs)
- [ ] 183+ existing tests PASS, typecheck PASS
- [ ] Explicit statement: foundation hardening, not full inventory rewrite

---

## 22. Files Reference Index

| Area | Path |
|------|------|
| Server schema | `packages/database/prisma/schema.server.prisma` |
| Ledger engine | `apps/api/src/common/services/inventory-ledger.service.ts` |
| Inventory API | `apps/api/src/modules/inventory/` |
| Products API | `apps/api/src/modules/products/` |
| Warehouses API | `apps/api/src/modules/warehouses/` |
| Sales stock | `apps/api/src/modules/sales/sales.service.ts` |
| Purchasing stock | `apps/api/src/modules/purchasing/purchasing.service.ts` |
| POS stock | `apps/api/src/modules/pos/pos.service.ts` |
| Legacy accounting | `apps/api/src/common/services/accounting-engine.service.ts` |
| FPS rules | `apps/api/src/modules/finance/posting/posting-rule.service.ts` |
| License catalog | `apps/api/src/modules/license/catalog/` |
| Dashboard valuation | `apps/api/src/modules/dashboard/dashboard.service.ts` |
| Desktop | `apps/desktop/src/pages/InventoryPage.tsx` |

---

## COMPLETE

Phase 7.0 implemented. See [PHASE_7_INVENTORY_COMPLETE.md](./PHASE_7_INVENTORY_COMPLETE.md).
