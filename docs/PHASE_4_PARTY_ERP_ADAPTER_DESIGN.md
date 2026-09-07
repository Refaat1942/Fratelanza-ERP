# Phase 4 — Party ↔ Legacy ERP Adapter Design

**Status:** Approved for implementation  
**Date:** 2026-09-07  
**Prerequisite:** Phase 3 Universal Party ✅

---

## 1. Audit Findings

### 1.1 Schema state (Phase 3)

| Item | Status |
|------|--------|
| `customers.partyId` | ✅ Exists, nullable, `@unique`, FK → `parties.id` |
| `suppliers.partyId` | ✅ Exists, nullable, `@unique`, FK → `parties.id` |
| `Party.customer` | ✅ Optional 1:1 via `Customer.partyId` |
| `Party.supplier` | ✅ Optional 1:1 via `Supplier.partyId` |

**Uniqueness invariants (already enforced by DB):**

- At most **one** `Customer` row per `partyId` (global unique on `customers.partyId`)
- At most **one** `Supplier` row per `partyId` (global unique on `suppliers.partyId`)
- A `Party` can have **0 or 1** linked `Customer` and **0 or 1** linked `Supplier` simultaneously

Global uniqueness on `partyId` is safe because Party IDs are globally unique UUIDs; tenant isolation is enforced in application logic on both Party and Customer/Supplier lookups.

**No new migration required for Phase 4.**

### 1.2 Party roles

`PartyRole` table with `@@unique([tenantId, partyId, role])` supports `customer` and `supplier` roles. Linking requires an **active** role — roles are not auto-created during link.

### 1.3 Legacy ERP references

| Module | Reference | Notes |
|--------|-----------|-------|
| Sales | `SalesInvoice.customerId`, `CustomerPayment.customerId` | Direct Customer UUID |
| Purchasing | `PurchaseOrder.supplierId` | Direct Supplier UUID |
| POS | `PosSale.customerId` | Optional Customer UUID |
| Accounting | No party FK | Aggregate AR/AP via `AccountingEngineService` |

**Sales/Purchasing continue to use legacy IDs.** Phase 4 does not change this.

### 1.4 Legacy Customer/Supplier flows

- `CustomersService` / `SuppliersService` — CRUD unchanged, no `partyId` handling today
- Manual `code` on create; soft delete via `deletedAt`
- Customer optional `branchId`; Supplier tenant-wide

### 1.5 Branch semantics — documented ambiguity

A tenant may have **multiple legacy Customer records** (e.g. per branch) while Party is tenant-wide. The adapter enforces **one Party → one Customer** link. The operator must choose which legacy Customer record to link. This is intentional — not silent multi-branch mapping.

**No STOP required** — behavior is explicit and documented.

### 1.6 Code assumptions

Legacy modules assume Customer/Supplier identity is independent. They continue to work unchanged; `partyId` is optional metadata until future phases opt in.

---

## 2. Architecture Decision

Single integration service:

```text
PartyLegacyAdapterService
 ├── link / unlink Customer
 ├── link / unlink Supplier
 ├── resolve Customer ← Party
 ├── resolve Party ← Customer
 ├── resolve Supplier ← Party
 └── resolve Party ← Supplier
```

All link/unlink logic lives in this service — not scattered in controllers or legacy modules.

```text
Party + PartyRole(customer)
        ↓ adapter link
     Customer (legacy, unchanged behavior)

Party + PartyRole(supplier)
        ↓ adapter link
     Supplier (legacy, unchanged behavior)
```

Patient, Finance GL, PMS ledger — **out of scope**.

---

## 3. Linking Rules

| Rule | Behavior |
|------|----------|
| Tenant match | `Party.tenantId === Customer.tenantId === Supplier.tenantId` |
| Active party | Party must be `active`, not archived |
| Required role | Active `PartyRole` for customer/supplier before link |
| One customer per party | Reject if party already linked to different customer |
| One party per customer | Reject if customer already linked to different party |
| Idempotent re-link | Same party + same customer → return existing (no error) |
| Unlink | Sets `partyId = null`; does not delete legacy record |
| Soft-deleted legacy | Cannot link to deleted Customer/Supplier |

---

## 4. API

Base: `/api/v1/parties`

| Method | Route | Permission |
|--------|-------|------------|
| GET | `/:partyId/legacy/customer` | `parties:legacy-links:read` |
| POST | `/:partyId/legacy/customer/link` | `parties:legacy-links:manage` |
| DELETE | `/:partyId/legacy/customer/link` | `parties:legacy-links:manage` |
| GET | `/:partyId/legacy/supplier` | `parties:legacy-links:read` |
| POST | `/:partyId/legacy/supplier/link` | `parties:legacy-links:manage` |
| DELETE | `/:partyId/legacy/supplier/link` | `parties:legacy-links:manage` |
| GET | `/legacy/customers/:customerId/party` | `parties:legacy-links:read` |
| GET | `/legacy/suppliers/:supplierId/party` | `parties:legacy-links:read` |

Link body: `{ "customerId": "uuid" }` or `{ "supplierId": "uuid" }`

---

## 5. RBAC

| Permission | Action |
|------------|--------|
| `parties:legacy-links:read` | GET resolution endpoints |
| `parties:legacy-links:manage` | Link / unlink |

---

## 6. Audit

| Entity | Action |
|--------|--------|
| `party_legacy_customer` | `linked`, `unlinked` |
| `party_legacy_supplier` | `linked`, `unlinked` |

Payload: `{ partyId, customerId|supplierId }` — no financial data.

---

## 7. Feature Flag

`PARTY_LEGACY_ROUTING_ENABLED=false` (env) — reserved for **future** Sales/Purchasing consumers. Adapter API is always available via RBAC; legacy ERP flows do not consult this flag in Phase 4.

---

## 8. Boundaries

| Domain | Phase 4 |
|--------|---------|
| Legacy ERP CRUD | Unchanged |
| Sales/Purchasing/POS | Unchanged |
| Universal Finance | Unchanged |
| PMS | Unchanged |
| Patient ↔ Party | Not introduced |

---

## 9. Non-Goals

- No backfill of existing Customers/Suppliers
- No replacement of Customer/Supplier IDs in transactions
- No GL / AR / AP changes

---

## STOP

Design approved. Proceed to adapter implementation.
