# Phase 5 — Universal Sales Foundation Design

**Status:** Approved for implementation  
**Date:** 2026-09-07  
**Prerequisites:** Phase 3 Party ✅, Phase 4 Party Legacy Adapter ✅, Phase 4.5/4.5.1 Licensing ✅

> **Scope:** Party-aware Sales integration — **not** a full legacy Sales migration.

---

## 1. Audit Findings

### 1.1 Sales Module Surface (Legacy — Frozen)

| File | Role |
|------|------|
| `apps/api/src/modules/sales/sales.controller.ts` | 5 HTTP routes |
| `apps/api/src/modules/sales/sales.service.ts` | Business logic |
| `apps/api/src/modules/sales/sales.module.ts` | Nest module |

**Routes:**

| Method | Path | Permission |
|--------|------|------------|
| GET | `/sales/invoices` | `sales:invoices:read` |
| GET | `/sales/invoices/:id` | `sales:invoices:read` |
| POST | `/sales/invoices` | `sales:invoices:create` |
| POST | `/sales/invoices/:id/post` | `sales:invoices:post` |
| POST | `/sales/payments` | `sales:payments:create` |

**Licensing (pre-Phase 5):** `@RequireModule('sales')` on controller. No `@RequireFeature`.

**Returns / quotations:** Not implemented. `sales.quotations` exists in license catalog only.

### 1.2 Where Sales Gets Customer ID

| Operation | Customer ID source |
|-----------|-------------------|
| `createInvoice()` | Optional `data.customerId` from DTO → stored on `SalesInvoice.customerId` |
| `postInvoice()` | Uses existing `invoice.customerId` for AR balance increment (conditional) |
| `recordPayment()` | **Required** `data.customerId` → `CustomerPayment` + balance decrement |

**Schema:** `SalesInvoice.customerId String?`, `CustomerPayment.customerId String` (required).

**Party integration (pre-Phase 5):** None. Sales does not reference Party or `PartyLegacyAdapterService`.

### 1.3 Branch References

- `branchId` required on invoice create and payment record
- Passed to `DocumentNumberService.nextNumber(tenantId, type, prefix, branchId, tx)`
- Passed to `InventoryLedgerService.applyMovement({ branchId })`
- Passed to `AccountingEngineService.createEntry(tenantId, branchId, ...)`

**Party is tenant-wide; Customer may have optional `branchId`.** Sales uses invoice/payment `branchId`, not Customer branch.

### 1.4 Inventory / Stock Changes

**Only in `postInvoice()`** — not on draft create.

Flow:
1. Requires `warehouseId` on invoice
2. For each line with `productId` where `product.trackInventory === true`:
   - `InventoryLedgerService.applyMovement()` with `movementType: 'sale'`, negative quantity
   - `referenceType: 'sales_invoice'`, `referenceId: invoice.id`
3. Uses existing `stock_balances` — throws on insufficient stock

**No second stock ledger.** Phase 5 must not change this path.

### 1.5 Payment Handling

`recordPayment()` in single transaction:
1. `CustomerPayment` create with `DocumentNumberService` (`RCP` prefix)
2. `customer.balance` decrement
3. Optional `salesInvoice.paidAmount` increment if `invoiceId` set
4. `AccountingEngineService.createEntry()` — Dr `1000`, Cr `1100`

No list/read/delete payment routes.

### 1.6 Document Numbering

`DocumentNumberService.nextNumber()` — reused, not duplicated.

| Operation | Type | Prefix |
|-----------|------|--------|
| Invoice create | `INV` | `INV` |
| Payment record | `RCP` | `RCP` |
| Journal (via accounting engine) | `JE` | `JE` |

Format: `{prefix}-{fiscalYear}-{paddedNumber}`. Branch ID required for sales numbering.

### 1.7 Accounting Path — **Architecture Decision Required**

| Path | Used by Sales? | Mechanism |
|------|----------------|-----------|
| **`AccountingEngineService`** | **YES** | Hardcoded COA codes (`1100`, `4000`, `5000`, `1200`, `1000`) |
| **`FinancialPostingService`** | **NO** | Rule-based universal finance; posting rules seeded for `sourceModule: 'sales'` but **not wired to SalesService** |

**Phase 5 decision:** Party-aware Sales continues on **`AccountingEngineService` only**. No migration to `FinancialPostingService` in this phase. No mixing both in one transaction.

**Journal distinction:**
- Legacy sales journals: `referenceType` = `sales_invoice` / `customer_payment`, `fiscalPeriodId` = null, no `sourceModule`
- Universal finance journals: `sourceModule`, `fiscalPeriodId`, idempotency keys

### 1.8 Audit

Sales module has **no audit events** today. Phase 5 adds audit **only for Party-aware flows** (resolution metadata), not duplicating existing sale lifecycle events.

### 1.9 Party Legacy Adapter

**File:** `party-legacy-adapter.service.ts`

| Method | Purpose |
|--------|---------|
| `getLinkedCustomer(tenantId, partyId)` | Returns Customer where `customer.partyId = partyId` |
| `linkCustomer(...)` | Sets `Customer.partyId`; requires active `customer` role |
| `resolvePartyFromCustomer(...)` | Reverse lookup |

**Relationship:** `Customer.partyId` → `Party.id` (1:1 optional FK, unique). No junction table.

**Phase 5 adds:** `resolveLinkedCustomerForSales(tenantId, partyId)` — validates party, customer role, linked customer; deterministic error if unlinked.

### 1.10 Feature Flag

`partyLegacyRoutingEnabled` in `packages/config` — default `false`. **Not consumed** before Phase 5.

### 1.11 Can Sales Operate with Party Identity Today?

**No.** Sales requires `customerId` (UUID of legacy Customer). Party ID is not accepted on any route.

### 1.12 Frozen Legacy Parts

Do **not** rewrite:
- `SalesService.createInvoice()` / `postInvoice()` / `recordPayment()` core logic
- `AccountingEngineService` integration
- `InventoryLedgerService` integration
- Existing `POST /sales/invoices` and `POST /sales/payments` contracts
- POS module (separate, similar patterns)

---

## 2. Target Architecture

```text
License (TenantLicense + sales module entitlement)
   ↓
Sales feature entitlement (sales.invoices)
   ↓
RBAC (sales:invoices:*, sales:payments:*)
   ↓
Party (optional input — feature flag ON)
   ↓
PartyLegacyAdapterService.resolveLinkedCustomerForSales()
   ↓
Customer (legacy identity — unchanged internally)
   ↓
Existing SalesService methods
   ↓
AccountingEngineService (legacy GL — unchanged)
```

---

## 3. Sales Module Licensing

Reuse existing system:

| Layer | Enforcement |
|-------|-------------|
| Module | `@RequireModule('sales')` — class level (existing) |
| Feature | `@RequireFeature('sales.invoices')` — invoice routes (new) |
| RBAC | `@RequirePermissions(...)` — unchanged |

**No new licensing mechanism.**

Commercial example tests:
- Tenant with Sales licensed + Finance licensed + Inventory **not** licensed → Sales API allowed (RBAC permitting)
- Tenant with Sales **not** licensed → 403 even with full Sales RBAC

---

## 4. Party-Aware Resolution

### Flow

1. Receive `partyId` on dedicated Party-aware endpoint
2. Verify `partyLegacyRoutingEnabled === true`
3. `assertActiveParty(tenantId, partyId)`
4. Verify active `PartyRoleType.customer`
5. `getLinkedCustomer(tenantId, partyId)`
6. If null → `BadRequestException`: Party must be linked to legacy Customer
7. Pass `customer.id` to existing `createInvoice()` / `recordPayment()`

**No silent Customer creation.**

### Tenant isolation

Every step scoped by `tenantId`. Cross-tenant Party or Customer rejected via existing adapter checks.

---

## 5. Feature Flag Behavior

| Flag | Route | Behavior |
|------|-------|----------|
| `false` | `POST /sales/invoices` | Unchanged — `customerId` only |
| `false` | `POST /sales/invoices/from-party` | **404** — endpoint disabled |
| `true` | `POST /sales/invoices/from-party` | Party → Customer resolution |
| `false` | `POST /sales/payments` | Unchanged |
| `true` | `POST /sales/payments/from-party` | Party → Customer resolution |

Existing Customer-based routes **never** accept `partyId` — no silent behavior change.

---

## 6. API Design (Additive)

### New endpoints

| Method | Path | Guard |
|--------|------|-------|
| POST | `/sales/invoices/from-party` | `PartyLegacyRoutingGuard` + `@RequireFeature('sales.invoices')` |
| POST | `/sales/payments/from-party` | `PartyLegacyRoutingGuard` + module + RBAC |

### DTOs

**CreateInvoiceFromPartyDto:** `partyId` (required), `branchId`, `warehouseId?`, `lines[]`, etc. — no `customerId`.

**RecordPaymentFromPartyDto:** `partyId` (required), `branchId`, `amount`, optional `invoiceId`.

### Settings (desktop)

`GET /settings` exposes `deploymentFlags.partyLegacyRoutingEnabled` for UI toggle visibility.

---

## 7. Branch Semantics

- Invoice/payment `branchId` comes from request (existing behavior)
- Resolved Customer retains its own optional `branchId` — **not modified**
- No Customer duplication or branch reassignment

---

## 8. Finance Boundary

**Unchanged:** `AccountingEngineService.createEntry()` with hardcoded account codes.

**Tests verify:**
- Draft create (Party or Customer) creates **no** journal entries
- Post creates legacy-path journals (`referenceType: sales_invoice`)
- No `sourceModule: 'sales'` journals from `FinancialPostingService` during Sales flow

---

## 9. Inventory Boundary

**Unchanged:** `InventoryLedgerService.applyMovement()` on post only.

Party-aware invoices use same post path after Customer resolution.

---

## 10. Database

**No schema changes.** Party-Customer link remains `Customer.partyId`. Sales invoices continue storing `customerId` only.

---

## 11. Audit (Party-Aware Only)

| Entity | Action | Metadata |
|--------|--------|----------|
| `sales_invoice` | `sales.invoice.created_from_party` | `partyId`, `customerId` |
| `customer_payment` | `sales.payment.recorded_from_party` | `partyId`, `customerId` |

---

## 12. Tests

New file: `apps/api/test/sales.integration.spec.ts`

Covers licensing, Party routing, feature flag, tenant isolation, numbering, stock atomicity, accounting path, regressions.

Existing suites must remain green (143+ tests).

---

## 13. Desktop (Minimal)

When `deploymentFlags.partyLegacyRoutingEnabled` and Sales module licensed:
- Invoice form: toggle Customer mode / Party mode
- Party mode calls `POST /sales/invoices/from-party`

---

## 14. Explicit Non-Goals

- Migrate sales records to Party
- Remove Customer references
- Rewrite AccountingEngineService / FinancialPostingService
- Rewrite Inventory / Purchasing / PMS
- CRM, Projects, Construction

---

## STOP

Design approved. Proceed to implementation.
