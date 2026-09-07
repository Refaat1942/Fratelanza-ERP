# Phase 3 Complete — Universal Party & Business Contacts

**Status:** Complete  
**Date:** 2026-09-07  
**Scope:** Universal Party registry, business roles, contacts, addresses, identifiers — **no legacy ERP migration, no PMS changes, no GL/AR/AP**

---

## 1. Architecture Decision

Introduced an **additive Universal Party layer** parallel to legacy `Customer`/`Supplier` and PMS `Patient`:

```text
Party (tenant-scoped identity)
 ├── PartyRole (customer | supplier | …)
 ├── PartyContact (organization contact persons)
 ├── PartyAddress (typed reusable addresses)
 └── PartyIdentifier (tax / registration IDs)

Legacy (frozen, optional future link)
 ├── Customer.partyId?
 ├── Supplier.partyId?
 └── Patient (unchanged)
```

**Key decisions:**

- Party is **tenant-scoped**, not branch-scoped
- Roles are many-to-one on Party (same party can be customer + supplier)
- Balances remain on legacy subledgers / PMS ledger — Party is identity only
- Auto numbering via `DocumentNumberService` (`PTY-YYYY-NNNNNN`) using tenant default branch
- Audit via existing `AuditService`

Design document: `docs/PHASE_3_PARTY_DESIGN.md`

---

## 2. Files Changed

### Database

| File | Change |
|------|--------|
| `packages/database/prisma/schema.server.prisma` | Party domain models + nullable `partyId` on Customer/Supplier |
| `packages/database/prisma/migrations/20250907180000_universal_party/migration.sql` | Additive migration |
| `packages/database/prisma/seed.ts` | Party RBAC permissions |

### API

| File | Change |
|------|--------|
| `apps/api/src/modules/parties/parties.module.ts` | New module |
| `apps/api/src/modules/parties/parties.controller.ts` | REST API |
| `apps/api/src/modules/parties/parties.service.ts` | Party CRUD + search |
| `apps/api/src/modules/parties/party-roles.service.ts` | Role assign/remove |
| `apps/api/src/modules/parties/party-contacts.service.ts` | Contact CRUD |
| `apps/api/src/modules/parties/dto/party.dto.ts` | DTO validation |
| `apps/api/src/app.module.ts` | Register `PartiesModule` |
| `apps/api/test/parties.integration.spec.ts` | 14 integration tests |
| `apps/api/test/test-app.ts` | Party permissions + PTY sequence bootstrap |

### Desktop (minimal UI)

| File | Change |
|------|--------|
| `apps/desktop/src/pages/PartiesPage.tsx` | List, search, create, edit, archive, roles |
| `apps/desktop/src/App.tsx` | `/parties` route |
| `apps/desktop/src/components/AppLayout.tsx` | Nav link |
| `apps/desktop/src/lib/api.ts` | Party API client methods |
| `packages/localization/src/locales/en.ts` | Party strings |
| `packages/localization/src/locales/ar.ts` | Party strings |

### Docs

| File | Change |
|------|--------|
| `docs/PHASE_3_PARTY_DESIGN.md` | Audit + design |
| `docs/PHASE_3_PARTY_COMPLETE.md` | This document |

### Regression fix (unrelated flaky test)

| File | Change |
|------|--------|
| `apps/api/test/finance.integration.spec.ts` | Unique fiscal period in pre-closed test (overlapping period flake) |

---

## 3. Database Schema

### New tables

| Table | Purpose |
|-------|---------|
| `parties` | Universal identity |
| `party_roles` | Business roles per party |
| `party_contacts` | Organization contact persons |
| `party_addresses` | Typed addresses |
| `party_identifiers` | Tax / registration IDs |

### Legacy hooks (nullable, unpopulated)

| Column | Table |
|--------|-------|
| `partyId` | `customers` |
| `partyId` | `suppliers` |

### Migration name

`20250907180000_universal_party`

---

## 4. API Endpoints

Base: `/api/v1/parties`

| Method | Route | Permission |
|--------|-------|------------|
| GET | `/parties` | `parties:parties:read` |
| GET | `/parties/:id` | `parties:parties:read` |
| POST | `/parties` | `parties:parties:create` |
| PATCH | `/parties/:id` | `parties:parties:update` |
| POST | `/parties/:id/archive` | `parties:parties:archive` |
| POST | `/parties/:id/roles` | `parties:roles:manage` |
| DELETE | `/parties/:id/roles/:role` | `parties:roles:manage` |
| GET | `/parties/:id/contacts` | `parties:contacts:read` |
| POST | `/parties/:id/contacts` | `parties:contacts:manage` |
| PATCH | `/parties/:id/contacts/:contactId` | `parties:contacts:manage` |
| POST | `/parties/:id/contacts/:contactId/archive` | `parties:contacts:manage` |

---

## 5. RBAC Permissions

| Permission | Action |
|------------|--------|
| `parties:parties:read` | List/get parties |
| `parties:parties:create` | Create party |
| `parties:parties:update` | Update party |
| `parties:parties:archive` | Archive party |
| `parties:roles:manage` | Assign/remove roles |
| `parties:contacts:read` | List contacts |
| `parties:contacts:manage` | Create/update/archive contacts |

Seeded in `seed.ts` and assigned to owner role; test boot in `test-app.ts`.

---

## 6. Audit

Uses existing `AuditService`:

| Entity | Actions |
|--------|---------|
| `party` | `created`, `updated`, `archived` |
| `party_role` | `assigned`, `removed` |
| `party_contact` | `created`, `updated`, `archived` |

---

## 7. Tenant / Branch Isolation

- All Party queries filter `tenantId`
- Roles, contacts, addresses, identifiers inherit party tenant scope
- Cross-tenant access returns `NotFoundException`
- Party is **tenant-wide**; branch context is not on Party itself
- Numbering uses tenant default branch for `number_sequences` (avoids NULL branch)

---

## 8. Legacy ERP Compatibility

- `Customer` and `Supplier` modules **unchanged**
- Legacy tables and sales/purchasing FKs **unchanged**
- Nullable `partyId` columns added for future adapter migration
- **No automatic backfill** of legacy records

```text
Legacy Customer/Supplier  →  (future adapter)  →  Universal Party
```

---

## 9. Finance Boundary

- Party operations do **not** call `FinancialPostingService`
- No journal entries created by Party module (verified in tests)
- Universal Finance behavior **unchanged**

---

## 10. PMS Boundary

- `Patient`, `PatientAccount`, `LedgerPostingService` **unchanged**
- No PMS schema or API modifications
- PMS Phase 1b/1c tests pass unchanged

---

## 11. Tests

**File:** `apps/api/test/parties.integration.spec.ts` (14 tests)

| Area | Coverage |
|------|----------|
| Party | Create individual/org, update, archive, duplicate code, search/pagination |
| Roles | Customer + supplier on same party, duplicate prevention, removal |
| Contacts | Create/update/archive, individual party rejection |
| Tenant isolation | Cross-tenant read/update/archive/roles/contacts blocked |
| Financial boundary | No GL journals from party ops |
| HTTP API | End-to-end `/parties` endpoints |

---

## 12. Typecheck

```bash
npm run typecheck -w @fratelanza/api   # PASS
```

---

## 13. Full Regression

```bash
npm test -w @fratelanza/api            # 89/89 PASS
```

| Suite | Tests |
|-------|-------|
| parties | 14 |
| finance | 19 |
| pms-patients | 17 |
| pms-ledger | 24 |
| auth | 5 |
| concurrency | 3 |
| resilience | 7 |
| **Total** | **89** |

---

## 14. Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Dual party representations (legacy + Party) | **High** | Expected until ERP migration phase |
| No legacy ↔ Party sync | **Medium** | Manual duplication possible short-term |
| Tax ID unique per tenant+type | **Low** | May need soft handling for shared IDs later |
| Overlapping fiscal periods (finance) | **Low** | Unrelated; test flake fixed |
| Party permissions require seed | **Low** | `seed.ts` + `test-app.ts` handle it |

---

## 15. Future Migration Strategy

1. **Phase 4+:** Adapter service to link/create `Customer`/`Supplier` from `Party` + role
2. **Sales/Purchasing:** Accept `partyId` alongside legacy IDs behind feature flag
3. **Phase 6+:** Optional `Patient.partyId` for clinical ↔ business identity bridge
4. **Finance:** Party-level AR/AP subledger (separate phase — not identity merge)

---

## 16. Phase 4 Recommendation

**Option A — Party ↔ Legacy ERP adapter:** Link Party roles to existing Customer/Supplier records; proof-of-migration for one sales flow.

**Option B — PMS Phase 1d (Services catalog):** Continue PMS vertical independently.

**Recommended:** **Option A** — begin legacy adapter with read-only Party→Customer link before changing sales posting paths.

---

## STOP

Phase 3 is complete. Do not proceed automatically. Await approval before Phase 4.
