# Phase 4 Complete — Party ↔ Legacy ERP Adapter

**Status:** Complete  
**Date:** 2026-09-07  
**Scope:** Controlled adapter linking Universal Party to legacy Customer/Supplier — **NOT a legacy migration**

---

## 1. Architecture Decision

Introduced **`PartyLegacyAdapterService`** as the sole integration boundary between Universal Party and frozen legacy ERP entities.

```text
Party + PartyRole(customer)  ──link──►  Customer (legacy)
Party + PartyRole(supplier)  ──link──►  Supplier (legacy)
```

- Uses existing nullable `customers.partyId` / `suppliers.partyId` (Phase 3)
- **No schema migration** in Phase 4 — DB constraints already sufficient
- Legacy Sales/Purchasing/POS/Accounting **unchanged**
- Sales/Purchasing do **not** route through Party yet (`PARTY_LEGACY_ROUTING_ENABLED=false`)

Design document: `docs/PHASE_4_PARTY_ERP_ADAPTER_DESIGN.md`

---

## 2. Audit Findings

| Finding | Result |
|---------|--------|
| `customers.partyId` / `suppliers.partyId` | Exist, nullable, globally unique per column |
| One Party → one Customer max | Enforced by unique `partyId` on customers |
| One Party → one Supplier max | Enforced by unique `partyId` on suppliers |
| Dual role on same Party | Supported (one Customer + one Supplier) |
| Branch asymmetry | Customer may have `branchId`; Party tenant-wide — operator chooses which Customer record to link |
| Sales/Purchasing | Still use legacy Customer/Supplier UUIDs directly |
| Patient | Separate — no Party integration |

---

## 3. Files Changed

### API

| File | Change |
|------|--------|
| `apps/api/src/modules/parties/party-legacy-adapter.service.ts` | Adapter service |
| `apps/api/src/modules/parties/party-legacy.controller.ts` | Legacy link API |
| `apps/api/src/modules/parties/dto/party-legacy.dto.ts` | Link DTOs |
| `apps/api/src/modules/parties/parties.module.ts` | Register adapter + controller |
| `apps/api/src/modules/parties/parties.service.ts` | Include legacy customer/supplier on party detail |
| `apps/api/test/party-legacy.integration.spec.ts` | 15 integration tests |
| `apps/api/test/test-app.ts` | Legacy-link permissions seed |

### Config

| File | Change |
|------|--------|
| `packages/config/src/index.ts` | `partyLegacyRoutingEnabled` flag (default false) |

### Seed

| File | Change |
|------|--------|
| `packages/database/prisma/seed.ts` | `parties:legacy-links:read|manage` permissions |

### Desktop (minimal)

| File | Change |
|------|--------|
| `apps/desktop/src/pages/PartiesPage.tsx` | Link/unlink section in edit modal |
| `apps/desktop/src/lib/api.ts` | Legacy link API methods |
| `packages/localization/src/locales/en.ts` | Legacy link strings |
| `packages/localization/src/locales/ar.ts` | Legacy link strings |

### Docs

| File | Change |
|------|--------|
| `docs/PHASE_4_PARTY_ERP_ADAPTER_DESIGN.md` | Audit + design |
| `docs/PHASE_4_PARTY_ERP_ADAPTER_COMPLETE.md` | This document |

---

## 4. Database Changes

**None.** Phase 3 schema already provides:

- `customers.partyId` nullable `@unique`
- `suppliers.partyId` nullable `@unique`
- FK constraints to `parties.id`

---

## 5. Adapter Design

**Service:** `PartyLegacyAdapterService`

| Method | Purpose |
|--------|---------|
| `linkCustomer` / `unlinkCustomer` | Set/clear `customers.partyId` |
| `linkSupplier` / `unlinkSupplier` | Set/clear `suppliers.partyId` |
| `getLinkedCustomer` / `getLinkedSupplier` | Party → legacy |
| `resolvePartyFromCustomer` / `resolvePartyFromSupplier` | Legacy → Party |

**Validation:**

- Tenant match on both sides
- Active Party required for link
- Active `PartyRole` required (customer/supplier)
- Idempotent re-link to same entity
- `ConflictException` on duplicate/ambiguous links
- `NotFoundException` for cross-tenant (tenant-safe)

---

## 6. API

| Method | Route | Permission |
|--------|-------|------------|
| GET | `/parties/:partyId/legacy/customer` | `parties:legacy-links:read` |
| POST | `/parties/:partyId/legacy/customer/link` | `parties:legacy-links:manage` |
| DELETE | `/parties/:partyId/legacy/customer/link` | `parties:legacy-links:manage` |
| GET | `/parties/:partyId/legacy/supplier` | `parties:legacy-links:read` |
| POST | `/parties/:partyId/legacy/supplier/link` | `parties:legacy-links:manage` |
| DELETE | `/parties/:partyId/legacy/supplier/link` | `parties:legacy-links:manage` |
| GET | `/parties/legacy/customers/:customerId/party` | `parties:legacy-links:read` |
| GET | `/parties/legacy/suppliers/:supplierId/party` | `parties:legacy-links:read` |

Link body: `{ "customerId": "uuid" }` or `{ "supplierId": "uuid" }`

---

## 7. RBAC

| Permission | Action |
|------------|--------|
| `parties:legacy-links:read` | GET resolution |
| `parties:legacy-links:manage` | Link / unlink |

---

## 8. Audit

| Entity | Actions |
|--------|---------|
| `party_legacy_customer` | `linked`, `unlinked` |
| `party_legacy_supplier` | `linked`, `unlinked` |

Payload: `{ partyId, customerId|supplierId }` — no financial data.

---

## 9. Tenant Isolation

All adapter lookups filter by caller `tenantId`. Cross-tenant operations return `NotFoundException` without leaking existence across tenants. Verified in integration tests.

---

## 10. Branch Semantics

- Party remains tenant-wide
- Linked Customer preserves its existing `branchId` (unchanged)
- Supplier remains tenant-wide
- Adapter does not move or infer branch assignments
- Multiple legacy Customers per tenant require explicit choice of which record to link

---

## 11. Legacy ERP Compatibility

**Preserved unchanged:**

- Customer/Supplier CRUD modules
- Sales, Purchasing, POS, Accounting flows
- `AccountingEngineService`
- Legacy Customer/Supplier IDs in all transactions

**Phase 4 is NOT a migration** — no backfill, no ID replacement.

---

## 12. Finance Boundary

- No `FinancialPostingService` calls
- No journal entries from adapter operations (tested)
- Universal Finance unchanged

---

## 13. PMS Boundary

- Patient, PatientAccount, PMS ledger **unchanged**
- No Patient ↔ Party relation
- PMS tests pass unchanged

---

## 14. Tests

**File:** `apps/api/test/party-legacy.integration.spec.ts` — **15 tests**

| # | Scenario |
|---|----------|
| 1–6 | Customer link, resolve, unlink, duplicate, no role, cross-tenant |
| 7–12 | Supplier link, resolve, unlink, duplicate, no role, cross-tenant |
| 13 | Dual role (Customer + Supplier on same Party) |
| 14 | No GL / PMS ledger side effects |
| 15 | Audit events on link/unlink |

Full regression: **104/104 PASS**

---

## 15. Typecheck

```bash
npm run typecheck -w @fratelanza/api   # PASS
```

---

## 16. Full Regression

```bash
npm test -w @fratelanza/api            # 104/104 PASS
```

| Suite | Tests |
|-------|-------|
| party-legacy | 15 |
| parties | 14 |
| finance | 19 |
| pms-patients | 17 |
| pms-ledger | 24 |
| auth | 5 |
| concurrency | 3 |
| resilience | 7 |
| **Total** | **104** |

---

## 17. Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Dual identity until ERP opt-in | **High** | Expected — Party + legacy records coexist |
| One Customer per Party limit | **Medium** | Multi-branch tenants must pick one legacy record |
| `partyLegacyRoutingEnabled` unused by Sales yet | **Low** | Flag ready for Phase 5+ |
| Archived Party still resolvable via legacy FK | **Low** | By design for historical links |

---

## 18. Future Migration Strategy

1. **Phase 5:** Optional Sales/Purchasing helper to resolve Party → Customer/Supplier when flag enabled
2. **Later:** Create legacy Customer/Supplier from Party on demand (adapter extension)
3. **Later:** Party-level AR/AP subledger (Finance phase — separate from identity)
4. **Phase 6+:** Optional Patient ↔ Party clinical bridge

---

## 19. Phase 5 Recommendation

**Enable opt-in Party resolution in one Sales flow** behind `PARTY_LEGACY_ROUTING_ENABLED`:

- Proof that Sales can accept Party ID and resolve legacy Customer via adapter
- No change to GL posting path yet
- Alternatively continue PMS Phase 1d (Services catalog) in parallel if PMS priority is higher

---

## STOP

Phase 4 is complete. This is an **integration boundary**, not a legacy migration. Do not proceed automatically to Phase 5.
