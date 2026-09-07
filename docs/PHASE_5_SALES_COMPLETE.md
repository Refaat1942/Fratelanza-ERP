# PHASE 5 COMPLETE

**Universal Sales Foundation — Party-Aware Sales Integration**

**Date:** 2026-09-07  
**Status:** Complete

> **This phase is Party-aware Sales integration, not a full legacy Sales migration.**

---

## Architecture Decision

Party-aware Sales uses an **additive adapter layer** on top of the frozen legacy Sales module:

```text
License (TenantLicense + sales module + sales.invoices feature)
   ↓
RBAC (sales:invoices:*, sales:payments:*)
   ↓
Party ID (input, when partyLegacyRoutingEnabled)
   ↓
PartyLegacyAdapterService.resolveLinkedCustomerForSales()
   ↓
Customer ID (legacy identity — unchanged internally)
   ↓
Existing SalesService.createInvoice() / recordPayment() / postInvoice()
   ↓
AccountingEngineService (legacy hardcoded COA — unchanged)
```

**Finance path:** Sales continues on `AccountingEngineService` only. `FinancialPostingService` is **not** wired to Sales in this phase. Universal finance posting rules exist in seed but are exercised only via Finance module tests.

**No schema changes.** No Customer/Party relationship duplication.

---

## Audit Findings

| Area | Finding |
|------|---------|
| Sales routes | 5 legacy routes (invoices CRUD/post, payments) — frozen |
| Customer ID | Optional on invoice create; required on payment |
| Returns / quotations | Not implemented (catalog placeholders only) |
| Stock | `InventoryLedgerService` on post only |
| Accounting | Legacy `AccountingEngineService` with codes 1100/4000/5000/1200/1000 |
| Document numbering | `DocumentNumberService` — INV/RCP/JE prefixes |
| Party link | `Customer.partyId` 1:1 FK (Phase 3/4) |
| Feature flag | `partyLegacyRoutingEnabled` defined but unused before Phase 5 |
| Audit | None on legacy Sales; added for Party-aware flows only |

See [PHASE_5_SALES_DESIGN.md](./PHASE_5_SALES_DESIGN.md) for full audit.

---

## Sales Licensing

| Layer | Implementation |
|-------|----------------|
| Module | `@RequireModule('sales')` on controller |
| Feature | `@RequireFeature('sales.invoices')` on invoice routes |
| RBAC | Existing permissions unchanged |

Commercial scenarios verified by integration tests:
- Sales licensed → operations allowed (with RBAC)
- Sales unlicensed → 403 even with Sales RBAC permissions
- Finance licensed + Inventory unlicensed → Sales still accessible

---

## Party-Aware Resolution

**New method:** `PartyLegacyAdapterService.resolveLinkedCustomerForSales(tenantId, partyId)`

1. Assert active party in tenant
2. Assert active `customer` role
3. Lookup linked Customer via `Customer.partyId`
4. If unlinked → deterministic `BadRequestException`
5. Return Customer for legacy Sales operations

**No silent Customer creation.**

---

## Feature Flag

| Flag | Default | Behavior |
|------|---------|----------|
| `PARTY_LEGACY_ROUTING_ENABLED` | `false` | Legacy Customer-only Sales |
| `true` | — | Enables `/sales/invoices/from-party` and `/sales/payments/from-party` |

Exposed to desktop via `GET /settings` → `deploymentFlags.partyLegacyRoutingEnabled`.

Existing Customer-based routes unchanged.

---

## API

### Existing (unchanged)

| Method | Path |
|--------|------|
| GET | `/sales/invoices` |
| GET | `/sales/invoices/:id` |
| POST | `/sales/invoices` |
| POST | `/sales/invoices/:id/post` |
| POST | `/sales/payments` |

### New (additive)

| Method | Path | Guard |
|--------|------|-------|
| POST | `/sales/invoices/from-party` | `PartyLegacyRoutingGuard` |
| POST | `/sales/payments/from-party` | `PartyLegacyRoutingGuard` |

**Tenant validation added:** legacy `createInvoice` and `recordPayment` now reject cross-tenant `customerId`.

---

## RBAC

Unchanged Sales permissions. Party-aware endpoints use same Sales permissions.

| Licensed | Authorized | Result |
|----------|------------|--------|
| Yes | Yes | ALLOW |
| Yes | No | DENY |
| No | Yes | DENY |

---

## Database

**No schema changes.**

Party-Customer relationship remains `Customer.partyId` (Phase 3/4). Sales invoices store `customerId` only.

---

## Document Numbering

Unchanged. `DocumentNumberService.nextNumber()` with branch-scoped INV/RCP sequences.

Party-aware invoices use identical numbering path after Customer resolution.

---

## Inventory Boundary

Unchanged. Stock movements occur only on `postInvoice()` via `InventoryLedgerService.applyMovement()`.

Verified: atomic stock decrement on Party-aware invoice post.

---

## Finance Boundary

| Path | Used by Sales |
|------|---------------|
| `AccountingEngineService` | **YES** — `referenceType: sales_invoice` |
| `FinancialPostingService` | **NO** |

Verified:
- Draft create → no journal entries
- Post → legacy journal with `referenceType: sales_invoice`, `sourceModule: null`
- No `sourceModule: sales` journal for the posted invoice ID

---

## Audit

Party-aware operations only:

| Action | Entity | Metadata |
|--------|--------|----------|
| `sales.invoice.created_from_party` | `sales_invoice` | `partyId`, `customerId` |
| `sales.payment.recorded_from_party` | `customer_payment` | `partyId`, `customerId` |

Legacy Sales operations do not duplicate audit events.

---

## Tenant Isolation

Verified:
- Party from another tenant → 404
- Customer from another tenant on legacy create → 400
- Resolved Customer scoped by `tenantId` in adapter queries

---

## Branch Semantics

Invoice/payment `branchId` from request (existing). Customer optional `branchId` not modified. No Customer duplication between branches.

---

## Tests

**New:** `apps/api/test/sales.integration.spec.ts` (20 tests)  
**Helpers:** `apps/api/test/sales-test.helpers.ts`

**Total:** 163/163 PASS

Coverage includes licensing, Party routing, feature flag, tenant isolation, numbering, stock atomicity, finance boundary, RBAC, adapter integrity.

All existing regression suites remain green.

---

## Typecheck

`npm run typecheck -w @fratelanza/api` — **PASS**

---

## Full Regression

| Suite | Status |
|-------|--------|
| sales.integration | ✅ 20 new |
| licensing | ✅ |
| license-hardening | ✅ |
| finance | ✅ |
| parties | ✅ |
| party-legacy | ✅ |
| pms-patients | ✅ |
| pms-ledger | ✅ |
| auth | ✅ |
| concurrency | ✅ |
| resilience | ✅ |

---

## Desktop

Minimal changes to `SalesPage.tsx`:
- Buyer mode toggle (Customer / Party) when `partyLegacyRoutingEnabled`
- Party mode calls `POST /sales/invoices/from-party`
- Sales route remains license-gated via existing `LicensedRoute`

---

## Risks

| Risk | Mitigation |
|------|------------|
| Dual accounting paths (legacy vs universal finance) | Documented; Sales stays on legacy path until deliberate migration phase |
| Party unlinked | Deterministic error instructing operator to link via Party Legacy adapter |
| Feature flag off in production | Party endpoints return 404; legacy Customer flow unaffected |

---

## Future Sales Migration

Future phases may:
- Wire Sales posting to `FinancialPostingService`
- Add optional `partyId` audit column on invoices (requires schema + design approval)
- Migrate historical Customer references to Party (explicit migration project)
- Add quotations, returns, credit notes

**Not in scope for Phase 5.**

---

## Files Changed

### API
- `apps/api/src/modules/parties/party-legacy-adapter.service.ts`
- `apps/api/src/modules/sales/sales.service.ts`
- `apps/api/src/modules/sales/sales.controller.ts`
- `apps/api/src/modules/sales/sales.module.ts`
- `apps/api/src/modules/sales/guards/party-legacy-routing.guard.ts` *(new)*
- `apps/api/src/modules/settings/settings.controller.ts`

### Tests
- `apps/api/test/sales.integration.spec.ts` *(new)*
- `apps/api/test/sales-test.helpers.ts` *(new)*

### Desktop
- `apps/desktop/src/pages/SalesPage.tsx`
- `apps/desktop/src/lib/api.ts`

### Localization
- `packages/localization/src/locales/en.ts`
- `packages/localization/src/locales/ar.ts`

### Documentation
- `docs/PHASE_5_SALES_DESIGN.md` *(new)*
- `docs/PHASE_5_SALES_COMPLETE.md` *(this document)*

---

## Phase 6

**Not started.** Phase 5 acceptance criteria met.
