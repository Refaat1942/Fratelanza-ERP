# Phase 3 — Universal Party & Business Contacts Design

**Status:** Approved for implementation  
**Date:** 2026-09-07  
**Prerequisite:** Phase 2 Universal Finance ✅, Phase 2.1 fiscal locking ✅

---

## 1. Audit Findings

### 1.1 Existing party-like entities

| Entity | Table | Scope | Code | Balance | Soft delete |
|--------|-------|-------|------|---------|-------------|
| `Customer` | `customers` | `tenantId` + optional `branchId` | Manual `code`, unique per tenant | Denormalized AR `balance` | `deletedAt` + `isActive` |
| `Supplier` | `suppliers` | `tenantId` only | Manual `code`, unique per tenant | Denormalized AP `balance` | `deletedAt` + `isActive` |
| `Patient` | `pms_patients` | `tenantId` + optional `branchId` | Auto `PAT-YYYY-NNNNNN` | `PatientAccount.cachedBalance` | `deletedAt` + `status` enum |

**No existing models:** `Party`, `Person`, `Contact`, `Employee`.

### 1.2 ERP references

- **Sales:** optional `SalesInvoice.customerId`, required `CustomerPayment.customerId`; updates `Customer.balance`.
- **Purchasing:** required `PurchaseOrder.supplierId`; updates `Supplier.balance`.
- **POS:** optional `PosSale.customerId`; no balance update.
- **Accounting/Finance:** aggregate AR/AP accounts only — no party FK on journal lines.

### 1.3 Patterns to reuse

| Pattern | Source |
|---------|--------|
| Tenant isolation | All domain services filter `tenantId` |
| Soft archive | `deletedAt` + status/`isActive` (Customer, Patient) |
| Pagination/search | `PatientsService.list()` |
| Auto numbering | `DocumentNumberService` + tenant default branch (Patient PAT) |
| RBAC | `{module}:{feature}:{action}` e.g. `customers:customers:read` |
| Audit | `AuditService.log()` — currently login-only; Party will use it |
| Permissions seed | `seed.ts` + `test-app.ts` upsert pattern |

### 1.4 Duplication risk

Today the same real-world organization could exist as separate `Customer` and `Supplier` rows with duplicated name/contact/tax fields. Phase 3 introduces **Party** as the universal identity layer without deleting or migrating legacy rows.

### 1.5 Branch asymmetry

- `Customer` may be branch-scoped (`branchId` optional).
- `Supplier` is tenant-wide.
- **Decision:** `Party` is **tenant-scoped**. Branch-specific commercial relationships remain on transactional documents (invoices, orders) and legacy `Customer.branchId` until a later migration phase.

---

## 2. Architecture Decision

Introduce an **additive Universal Party registry** parallel to legacy ERP and PMS:

```text
Party (identity)
 ├── PartyRole (customer | supplier | …)
 ├── PartyContact (people at organizations)
 ├── PartyAddress (reusable typed addresses)
 └── PartyIdentifier (tax / registration IDs)

Legacy (unchanged, optional future link)
 ├── Customer.partyId?  → Party
 ├── Supplier.partyId?  → Party
 └── Patient            → separate; optional Party link in Phase 6+
```

**Critical rules:**

- `Patient ≠ Party`, `Patient ≠ Customer`.
- Party holds **identity only** — no AR/AP balances, no GL posting.
- Legacy customers/suppliers remain authoritative for ERP until explicit migration.

---

## 3. Data Model

### 3.1 `Party`

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Primary key |
| `tenantId` | UUID | Tenant isolation (required) |
| `type` | `individual \| organization` | Person vs company |
| `code` | String | Human-readable party number (`PTY-YYYY-NNNNNN`) |
| `displayName` | String | Primary UI/search name |
| `legalName` | String? | Registered legal name (organizations) |
| `email`, `phone`, `website` | String? | Primary contact channels |
| `notes` | String? | Free-form notes |
| `status` | `active \| archived` | Lifecycle |
| `createdAt`, `updatedAt` | DateTime | Audit timestamps |
| `deletedAt` | DateTime? | Soft delete (consistent with Customer) |

**Constraints:** `@@unique([tenantId, code])`  
**Indexes:** `tenantId + displayName`, `tenantId + status`, `tenantId + type`

### 3.2 `PartyRole`

| Field | Type | Purpose |
|-------|------|---------|
| `tenantId`, `partyId` | UUID | Scoped assignment |
| `role` | `customer \| supplier` | Extensible enum |
| `isActive` | Boolean | Soft role removal |
| `assignedAt`, `removedAt` | DateTime | Role lifecycle |

**Constraints:** `@@unique([tenantId, partyId, role])` — one role type per party per tenant.

Future roles (`employee`, `contractor`, …) add enum values without schema redesign.

### 3.3 `PartyContact`

Contact persons linked to an **organization** `Party`:

| Field | Purpose |
|-------|---------|
| `name`, `title` | Identity at organization |
| `email`, `phone`, `mobile` | Contact channels |
| `notes` | Additional context |
| `isPrimary` | Primary contact flag |
| `isActive`, `deletedAt` | Archive pattern |

Contacts store inline identity (no mandatory link to individual `Party`) to keep Phase 3 focused. Optional `contactPartyId` can be added later.

### 3.4 `PartyAddress`

Reusable typed addresses:

| Field | Purpose |
|-------|---------|
| `type` | `billing \| shipping \| office \| home \| other` |
| `line1`, `line2`, `city`, `state`, `postalCode`, `country` | Structured address |
| `isPrimary` | Default address for type/display |

### 3.5 `PartyIdentifier`

Extensible tax/business identifiers for future ETA integration:

| Field | Purpose |
|-------|---------|
| `type` | `tax_id \| vat \| commercial_registration \| national_id \| other` |
| `value` | Identifier value |
| `country` | Jurisdiction hint |
| `isPrimary` | Primary identifier |

**Constraints:** `@@unique([tenantId, type, value])` — tenant-scoped uniqueness per identifier type (allows same value across tenants).

### 3.6 Legacy migration hooks (additive, nullable)

```prisma
Customer.partyId?  @unique
Supplier.partyId?  @unique
```

No data backfill in Phase 3.

---

## 4. Numbering Strategy

- Document type: `PTY`, prefix: `PTY`
- Format: `PTY-{fiscalYear}-{paddedNumber}` (matches PAT/JE convention)
- Branch context: tenant **default branch** (same as Patient when no branch supplied) — avoids NULL branch in `number_sequences`
- Auto-assigned on create unless explicit code provided (tests may pass explicit codes)

---

## 5. API Design

Base path: `/api/v1/parties`

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

Addresses and identifiers are accepted on party create/update payloads (nested) for Phase 3 scope.

---

## 6. Search & Pagination

Server-side search on: `code`, `displayName`, `legalName`, `email`, `phone`, identifier values (join).

- Default sort: `displayName asc`, `code asc`
- Page/limit with max 100
- Filter: `type`, `status`, `role`

---

## 7. RBAC Permissions

| Key | Action |
|-----|--------|
| `parties:parties:read` | List, get |
| `parties:parties:create` | Create |
| `parties:parties:update` | Update |
| `parties:parties:archive` | Archive |
| `parties:roles:manage` | Assign/remove roles |
| `parties:contacts:read` | List contacts |
| `parties:contacts:manage` | Create/update/archive contacts |

---

## 8. Audit Events

Via existing `AuditService`:

| Entity | Actions |
|--------|---------|
| `party` | `created`, `updated`, `archived` |
| `party_role` | `assigned`, `removed` |
| `party_contact` | `created`, `updated`, `archived` |

---

## 9. Data Integrity Rules

| Case | Policy |
|------|--------|
| Archive party with roles/history | Allowed — status `archived`, roles deactivated |
| Customer + Supplier on same party | Allowed via two `PartyRole` rows |
| Contacts on archived org | Contacts remain readable; new contacts blocked on archived party |
| Individual without org | Valid — contacts optional |
| Org without contacts | Valid |
| Duplicate phone/email same tenant | **Allowed** — no restrictive uniqueness |
| Same phone/email different tenants | Allowed |
| Tax ID duplicate same tenant | Prevented by `@@unique([tenantId, type, value])` |
| Party GL journals | **Never** — Party ops do not call `FinancialPostingService` |

---

## 10. Boundaries

### Finance

Party is identity only. No AR/AP subledger, no journal creation in Phase 3.

### PMS

No changes to `Patient`, `PatientAccount`, or `LedgerPostingService`.

### Legacy ERP

`Customer` / `Supplier` modules frozen. Optional `partyId` column for future adapter only.

---

## 11. Future Migration Strategy

```text
Phase 3: Party registry (new records)
Phase 4+: Adapter service maps Customer/Supplier ↔ Party
         Sales/Purchasing accept partyId OR legacy customerId/supplierId
Phase 6+: Optional Patient.partyId link (clinical identity bridge)
```

No automatic backfill in Phase 3.

---

## 12. Migration

**Name:** `20250907180000_universal_party`  
**Type:** Additive only — new tables + nullable `partyId` on customers/suppliers.

---

## STOP

Design approved for implementation. Proceed to schema + API + tests.
