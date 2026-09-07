# Phase 6 — Universal Purchasing Foundation Design

**Status:** Approved for implementation  
**Date:** 2026-09-07  
**Prerequisites:** Phase 5 Sales ✅, Phase 4 Party Legacy Adapter ✅

> **Scope:** Party-aware Purchasing integration — **not** a full legacy Purchasing migration.

---

## 1. Audit Findings

### 1.1 Purchasing Module (Legacy — Frozen)

| File | Role |
|------|------|
| `apps/api/src/modules/purchasing/purchasing.controller.ts` | 4 HTTP routes |
| `apps/api/src/modules/purchasing/purchasing.service.ts` | Business logic |
| `apps/api/src/modules/purchasing/purchasing.module.ts` | Nest module |

**Routes:**

| Method | Path | Permission |
|--------|------|------------|
| GET | `/purchasing/orders` | `purchasing:orders:read` |
| GET | `/purchasing/orders/:id` | `purchasing:orders:read` |
| POST | `/purchasing/orders` | `purchasing:orders:create` |
| POST | `/purchasing/orders/:id/receive` | `purchasing:orders:receive` |

**Licensing (pre-Phase 6):** `@RequireModule('purchasing')` only. No `@RequireFeature`.

**Not implemented:** Purchase invoices, purchase returns, supplier payments API (schema has `SupplierPayment` model only).

### 1.2 Supplier Input

| Operation | Supplier source |
|-----------|-----------------|
| `createOrder()` | Required `data.supplierId` → `PurchaseOrder.supplierId` |
| `receiveOrder()` | Uses existing `order.supplierId` for AP balance increment |

**Schema:** `Supplier` is **tenant-wide** (no `branchId`). `Supplier.partyId` optional unique FK to `Party`.

**Party integration (pre-Phase 6):** None.

### 1.3 Stock Receiving

**Only in `receiveOrder()`** — not on draft create.

Flow per line with remaining quantity:
1. `InventoryLedgerService.applyMovement()` — `movementType: 'purchase'`, positive quantity
2. `referenceType: 'purchase_order'`, `referenceId: order.id`
3. Updates `purchaseOrderLine.receivedQty`

Single `$transaction` — atomic with accounting and supplier balance.

### 1.4 Accounting Path

**`AccountingEngineService` only** on receive:

- Dr `1200` (Inventory), Cr `2000` (AP)
- `referenceType: 'purchase_order'`, `referenceId: order.id`
- No `sourceModule` / no `fiscalPeriodId` (legacy path)

**`FinancialPostingService`:** Posting rules seeded for `sourceModule: 'purchasing'` but **not wired** to `PurchasingService`.

**Phase 6 decision:** Preserve `AccountingEngineService` only. No FPS wiring.

### 1.5 Document Numbering

`DocumentNumberService.nextNumber(tenantId, 'PO', 'PO', branchId, tx)` on create.

Format: `PO-{fiscalYear}-{paddedNumber}`. Branch required.

### 1.6 Audit

No audit events in legacy Purchasing module today. Phase 6 adds audit **only for Party-aware order create**.

### 1.7 Feature Flags

| Flag | Purpose |
|------|---------|
| `PARTY_LEGACY_ROUTING_ENABLED` | Sales Party routing (Phase 5) |
| `PURCHASING_PARTY_ROUTING_ENABLED` | **New** — Purchasing Party routing (Phase 6) |

Dedicated flag per Phase 6 requirements. Default `false`.

### 1.8 Production-Ready vs Frozen

| Component | Status |
|-----------|--------|
| PO create/receive/list | Production-ready legacy flow — **frozen** |
| Purchase invoices | Not implemented |
| Purchase returns | Not implemented |
| Supplier payments API | Not implemented |

---

## 2. Target Architecture

```text
License (purchasing module + purchasing.orders feature)
   ↓
RBAC (purchasing:orders:*)
   ↓
Party ID (when PURCHASING_PARTY_ROUTING_ENABLED=true)
   ↓
PartyLegacyAdapterService.resolveLinkedSupplierForPurchasing()
   ↓
Supplier ID (legacy — unchanged internally)
   ↓
Existing PurchasingService.createOrder() / receiveOrder()
   ↓
AccountingEngineService (legacy GL on receive — unchanged)
```

---

## 3. Feature Entitlements

Register only existing functionality:

| Feature key | Covers |
|-------------|--------|
| `purchasing.orders` | List, create, receive purchase orders |

Not registered (no implementation): `purchasing.invoices`, `purchasing.returns`, `purchasing.receiving` as separate features.

---

## 4. Party-Aware Supplier Resolution

**New method:** `resolveLinkedSupplierForPurchasing(tenantId, partyId)`

1. Assert active party in tenant
2. Assert active `supplier` role
3. `getLinkedSupplier(tenantId, partyId)`
4. If null → deterministic error
5. Return Supplier for legacy operations

No silent Supplier creation.

---

## 5. API (Additive)

| Method | Path | Guard |
|--------|------|-------|
| POST | `/purchasing/orders/from-party` | `PurchasingPartyRoutingGuard` |

Existing Supplier-based routes unchanged.

---

## 6. Branch Semantics

- PO `branchId` from request (existing)
- Supplier is tenant-wide — no branch on Supplier record
- Party is tenant-wide
- Receiving uses PO `branchId` + `warehouseId` — unchanged

---

## 7. Database

**No schema changes.** Use `Supplier.partyId` via adapter.

---

## STOP

Design approved. Proceed to implementation.
