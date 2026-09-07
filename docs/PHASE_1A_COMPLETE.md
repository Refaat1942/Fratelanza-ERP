# Phase 1a Complete — PMS Prisma Schema Migration

**Status:** Complete  
**Date:** 2026-09-07  
**Scope:** Schema, migration, permissions, seed only — **no UI, no NestJS PMS modules**

---

## Migration

| Item | Value |
|------|-------|
| **Migration name** | `20250907141500_pms_domain` |
| **Path** | `packages/database/prisma/migrations/20250907141500_pms_domain/migration.sql` |
| **Strategy** | Additive only — no ERP table modifications |
| **Apply command** | `npm run db:migrate:server:deploy` |

---

## Tables Created (14)

| Table | Model | Soft delete |
|-------|-------|-------------|
| `pms_patients` | Patient | Yes |
| `pms_patient_profiles` | PatientProfile | No |
| `pms_patient_notes` | PatientNote | Yes |
| `pms_patient_accounts` | PatientAccount | No |
| `pms_service_categories` | ServiceCategory | Yes |
| `pms_services` | Service | Yes |
| `pms_encounters` | Encounter | Yes |
| `pms_charges` | Charge | No (void workflow) |
| `pms_charge_lines` | ChargeLine | No |
| `pms_payments` | Payment | No (void workflow) |
| `pms_payment_allocations` | PaymentAllocation | No |
| `pms_refunds` | Refund | No |
| `pms_adjustments` | Adjustment | No |
| `pms_ledger_entries` | LedgerEntry | No (append-only) |

---

## Enums Created (14)

`PatientStatus`, `PatientGender`, `EncounterStatus`, `ChargeStatus`, `PaymentStatus`, `PaymentMethod`, `RefundStatus`, `AdjustmentStatus`, `AdjustmentType`, `AdjustmentDirection`, `LedgerEntryType`, `LedgerDirection`, `PatientAccountStatus`, `PatientNoteType`

---

## Key Constraints

| Constraint | Table(s) |
|------------|----------|
| `UNIQUE (tenantId, code)` | patients, services, service_categories |
| `UNIQUE (tenantId, number)` | encounters, charges, payments, refunds, adjustments |
| `UNIQUE (tenantId, patientId)` | patient_accounts |
| `UNIQUE (patientId)` | patient_accounts, patient_profiles |
| `UNIQUE (tenantId, idempotencyKey)` | payments |
| `UNIQUE (paymentId, chargeId)` | payment_allocations |
| Append-only ledger | no updates/deletes on `pms_ledger_entries` (enforced in service layer) |

---

## Indexes (reporting & isolation)

- Tenant scoping: `(tenantId, status)`, `(tenantId, branchId)`, `(tenantId, patientId, …)`
- Ledger: `(accountId, postedAt)`, `(tenantId, referenceType, referenceId)`, `(tenantId, branchId, entryDate)`
- Refunds: `(tenantId, paymentId)` for refund limit aggregation
- Branch reporting: `(tenantId, branchId, chargeDate/paymentDate/entryDate)`

---

## Architecture Decisions (confirmed in schema)

1. **One PatientAccount per Patient per Tenant** — no branch on account table
2. **Branch-aware transactions** — `branchId` required on Encounter, Charge, Payment, Refund, Adjustment, LedgerEntry
3. **Ledger source of truth** — `cachedBalance` + `balanceAsOf` on PatientAccount; updated only in same TX as ledger writes (service layer, Phase 1b)
4. **Historical snapshots** — `serviceCode`, `serviceName`, `unitPrice` on ChargeLine
5. **Payment idempotency** — required `idempotencyKey`, unique per tenant
6. **Money** — `Decimal(18,4)` for amounts; `Decimal(8,4)` for discount percentages

---

## Permissions Added (30)

Module `pms` with features: `patients`, `services`, `encounters`, `charges`, `ledger`, `discounts`, `reports`, `settings`

Assigned to `owner` role via existing seed loop over all permissions.

---

## Seed Changes

- `ALL_PERMISSIONS` = ERP + PMS permissions
- `TenantModule` `pms` enabled for demo tenant
- Tenant settings extended with `pms` block (discount limits, `allowCreditBalance`)
- Number sequences: `PAT`, `ENC`, `CHG`, `PMT`, `REF`, `ADJ` (PAT starts at 2 after demo patient)
- Demo data:
  - 2 service categories (Consultations, Procedures)
  - 3 services (CONS-30, CONS-60, PROC-BASIC)
  - 1 demo patient `PAT-2026-000001` (Sara Hassan) + profile + account (balance 0)

---

## Test Results

```
npm run typecheck -w @fratelanza/api  → PASS
npm test -w @fratelanza/api           → 15/15 PASS (ERP Phase 0 tests unaffected)
npm run db:seed                       → PASS
```

ERP integration tests continue to pass — additive migration did not break frozen modules.

---

## Remaining Risks

| Risk | Mitigation (Phase 1b+) |
|------|------------------------|
| No service-layer ledger posting yet | Implement `LedgerPostingService` with same-TX rule |
| Refund sum ≤ payment enforced only in app layer | Integration tests in Phase 1e |
| No cross-tenant composite FKs at DB level | Service-layer `@TenantId()` + tests |
| Reconciliation job not built | Phase 1b admin diagnostic |
| PMS permissions exist but no API routes yet | Phase 1b–1f modules |
| Demo patient PAT code collides if sequence not seeded | Seed sets PAT `nextNumber: 2` |

---

## Next Step (NOT started)

**Phase 1b:** `LedgerPostingService` + `PatientAccountService` — still no UI.

See `docs/PMS_DOMAIN_DESIGN.md` §17 for full implementation order.
