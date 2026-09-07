# PHASE 6 COMPLETE

**Universal Purchasing Foundation — Party-Aware Supplier Integration**

**Date:** 2026-09-07  
**Status:** Complete

> **This phase is Party-aware Purchasing integration, not a full legacy Purchasing migration.**

---

## Architecture Decision

Party-aware Purchasing uses an **additive adapter layer** on the frozen legacy Purchasing module:

```text
License (purchasing module + purchasing.orders feature)
   ↓
RBAC (purchasing:orders:*)
   ↓
Party ID (when PURCHASING_PARTY_ROUTING_ENABLED=true)
   ↓
PartyLegacyAdapterService.resolveLinkedSupplierForPurchasing()
   ↓
Supplier ID (legacy identity — unchanged internally)
   ↓
Existing PurchasingService.createOrder() / receiveOrder()
   ↓
AccountingEngineService (legacy GL on receive — unchanged)
```

**Finance:** `AccountingEngineService` only (Dr 1200 / Cr 2000 on receive). `FinancialPostingService` not wired.

**Feature flag:** Dedicated `PURCHASING_PARTY_ROUTING_ENABLED` (separate from Sales `PARTY_LEGACY_ROUTING_ENABLED`).

**No schema changes.**

---

## Audit Findings

| Area | Finding |
|------|---------|
| Routes | 4 legacy routes — list/create/receive POs only |
| Supplier input | Required `supplierId` on create |
| Purchase invoices / returns | Not implemented |
| Receiving | `receiveOrder()` — inventory + accounting + AP in one transaction |
| Accounting | Legacy `AccountingEngineService`, `referenceType: purchase_order` |
| Numbering | `DocumentNumberService` — PO prefix, branch-scoped |
| Supplier schema | Tenant-wide (no branchId) |
| Party link | `Supplier.partyId` 1:1 FK |

See [PHASE_6_PURCHASING_DESIGN.md](./PHASE_6_PURCHASING_DESIGN.md).

---

## Purchasing Licensing

| Layer | Implementation |
|-------|----------------|
| Module | `@RequireModule('purchasing')` |
| Feature | `@RequireFeature('purchasing.orders')` on all order routes |
| RBAC | `purchasing:orders:read/create/receive` |

Feature registered: `purchasing.orders` only (no fake invoice/return features).

Demo license includes `purchasing.orders` via updated `DEMO_ENABLED_FEATURES`.

---

## Party-Aware Supplier Resolution

**Method:** `PartyLegacyAdapterService.resolveLinkedSupplierForPurchasing(tenantId, partyId)`

- Active party + active `supplier` role required
- Linked legacy Supplier required — deterministic error if missing
- No silent Supplier creation

---

## Feature Flag

| Env var | Default | Purpose |
|---------|---------|---------|
| `PURCHASING_PARTY_ROUTING_ENABLED` | `false` | Enables `/purchasing/orders/from-party` |

Exposed via `GET /settings` → `deploymentFlags.purchasingPartyRoutingEnabled`.

---

## API

### Existing (unchanged)

| Method | Path |
|--------|------|
| GET | `/purchasing/orders` |
| GET | `/purchasing/orders/:id` |
| POST | `/purchasing/orders` |
| POST | `/purchasing/orders/:id/receive` |

### New

| Method | Path | Guard |
|--------|------|-------|
| POST | `/purchasing/orders/from-party` | `PurchasingPartyRoutingGuard` |

Legacy routes accept `supplierId` only. Cross-tenant supplier rejected on create.

---

## RBAC

Unchanged permissions. Party-aware create uses `purchasing:orders:create`.

Licensed + Authorized = ALLOW; either missing = DENY.

---

## Database

**No schema changes.** `Supplier.partyId` via Phase 3/4 adapter.

---

## Numbering

Unchanged: `PO-{year}-{sequence}` via `DocumentNumberService` with branch ID.

---

## Inventory Boundary

Unchanged: `InventoryLedgerService.applyMovement()` on `receiveOrder()` only.

Verified: stock increases atomically on receive; double-receive rejected.

---

## Finance Boundary

| Path | Used |
|------|------|
| `AccountingEngineService` | **YES** — on receive |
| `FinancialPostingService` | **NO** |

Verified:
- Draft create → no journals
- Receive → legacy journal `referenceType: purchase_order`, `sourceModule: null`
- No FPS `sourceModule: purchasing` journal for same order ID

---

## Audit

Party-aware order create only:

| Action | Entity | Metadata |
|--------|--------|----------|
| `purchasing.order.created_from_party` | `purchase_order` | `partyId`, `supplierId` |

---

## Tenant Isolation

Verified: cross-tenant Party (404), cross-tenant Supplier (400), tenant-scoped adapter queries.

---

## Branch Semantics

PO `branchId` from request. Supplier is tenant-wide. Warehouse validated on create. No supplier duplication across branches.

---

## Tests

**New:** `apps/api/test/purchasing.integration.spec.ts` (20 tests)  
**Helpers:** `apps/api/test/purchasing-test.helpers.ts`

**Total:** 183/183 PASS

---

## Typecheck

`npm run typecheck -w @fratelanza/api` — **PASS**

---

## Full Regression

All 12 suites pass including sales, finance, party, PMS, licensing, auth, concurrency, resilience.

---

## Desktop

Minimal `PurchasingPage` update: Supplier / Party mode toggle when `purchasingPartyRoutingEnabled`.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Dual accounting paths exist in codebase | Purchasing stays on legacy path; documented |
| Party unlinked | Deterministic error message |
| Separate flags for Sales vs Purchasing | Intentional per Phase 6 spec |

---

## Future Purchasing Migration

Future phases may add purchase invoices, returns, supplier payments API, FPS migration, and optional Party audit columns. Not in Phase 6 scope.

---

## Files Changed

### API
- `apps/api/src/modules/parties/party-legacy-adapter.service.ts`
- `apps/api/src/modules/purchasing/purchasing.service.ts`
- `apps/api/src/modules/purchasing/purchasing.controller.ts`
- `apps/api/src/modules/purchasing/purchasing.module.ts`
- `apps/api/src/modules/purchasing/guards/purchasing-party-routing.guard.ts` *(new)*
- `apps/api/src/modules/license/catalog/feature-catalog.ts`
- `apps/api/src/modules/settings/settings.controller.ts`

### Config
- `packages/config/src/index.ts`
- `packages/config/dist/*`
- `.env.example`

### Tests
- `apps/api/test/purchasing.integration.spec.ts` *(new)*
- `apps/api/test/purchasing-test.helpers.ts` *(new)*

### Desktop
- `apps/desktop/src/pages/PurchasingPage.tsx`
- `apps/desktop/src/lib/api.ts`

### Localization
- `packages/localization/src/locales/en.ts`
- `packages/localization/src/locales/ar.ts`

### Documentation
- `docs/PHASE_6_PURCHASING_DESIGN.md` *(new)*
- `docs/PHASE_6_PURCHASING_COMPLETE.md` *(this document)*

---

## Phase 7

**Not started.**
