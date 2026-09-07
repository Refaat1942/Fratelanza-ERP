# Phase 0 Complete — Stabilization & LAN MVP Foundation

**Status:** Complete  
**Date:** 2026-09-07  
**Architecture:** Electron (thin client) → NestJS → PostgreSQL → LAN  
**Next step:** Phase 1 — proper PMS domain modules (Patients, Services, Ledger, etc.)

---

## Executive Summary

Phase 0 stabilizes the existing stack for a **LAN-only, single-server MVP**. Offline SQLite sync is disabled by default. ERP modules remain in the codebase but are **frozen** (see `docs/LEGACY_ERP.md`). Security, concurrency, error handling, and integration tests are in place. **15/15 integration tests pass** against a live PostgreSQL database.

---

## 1. Files Changed

### Backend (API)

| File | Change |
|------|--------|
| `apps/api/src/config/app-config.ts` | **NEW** — config bootstrap + cache reset |
| `apps/api/src/main.ts` | Config validation at startup; global exception filter |
| `apps/api/src/app.module.ts` | Legacy ERP module grouping comment |
| `apps/api/src/common/filters/http-exception.filter.ts` | Logs unexpected errors; safe client responses |
| `apps/api/src/common/services/document-number.service.ts` | Atomic PostgreSQL upsert for document numbers |
| `apps/api/src/common/services/inventory-ledger.service.ts` | Atomic stock balance upsert; Read Committed |
| `apps/api/src/common/services/accounting-engine.service.ts` | Journal numbering inside transaction |
| `apps/api/src/modules/auth/auth.service.ts` | Refresh token rotation; `assertSessionActive()` |
| `apps/api/src/modules/auth/auth.module.ts` | JWT secret from validated config |
| `apps/api/src/modules/auth/jwt.strategy.ts` | Live session validation on every request |
| `apps/api/src/modules/sales/sales.service.ts` | Invoice + payment creation in transactions |
| `apps/api/src/modules/purchasing/purchasing.service.ts` | PO creation in transaction with atomic numbering |
| `apps/api/src/modules/pos/pos.service.ts` | Document numbering inside transaction |
| `apps/api/src/modules/sync/sync-enabled.guard.ts` | **NEW** — returns 503 when sync disabled |
| `apps/api/src/modules/sync/sync.controller.ts` | Guard applied |
| `apps/api/jest.config.js` | **NEW** — Jest configuration |
| `apps/api/test/*` | **NEW** — integration test suite (15 tests) |
| `apps/api/package.json` | Jest, supertest, test scripts |

### Desktop (Electron)

| File | Change |
|------|--------|
| `apps/desktop/electron/main.ts` | Dynamic API URL; no auto SQLite init |
| `apps/desktop/electron/preload.ts` | `setApiUrl()`, `checkConnectivity()` |
| `apps/desktop/electron/sync-service.ts` | `LAN_MVP_MODE` disables local DB/sync |
| `apps/desktop/src/App.tsx` | Auth bootstrap; syncs API URL to Electron |
| `apps/desktop/src/lib/api.ts` | Auto JWT refresh on 401 |
| `apps/desktop/src/lib/auth-session.ts` | **NEW** — token sync + refresh rotation |
| `apps/desktop/src/stores/index.ts` | `updateTokens()` for refresh rotation |
| `apps/desktop/src/components/ConnectionStatusBadge.tsx` | **NEW** — LAN connectivity badge |
| `apps/desktop/src/components/AppLayout.tsx` | Connection badge; auto-sync removed |
| `apps/desktop/src/pages/SettingsPage.tsx` | Server URL config + connection test |
| `packages/localization/src/locales/en.ts` | Connection status strings |
| `packages/localization/src/locales/ar.ts` | Connection status strings (Arabic) |

### Shared / Config / Database

| File | Change |
|------|--------|
| `packages/config/src/index.ts` | `validateAppConfig()`, `syncEnabled` flag |
| `packages/database/prisma/seed.ts` | Number sequence initialization aligned with seed data |
| `.env.example` | `SYNC_ENABLED=false`, `LAN_MVP_MODE=true` |

### Documentation

| File | Change |
|------|--------|
| `docs/ARCHITECTURE_AUDIT.md` | Full repository audit |
| `docs/LEGACY_ERP.md` | Frozen ERP module policy |
| `docs/PHASE_0_COMPLETE.md` | This document |

---

## 2. Problems Fixed

| Problem | Root Cause | Fix |
|---------|-----------|-----|
| Expired JWT caused "Request failed" everywhere | 15-min access token, no refresh | Auto refresh in `api.ts` + rotated refresh tokens |
| Infinite loading spinner after login | Broken auth hydration | `AuthHydrationGate` with persist hydration callback |
| DevTools opened on every launch | Hardcoded `openDevTools` | Only when `ELECTRON_OPEN_DEVTOOLS=1` |
| Accounting trial balance crash | API returns object, not array | Fixed response parsing |
| Red sync error on startup | Sync ran before token available | Token sync to Electron; sync disabled for LAN MVP |
| Document number duplicates under concurrency | Read-modify-write race | Atomic `INSERT … ON CONFLICT DO UPDATE` |
| Document numbers colliding with seed data | Seed invoice without sequence row | Seed + test setup initialize `number_sequences` |
| Stock balance races | Non-atomic read/update | Atomic upsert on `stock_balances` |
| Inventory concurrent adjustment failures | Serializable isolation + upsert conflict | Default Read Committed with atomic SQL |
| JWT usable after logout | No session check on access token | `assertSessionActive()` in JWT strategy |
| Stale refresh tokens reusable | No rotation | Refresh token rotated on each refresh |
| Weak JWT secret in prod/test | Hardcoded fallback accepted | `validateAppConfig()` rejects short/missing secrets |
| Offline sync inappropriate for LAN MVP | SQLite sync engine always active | `SYNC_ENABLED=false`, `LAN_MVP_MODE=true` |
| No automated tests | Zero test coverage | 15 integration tests against live PostgreSQL |

---

## 3. Architecture Changes

```
┌─────────────────┐     LAN HTTP      ┌─────────────────┐
│ Electron Client │ ────────────────► │   NestJS API    │
│  (React + Vite) │ ◄──────────────── │   (Port 3000)   │
│  Thin client    │                   └────────┬────────┘
│  No primary DB  │                            │
└─────────────────┘                            ▼
                                      ┌─────────────────┐
                                      │   PostgreSQL    │
                                      │  (central DB)   │
                                      └─────────────────┘
```

**MVP rules enforced:**
- All clients talk to one central PostgreSQL server over LAN
- No client-side SQLite as operational database
- No offline sync engine for normal operation (`SYNC_ENABLED=false`)
- ERP modules frozen — not deleted, not expanded (see `LEGACY_ERP.md`)
- No PMS domain yet — **do not rename Customer→Patient**

**Environment flags:**

| Variable | Default (MVP) | Purpose |
|----------|---------------|---------|
| `SYNC_ENABLED` | `false` | Re-enable legacy sync API (503 when false) |
| `LAN_MVP_MODE` | `true` (Electron) | Disable client SQLite/sync engine |
| `JWT_SECRET` | Required in test/prod | Min 32 characters |

---

## 4. Database Changes

- **No new migrations** in Phase 0
- **Seed update:** `number_sequences` rows initialized for `INV`, `PO`, `RCP`, `JE` aligned with seeded documents (`INV-2026-000001`, `PO-2026-000001`)
- **Raw SQL fixes:** Column names corrected to Prisma camelCase (`"tenantId"`, `"nextNumber"`, etc.)
- **Existing migrations verified:** `20250906200000_init`, `20250907000000_erp_models`

---

## 5. Security Improvements

1. **JWT secret validation** — production/test refuse weak or missing secrets
2. **Session-bound access tokens** — every authenticated request validates session is active and not revoked/expired
3. **Refresh token rotation** — old refresh token invalidated after use
4. **Logout revocation** — revoked sessions reject subsequent API calls
5. **Global exception filter** — stack traces logged server-side only, not sent to clients
6. **Sync API gated** — returns 503 when sync disabled, preventing accidental offline sync usage

---

## 6. Concurrency Improvements

1. **Document numbering** — atomic PostgreSQL upsert (`number_sequences`)
2. **Invoice creation** — numbering + insert in single `$transaction`
3. **Payment recording** — numbering moved inside transaction (fixed in this session)
4. **PO / POS creation** — numbering inside transactions
5. **Inventory ledger** — atomic `stock_balances` upsert with `ON CONFLICT DO UPDATE`
6. **Journal entries** — numbering participates in caller's transaction

---

## 7. Tests Added

| File | Tests | Coverage |
|------|-------|----------|
| `test/auth.integration.spec.ts` | 5 | Login, 401 without token, logout revocation, refresh rotation, sync disabled |
| `test/concurrency.integration.spec.ts` | 3 | Concurrent invoice numbers, concurrent stock adjustments, dual authenticated clients |
| `test/resilience.integration.spec.ts` | 7 | Invalid/expired refresh, malformed JWT, stock rollback, invoice post rollback, concurrent customer updates, concurrent payments, FK violation rollback |

**Run command:**
```powershell
npm test -w @fratelanza/api
```

**Requirements:** PostgreSQL running with `.env` `DATABASE_URL` set; seeded database recommended.

---

## 8. Test Results

```
Test Suites: 3 passed, 3 total
Tests:       15 passed, 15 total
Time:        ~39s
```

All tests run against **live PostgreSQL** — no mocks for auth, concurrency, or database operations.

### Scenario coverage matrix

| Required Scenario | Covered By | Status |
|-------------------|-----------|--------|
| Two users creating transactions simultaneously | `concurrency.integration.spec.ts` — 8 concurrent invoices | ✅ |
| Two users modifying same entity | `resilience.integration.spec.ts` — concurrent customer PATCH | ✅ |
| Two users recording payments | `resilience.integration.spec.ts` — 6 concurrent payments | ✅ |
| Session expiration | `resilience.integration.spec.ts` — expired refresh token | ✅ |
| Logout/revocation | `auth.integration.spec.ts` | ✅ |
| Invalid/expired refresh tokens | `auth.integration.spec.ts` + `resilience.integration.spec.ts` | ✅ |
| Server unavailable | Manual — Electron `ConnectionStatusBadge` + Settings test | ⚠️ Manual |
| Database unavailable | Manual — API startup / connection errors | ⚠️ Manual |
| Network interruption | Manual — Electron connectivity check | ⚠️ Manual |
| Duplicate requests | Concurrent invoice/payment tests (unique constraints) | ✅ |
| Transaction rollback after failure | `resilience.integration.spec.ts` — stock + FK tests | ✅ |
| Two authenticated LAN clients | `concurrency.integration.spec.ts` | ✅ |
| Sync disabled | `auth.integration.spec.ts` — 503 on `/sync/status` | ✅ |

---

## 9. Remaining Risks

| Risk | Severity | Mitigation Plan |
|------|----------|-----------------|
| Manual LAN/network failure tests not automated | Medium | Manual QA checklist before clinic deployment; optional Playwright/Electron E2E in Phase 1 |
| ERP modules still reachable in UI | Low | Frozen per `LEGACY_ERP.md`; hide/relabel in Phase 1 shell |
| JWT secret in dev `.env` is placeholder | Low | `validateAppConfig` enforces strong secret in production/test |
| No rate limiting on auth endpoints | Medium | Phase 1 hardening |
| Payment/invoice idempotency keys not implemented | Medium | Phase 1 PMS financial module |
| PostgreSQL single point of failure | Accepted | LAN MVP scope — backup strategy in deployment guide |
| Re-seed needed for existing DBs to get sequence fix | Low | Test helper `ensureDocumentSequences()` auto-fixes; re-run seed recommended |

---

## 10. Phase 1 Readiness Confirmation

**The application is ready for Phase 1 PMS domain implementation.**

Checklist:

- [x] LAN thin-client architecture enforced (no offline sync for MVP)
- [x] ERP modules frozen, not deleted, not renamed
- [x] Auth/session security hardened
- [x] Concurrency protection for numbers, stock, and financial writes
- [x] Centralized error handling
- [x] Electron → LAN API configuration working
- [x] Integration tests passing against live PostgreSQL
- [x] Multi-user concurrent operations verified
- [ ] Phase 1 NOT started — no Patient UI, no PMS domain models yet

### Recommended Phase 1 first steps

1. Add Prisma models: `Patient`, `PatientProfile`, `Service`, `PatientAccount`, `Charge`, `Payment`, `Discount`, `Refund`, `Adjustment`
2. New NestJS modules under `apps/api/src/modules/pms/` (not renamed ERP entities)
3. New React pages under `apps/desktop/src/pages/pms/`
4. Hide or gate legacy ERP navigation items

### Local development commands

```powershell
# Terminal 1 — API
npm run dev:api

# Terminal 2 — Desktop
npm run dev:desktop

# Run tests
npm test -w @fratelanza/api

# Re-seed (optional, aligns number sequences)
npm run db:seed
```

**Default login:** `admin@fratelanza.local` / `Admin@123456`
