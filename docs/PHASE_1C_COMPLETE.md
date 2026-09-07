# Phase 1c Complete — PMS Patients & Patient Accounts

**Status:** Complete  
**Date:** 2026-09-07  
**Scope:** Patient CRUD, profile, notes, account auto-creation, search/listing, tenant isolation, archive policy — **no UI, no encounters/charges/payments**

---

## 1. Files Created / Modified

### Created

| File | Purpose |
|------|---------|
| `apps/api/src/modules/pms/patients/patients.module.ts` | Patients NestJS module |
| `apps/api/src/modules/pms/patients/patients.controller.ts` | REST API (`/api/v1/pms/patients`) |
| `apps/api/src/modules/pms/patients/patients.service.ts` | Patient CRUD, search, archive/delete policy |
| `apps/api/src/modules/pms/patients/patient-profile.service.ts` | 1:1 patient profile |
| `apps/api/src/modules/pms/patients/patient-notes.service.ts` | Patient notes |
| `apps/api/src/modules/pms/patients/dto/patient.dto.ts` | Request/query DTOs |
| `apps/api/test/pms-patients.integration.spec.ts` | 17 PostgreSQL integration tests |
| `docs/PHASE_1C_COMPLETE.md` | This document |

### Modified

| File | Change |
|------|--------|
| `apps/api/src/modules/pms/pms.module.ts` | Imports `PatientsModule` |
| `docs/PMS_DOMAIN_DESIGN.md` | Clarified PAT numbering uses default branch sequence (not `NULL branchId`) |

---

## 2. Patient Domain Architecture

```
PmsModule
 └── PatientsModule
      ├── PatientsController
      ├── PatientsService          ← CRUD, search, archive, foundation data
      ├── PatientProfileService    ← 1:1 profile upsert
      ├── PatientNotesService      ← notes list/create/soft-delete
      └── imports PmsLedgerModule  ← PatientAccountService only
```

**Patient 360 foundation** (internal, not exposed as a single endpoint yet):

```typescript
getPatientFoundation(tenantId, patientId) → {
  patient, profile, account summary, notesCount
}
```

Future Patient 360 can compose:

```
Patient → Profile, Notes, Account, Encounters, Charges, Payments, Ledger
```

No denormalized mega-table.

---

## 3. Patient API Endpoints

Base path: `/api/v1/pms/patients`

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/` | `pms:patients:read` | Paginated list + search |
| `GET` | `/:id` | `pms:patients:read` | Get patient by ID |
| `GET` | `/:id/account` | `pms:patients:read` | Tenant-scoped account lookup |
| `POST` | `/` | `pms:patients:create` | Create patient + account (atomic) |
| `PATCH` | `/:id` | `pms:patients:update` | Update patient fields |
| `POST` | `/:id/archive` | `pms:patients:delete` | Set status `inactive` |
| `DELETE` | `/:id` | `pms:patients:delete` | Soft-delete if no history |
| `GET` | `/:id/profile` | `pms:patients:read` | Get profile |
| `PUT` | `/:id/profile` | `pms:patients:update` | Upsert profile |
| `GET` | `/:id/notes` | `pms:patients:notes` | List notes |
| `POST` | `/:id/notes` | `pms:patients:notes` | Create note |
| `DELETE` | `/:id/notes/:noteId` | `pms:patients:notes` | Soft-delete note |

List response shape:

```json
{
  "success": true,
  "data": [ /* patients */ ],
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

---

## 4. Patient / Account Transaction Flow

```
POST /pms/patients
  │
  ├─ Validate tenant (JWT)
  ├─ Validate branchId if supplied
  ├─ Resolve numbering branch (patient branchId OR tenant default branch)
  │
  └─ prisma.$transaction(tx)
       ├─ DocumentNumberService.nextNumber(tenant, 'PAT', 'PAT', branch, tx)
       │    → PAT-YYYY-NNNNNN
       ├─ tx.patient.create(...)
       ├─ PatientAccountService.getOrCreateAccount(tenant, patientId, tx)
       │    → cachedBalance = 0, no ledger entry
       └─ optional tx.patientProfile.create(...) if profile in DTO
```

**Invariant:** If any step fails, neither patient nor account is persisted.

**Financial safety:** Phase 1c does not write to `pms_ledger_entries` or mutate `cachedBalance` beyond the default `0` on account creation.

---

## 5. Numbering Strategy

- Format: `PAT-YYYY-NNNNNN` (6-digit padding)
- Uses existing `DocumentNumberService` + `number_sequences` table
- Document type: `PAT`, prefix: `PAT`
- Sequence key: `(tenantId, branchId, documentType, fiscalYear)`
- **Branch for numbering:** patient's `branchId` if provided, otherwise tenant **default branch**
- Does **not** use `NULL branchId` — PostgreSQL treats NULL as distinct in unique indexes, which breaks upsert/conflict for tenant-wide sequences

Seed reserves `PAT-2026-000001` for the demo patient; sequence `nextNumber=2` ensures API-created patients start at `PAT-2026-000002`.

---

## 6. Tenant Isolation

Every operation scopes by `tenantId` from JWT:

| Check | Implementation |
|-------|----------------|
| Patient lookup | `where: { id, tenantId, deletedAt: null }` |
| Branch validation | `branch.tenantId === tenantId` |
| Profile | Patient must belong to tenant before upsert |
| Notes | `where: { tenantId, patientId }` |
| Account | `PatientAccountService` tenant-scoped lookups |

Cross-tenant access returns **404** (not found), not data leakage.

Integration tests verify cross-tenant read, update, archive, profile, notes, and account access all fail safely.

---

## 7. Authorization

Uses existing RBAC via `@RequirePermissions` + `PermissionsGuard`:

| Permission | Usage |
|------------|-------|
| `pms:patients:read` | List, get, profile read, account read |
| `pms:patients:create` | Create patient |
| `pms:patients:update` | Update patient, upsert profile |
| `pms:patients:delete` | Archive, soft-delete |
| `pms:patients:notes` | Note CRUD |

Seeded in Phase 1a; admin role receives all PMS permissions.

---

## 8. Search & Pagination

Server-side PostgreSQL/Prisma queries — no in-memory filtering.

**Search fields:** code, firstName, lastName, fullName, phone, email (case-insensitive `contains`)

**Filters:** `branchId`, `status`, `search`

**Pagination:** `page` (default 1), `limit` (default 20, max 100)

**Ordering:** `lastName ASC`, `firstName ASC`, `code ASC` (deterministic)

---

## 9. Archive / Delete Policy

| Scenario | Behavior |
|----------|----------|
| Patient with transactional history | `DELETE` rejected (400); use `POST /archive` → `status: inactive` |
| Patient without history | `DELETE` → soft-delete (`deletedAt` set, `status: inactive`) |
| Transactional history check | charges, payments, encounters, refunds, adjustments, ledger entries |

Patients with financial history remain auditable — no destructive hard delete.

---

## 10. Tests

**File:** `apps/api/test/pms-patients.integration.spec.ts` — **17 tests**

| Area | Coverage |
|------|----------|
| Creation | PAT code, account auto-create, balance=0, profile in transaction, duplicate code, rollback, invalid branch |
| Tenant isolation | Cross-tenant read/update/archive/profile/notes/account |
| Search | Code, phone, name, tenant scope, pagination |
| Profile | Upsert, duplicate prevention, tenant isolation |
| Notes | Create, list, patient/tenant isolation |
| Account invariant | One account per patient; idempotent getOrCreate |
| Archive/delete | History blocks delete; archive works; clean soft-delete |
| Foundation | `getPatientFoundation()` for future Patient 360 |

---

## 11. Regression Results

```bash
npm run typecheck -w @fratelanza/api   # PASS
npm test -w @fratelanza/api            # 56/56 PASS
```

| Suite | Tests |
|-------|-------|
| auth.integration | 5 |
| concurrency.integration | 5 |
| resilience.integration | 3 |
| pms-ledger.integration | 24 |
| **pms-patients.integration** | **17** |
| **Total** | **56** |

Phase 0 + Phase 1b tests remain green.

---

## 12. Unresolved Risks

| Risk | Notes |
|------|-------|
| PAT numbering tied to branch sequence | Uses patient branch or default branch — not a single global tenant counter. Acceptable for MVP; document if multi-branch numbering semantics need refinement. |
| `NULL branchId` in `number_sequences` | Unsafe with PostgreSQL unique semantics — avoided for PAT; future tenant-wide document types must not use NULL branchId without schema change. |
| Search performance at scale | `contains` + OR across 6 fields may need trigram/GIN indexes at high volume. |
| Delete vs archive UX | API exposes both; clients must prefer archive when history exists. |
| Demo seed collision | Seed patient `PAT-2026-000001` requires sequence `nextNumber ≥ 2` on default branch. |

---

## STOP

Phase 1c is complete. **Do not proceed to Phase 1d** (Services catalog) without approval.
