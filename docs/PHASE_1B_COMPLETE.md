# Phase 1b Complete — PMS Financial Core

**Status:** Complete  
**Date:** 2026-09-07  
**Scope:** `LedgerPostingService`, `PatientAccountService`, money utilities, integration tests — **no UI, no Charge/Payment services**

---

## 1. Files Created / Modified

### Created

| File | Purpose |
|------|---------|
| `apps/api/src/modules/pms/pms.module.ts` | PMS domain root module |
| `apps/api/src/modules/pms/ledger/ledger.module.ts` | Ledger submodule |
| `apps/api/src/modules/pms/ledger/patient-account.service.ts` | Account lifecycle + reconciliation |
| `apps/api/src/modules/pms/ledger/ledger-posting.service.ts` | Append-only ledger posting |
| `apps/api/src/modules/pms/ledger/money.util.ts` | Decimal validation + balance math |
| `apps/api/src/modules/pms/ledger/ledger.types.ts` | Shared TypeScript interfaces |
| `apps/api/test/pms-test.helpers.ts` | Test fixtures for PMS financial tests |
| `apps/api/test/pms-ledger.integration.spec.ts` | 24 PostgreSQL integration tests |
| `docs/PHASE_1B_COMPLETE.md` | This document |

### Modified

| File | Change |
|------|--------|
| `apps/api/src/app.module.ts` | Registered `PmsModule` |
| `docs/PMS_DOMAIN_DESIGN.md` | Clarified Phase 1b posting implementation |

---

## 2. Services Created

### `PatientAccountService`

| Method | Responsibility |
|--------|----------------|
| `getOrCreateAccount(tenantId, patientId, tx?)` | Single account per patient; race-safe create |
| `getAccountForPatient` / `getAccountById` | Tenant-scoped lookup |
| `getBalance` | Returns cached balance as `Decimal` |
| `assertAccountScope` | Validates tenant + account + patient alignment |
| `lockAccountForUpdate` | `SELECT … FOR UPDATE` row lock |
| `computeLedgerDerivedBalance` | `SUM(debits) - SUM(credits)` from ledger |
| `reconcileBalance` | Compares cached vs derived balance |

### `LedgerPostingService`

| Method | Responsibility |
|--------|----------------|
| `postEntry(input, tx)` | Append ledger entry + update `cachedBalance` atomically |
| `updateLedgerEntry` / `deleteLedgerEntry` | **Always reject** — append-only enforcement |
| `rejectLedgerMutation` | Throws with explicit invariant message |

### `money.util.ts`

| Function | Responsibility |
|----------|----------------|
| `toPositiveMoneyDecimal` | Rejects zero, negative, non-finite values |
| `applyDirectionToBalance` | Debit increases balance; credit decreases |

---

## 3. Transaction Strategy

```
Caller (future ChargeService / PaymentService)
  └── prisma.$transaction(async (tx) => {
        // business document writes (Phase 1c+)
        await ledgerPosting.postEntry(input, tx);  // NO nested $transaction
      })
```

Rules enforced in code:

1. `postEntry` **requires** an active `tx` — never calls `prisma.$transaction` internally
2. Ledger row insert and `patientAccount.update` happen sequentially in the same `postEntry` call
3. Caller-level `$transaction` rollback reverts both ledger and balance together (verified by tests)
4. Amount validation runs before any transactional DB query

---

## 4. Locking Strategy

```sql
SELECT … FROM pms_patient_accounts
WHERE id = $accountId AND "tenantId" = $tenantId
FOR UPDATE
```

- Called via `PatientAccountService.lockAccountForUpdate()` at the start of every `postEntry`
- Serializes concurrent financial operations on the same account
- Works with PostgreSQL default `READ COMMITTED` isolation

---

## 5. Balance Semantics (implemented)

```
Debit  → patient owes more   → cachedBalance increases
Credit → patient owes less   → cachedBalance decreases

cachedBalance = SUM(debit amounts) - SUM(credit amounts)
```

Each `LedgerEntry` stores `runningBalance` after the entry for audit trail reconstruction.

---

## 6. Tenant Isolation

Validated on every posting:

1. `accountId` must exist for `tenantId` (via `FOR UPDATE` query)
2. `patientId` must match `account.patientId`
3. `patientId` must belong to `tenantId` and not be soft-deleted
4. `branchId` must belong to `tenantId`

Cross-tenant attempts return `NotFoundException` or `ForbiddenException` — never silent mis-posting.

---

## 7. Append-Only Enforcement

- No Prisma `update`/`delete` methods exposed for `LedgerEntry`
- `LedgerPostingService.updateLedgerEntry()` and `deleteLedgerEntry()` throw `BadRequestException`
- Future corrections must use `entryType: reversal` with `reversalOfId` (reversal validation included)

---

## 8. Test Matrix & Results

```
Test Suites: 4 passed, 4 total
Tests:       39 passed, 39 total
```

### PMS tests (`pms-ledger.integration.spec.ts`) — 24 tests

| Category | Tests | Result |
|----------|-------|--------|
| Account create/retrieve/duplicate | 5 | PASS |
| Ledger debit/credit/sequential | 4 | PASS |
| Zero/negative rejection | 2 | PASS |
| Decimal precision (0.1 + 0.2 = 0.3) | 1 | PASS |
| Large amounts | 1 | PASS |
| Append-only rejection | 1 | PASS |
| Running balance on entries | 1 | PASS |
| Atomic rollback | 2 | PASS |
| **10 concurrent debits** | 1 | PASS |
| **10 concurrent credits** | 1 | PASS |
| **Mixed concurrent (10+10)** | 1 | PASS |
| Cross-tenant rejection | 3 | PASS |
| Money utilities | 2 | PASS |
| Reconciliation match | 1 | PASS |

### Phase 0 ERP tests — 15 tests (unchanged)

All continue to pass.

### Typecheck

```
npm run typecheck -w @fratelanza/api  → PASS
```

---

## 9. Concurrency Results

All concurrency tests verify:

```text
reconcileBalance().matches === true
cachedBalance === ledgerDerivedBalance
```

| Scenario | Expected | Actual |
|----------|----------|--------|
| 10 × debit 1.0000 from 0 | 10 | 10 ✓ |
| 10 × credit 1.0000 from 10 | 0 | 0 ✓ |
| 10 × debit 5 + 10 × credit 3 from 100 | 120 | 120 ✓ |

---

## 10. Reconciliation Preparation

`PatientAccountService.reconcileBalance()` returns:

```typescript
{
  accountId,
  cachedBalance,           // from PatientAccount
  ledgerDerivedBalance,    // SUM(debits) - SUM(credits)
  matches: boolean,
  entryCount: number,
}
```

Future scheduled job can call this without schema changes.

---

## 11. Limitations

| Limitation | Planned phase |
|------------|---------------|
| No HTTP controllers for PMS yet | Phase 1c+ |
| No reversal posting helper (only validation) | Phase 1d charges/payments |
| No payment idempotency (by design — PaymentService) | Phase 1e |
| Reconciliation job not scheduled | Phase 1b+ admin tooling |
| `allowCreditBalance` tenant setting not enforced yet | Phase 1d |
| No audit log wiring on postEntry yet | Phase 1c |

---

## 12. Remaining Risks

| Risk | Mitigation |
|------|------------|
| Direct Prisma client bypass could mutate ledger | Service layer is sole API; document invariant; add DB triggers later if needed |
| High contention on single patient account | Acceptable for clinic MVP; monitor lock wait times |
| Branch validation adds query per post | Required for branch-aware reporting; acceptable cost |

---

## STOP — Phase 1b Complete

**Do not proceed to Phase 1c** (Patient CRUD / Service catalog API) until approved.

Next recommended step: **Phase 1c** — Patients module + auto account creation on registration.
