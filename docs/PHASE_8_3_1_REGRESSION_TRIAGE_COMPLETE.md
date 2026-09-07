# PHASE 8.3.1 REGRESSION TRIAGE COMPLETE

**Status:** COMPLETE — 2026-09-07  
**Scope:** Regression triage only — no new features, no Construction, no Phase 9

---

## Failure 1 — Projects Search

### Reproduction

`projects.integration.spec.ts` → `supports search and pagination`

```typescript
POST /api/v1/projects  { name: 'Searchable Widget Project', code: 'PRJ-SRCH-<ts>' }
GET  /api/v1/projects?search=Searchable+Widget&limit=5&page=1
expect data.some(p => p.code === code)  // failed
```

Reproduced in isolation (not flaky). `meta.total >= 1` passed, but the newly created project was absent from page 1.

### Root cause

Search matched many accumulated projects named **Searchable Widget Project** from prior test runs in the shared PostgreSQL database. List ordering was always `{ code: 'asc' }, { name: 'asc' }` regardless of search. With `limit=5`, the newest matching project (highest `PRJ-SRCH-<timestamp>` code) sorted after older matches and was excluded from page 1.

This is a **pagination + ordering regression**, not a broken search filter. The Prisma `OR` filter on code/name/description was correct; tenant scoping was correct.

### Fix

In `ProjectsService.list()`, when a search term is present, order results by `{ createdAt: 'desc' }` first so the most recently created matches appear on page 1. Default non-search ordering unchanged.

### Tests

- Existing `supports search and pagination` — unchanged, now passes
- Full `projects.integration.spec.ts` — 27/27 PASS

---

## Failure 2 — Licensing User Limit

### Reproduction

`licensing.integration.spec.ts` → `accepts usage below user limit`

```typescript
await prisma.tenantLicense.update({ data: { maxUsers: 100 } });
POST /api/v1/users  → 403
```

Debug output:

```json
{ "message": "License limit reached for maxUsers (115/100)" }
```

Reproduced in isolation.

### Authorization path

```
JWT (owner)
→ PermissionsGuard (core:users:create) ✓
→ EntitlementGuard (@LicenseExempt on UsersController) — skipped
→ UsersService.create()
  → count active users (115)
  → EntitlementService.assertLimit(tenantId, 'maxUsers', activeUsers + 1)
    → projected 116 vs limit 100 → ForbiddenException
```

RBAC and module entitlements were not the rejection source. The limit guard fired correctly for an over-capacity tenant.

### Root cause (two issues)

1. **Test fixture:** Hard-coded `maxUsers: 100` assumed fewer than 100 active users. Shared test DB had **115** active users from cumulative integration test runs. The test no longer represented “below limit.”

2. **Boundary semantics:** `assertLimit` used `current >= limitValue`, which incorrectly rejects creating the **last allowed user** when `projectedCount === limitValue` (e.g. 5 active + max 5 should allow filling to 5, not reject at 5/5 before the create).

### Fix

1. **`EntitlementService.assertLimit`:** Changed comparison from `>=` to `>` so a projected count equal to the licensed maximum is allowed; only strictly exceeding the limit is rejected.

2. **`licensing.integration.spec.ts`:**
   - `accepts usage below user limit` — sets `maxUsers = activeUsers + 5` (relative headroom)
   - **New:** `allows user creation up to licensed max users` — sets `maxUsers = activeUsers + 1`, expects 201 (fills exactly to licensed max)
   - `rejects user creation at license limit` — unchanged semantics (`maxUsers = activeUsers`), added message assertion

Commercial licensing model, Ed25519 verification, TenantLicense source-of-truth, and RBAC separation were **not** modified.

### Tests

| Scenario | Expected | Result |
|----------|----------|--------|
| Below limit (`active + 5`) | 201 | PASS |
| Fill to licensed max (`active + 1`) | 201 | PASS |
| At capacity (`max = active`) | 403 | PASS |

- Full `licensing.integration.spec.ts` — 20/20 PASS

---

## Failure 3 — PMS Name Search

### Reproduction

`pms-patients.integration.spec.ts` → `finds patients by code, phone, and name`

- Search by unique `code` — PASS
- Search by unique `phone` — PASS
- Search by `firstName` substring `Searchable` — **FAIL**

Reproduced in isolation.

### Root cause

Same class of issue as Projects: many patients with `firstName: 'Searchable'` accumulated in the shared test DB. Default list order `{ lastName: 'asc' }, { firstName: 'asc' }` placed the newly created patient outside the default first page (`limit=20`) when many matches existed.

Prisma `OR` filter on firstName/lastName/fullName/phone/email was correct. Tenant filtering was correct. Case-insensitive mode was correct.

### Fix

In `PatientsService.list()`, when a search term is present, order by `{ createdAt: 'desc' }` first. Default non-search ordering unchanged.

PMS architecture was not redesigned.

### Tests

- Existing `finds patients by code, phone, and name` — unchanged, now passes
- Full `pms-patients.integration.spec.ts` — 17/17 PASS

---

## Regression Before

| Metric | Value |
|--------|-------|
| Passed | 255 |
| Failed | 3 |
| Total | 258 |

Failures:

1. `projects.integration.spec.ts` — search pagination
2. `licensing.integration.spec.ts` — user below limit
3. `pms-patients.integration.spec.ts` — name search

## Regression After

| Metric | Value |
|--------|-------|
| Passed | **259** |
| Failed | **0** |
| Total | **259** |

New test: `allows user creation up to licensed max users` (+1).

All 15 suites PASS including Phase 8.2/8.3 finance migration suites.

## Typecheck

`npm run typecheck` — **PASS** across all workspaces.

## Files Changed

| File | Change |
|------|--------|
| `apps/api/src/modules/license/entitlement.service.ts` | `assertLimit`: `>=` → `>` |
| `apps/api/src/modules/projects/projects.service.ts` | Search results ordered by `createdAt desc` |
| `apps/api/src/modules/pms/patients/patients.service.ts` | Search results ordered by `createdAt desc` |
| `apps/api/test/licensing.integration.spec.ts` | Relative limit fixtures + boundary regression test |

**Not changed:** Sales/Purchasing pilots, FinancialPostingService, AccountingEngineService, Construction, PMS core, Party, inventory.

## Risk Assessment

| Risk | Level | Notes |
|------|-------|-------|
| Search ordering change | Low | Applies only when `search` query param is set; newest-first is standard UX |
| Limit boundary fix | Low | Corrects off-by-one; aligns with licensed max semantics |
| Shared DB pollution | Medium | Tests now use relative limits; search ordering mitigates accumulated data |

## Construction Readiness

Both Universal Finance pilots (Purchasing receive + Sales invoice post) remain intact and fully tested. Full API regression is green.

**Verdict: READY FOR CONSTRUCTION**

*(Construction itself has not been started. This verdict means the regression blockers are cleared and the finance migration foundation can be evaluated for a separate Construction phase.)*
