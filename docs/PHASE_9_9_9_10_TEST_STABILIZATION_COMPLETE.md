# Phase 9.9 / 9.10 — Test Stabilization Complete

## Failures Found

Before stabilization, the full API suite intermittently reported **10 failures** (best observed **468/478 PASS**) after a fresh seed. Typical failures:

| Suite | Symptom | Isolated run |
|-------|---------|--------------|
| `construction-hardening.integration.spec.ts` | BOQ approve / billing post / material issue returned **403** in shared `beforeAll` | Passed alone after seed |
| `parties.integration.spec.ts` | Party create returned **403** | Passed alone |
| `construction-billing.integration.spec.ts` | Concurrent post test returned **409** instead of idempotent **201** | Failed on concurrent post |

Additional instability without seed: **200+ failures** when the demo tenant accumulated polluted license state, wrong tenant targeting, and stale DB residue.

## Root Causes

1. **Demo tenant mis-targeting** — `test-app.ts` helpers used `findFirst({ isActive: true })`, which could select an isolated tenant created by other suites instead of `FRATELANZA`.
2. **License state leakage** — Construction suites activated construction entitlements; some suites restored demo license inconsistently (`seedDemoLicense` vs `restoreConstructionLicense` vs none).
3. **Non-deterministic Ed25519 keys** — When `.env` signing keys drifted from in-process test keys, license integrity checks failed until re-signing.
4. **Missing explicit baseline** — Suites assumed a prior suite had restored demo license; order-dependent behavior resulted.
5. **Concurrent billing post race** — Session-scoped advisory locks did not cover the full post window; a losing concurrent claim threw **409** instead of waiting for the winning post to finish.
6. **Stray DB state** — Full suite runs without re-seed left cumulative data that affected later suites.

## Test Isolation Changes

- Added `prepareConstructionTestSuite()` — resets demo tenant, logs in, activates full construction license.
- Added `restoreDemoTenantLicense()` / `resetDemoTenant()` — deterministic demo baseline (perpetual demo modules + features, document sequences refreshed).
- Added `restoreConstructionLicense()` — restores full construction license after per-test license mutations (billing licensing block tests).
- Updated **all construction integration specs** to call `prepareConstructionTestSuite` in `beforeAll` and `restoreDemoTenantLicense` in `afterAll`.
- Updated `parties.integration.spec.ts` and `licensing.integration.spec.ts` to call `resetDemoTenant` in `beforeAll`; licensing retains `afterEach`/`afterAll` demo restore.
- Updated `auth.integration.spec.ts` to restore demo tenant in `afterAll`.
- Added Jest **`globalSetup`** (`test/global-setup.ts`) to run `npm run db:seed` before each full suite invocation.

## License State Isolation

| Helper | Purpose |
|--------|---------|
| `ensureLicense()` / `seedDemoLicense()` | Baseline perpetual demo entitlements (via `createTestApp`) |
| `resetDemoTenant()` | Re-seed demo license + refresh document sequences on `FRATELANZA` |
| `activateConstructionLicense()` | Full construction module + feature entitlements for construction suites |
| `restoreConstructionLicense()` | Re-apply construction license after intra-suite license mutations |
| `restoreDemoTenantLicense()` | End-of-suite demo baseline restore |

Production licensing semantics, EntitlementGuard, RBAC, and Ed25519 verification were **not** weakened.

## Data Isolation

- Demo tenant pinned to code **`FRATELANZA`** for all bootstrap helpers (`getDemoTenant`).
- Isolated tenants (`createIsolatedTenant`) remain scoped to explicit cross-tenant tests only.
- Jest global setup re-seeds baseline demo data before each full run.

## Typecheck

```
npm run typecheck
```

**Result:** PASS (all workspaces) on final tree before Phase 9.10 commit.

## Regression Before

- Best shared run after seed: **468/478 PASS** (10 failures)
- Worst polluted runs: **175–299 failures** without seed / after partial pollution

## Regression After

- Full suite run 1: **478/478 PASS**
- Full suite run 2 (no manual seed): **478/478 PASS**
- Pre-commit verification before 9.10: **478/478 PASS**

## Determinism Verification

- Two consecutive `npm test -w @fratelanza/api` runs passed with zero failures.
- Jest `globalSetup` seeds DB at start; each suite establishes its own required license baseline in `beforeAll`.
- No Jest execution-order dependency introduced.

## Git Commits

| Phase | Commit | Message |
|-------|--------|---------|
| 9.9 | `101abac` | `feat(phase-9.9): add construction reporting layer` |
| 9.10 | *(this commit)* | `feat(phase-9.10): final construction hardening` |

## Git Pushes

Both commits pushed to `origin/main`.

## Working Tree

Clean after Phase 9.10 commit and push (no stray test-output files, no secrets).

## Remaining Risks

- Full suite runtime ~9–10 minutes; CI must allow sufficient timeout.
- `globalSetup` re-seeds on every Jest invocation — intentional for determinism, adds ~20s startup.
- Isolated tenants created during tests remain in DB but no longer affect demo bootstrap.
- Mislabeled historical commits (`cf15390` = 9.6, `4668405` = 9.8) remain in history; not force-pushed.
