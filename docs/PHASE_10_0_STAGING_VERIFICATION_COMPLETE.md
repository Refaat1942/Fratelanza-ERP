# PHASE 10.0 — STAGING VERIFICATION COMPLETE

**Date:** 2026-09-08  
**Repository HEAD (start):** `8397cb27b4bf52d09b1bb7ff943057ba225593ef`  
**Purpose:** Final staging verification before first real customer installation  
**Scope:** Verification / QA only — no Phase 11 feature work

---

## Final Verdict

## NOT READY — BLOCKERS REMAIN

First customer deployment cannot be approved until restore, offline LAN operations, fresh installer smoke test, and desktop LAN client validation are completed on a production-like staging environment with PostgreSQL superuser access and elevated network controls.

---

## Environment

| Item | Value |
|------|-------|
| OS | Windows 10.0.26200 |
| Node.js | v24.18.0 |
| npm | 11.10.1 |
| PostgreSQL | 18.4 (`C:\Program Files\PostgreSQL\18\`) |
| API version | 0.1.0 |
| Desktop version | 0.1.0 |
| LAN server IP (Wi‑Fi) | `192.168.10.158` |
| Source database | `fratelanza_erp` |
| Restore database (planned) | `fratelanza_erp_restore` (not created) |
| DB application user | `fratelanza` (`rolcreatedb=false`, `rolsuper=false`) |
| Backup artifact (latest) | `staging-backups/fratelanza_erp_20260908-120747.sql` (62,468,581 bytes) |
| Installer artifact | `apps/desktop/release/Fratelanza-ERP-0.1.0-Setup.exe` (unsigned) |

---

## Acceptance Table

| Test | Result | Evidence |
|------|--------|----------|
| Backup | **PASS** | `npx dotenv -e .env -- powershell -File scripts/backup-database.ps1 -OutputDir staging-backups` → exit 0; artifact `fratelanza_erp_20260908-120747.sql` (62,468,581 bytes) |
| Restore | **FAIL** | `npx dotenv -e .env -- npx tsx scripts/staging-restore-verify.ts` → `createdb: permission denied to create database` — `fratelanza` role lacks `CREATEDB`; `postgres` superuser password not available non-interactively |
| API on restored DB | **FAIL** | Blocked by restore failure — API not started against restored database |
| LAN client (API over LAN IP) | **PARTIAL PASS** | After staging license re-sign + `LICENSE_VERIFICATION_PUBLIC_KEY` loaded: health/login/dashboard/parties/sales/finance/audit/diagnostics 200 via `http://192.168.10.158:3000/api/v1`. Construction 403 (expected — module not in demo license). **Electron desktop client over LAN not tested.** |
| Internet disconnected | **FAIL** | Default-route removal requires elevated privileges (`Access is denied`). Offline business continuity **not demonstrated**. |
| Installer build | **PASS** | `npm run pack` in `apps/desktop` → `Fratelanza-ERP-0.1.0-Setup.exe`; signing skipped (`no signing info identified`). **Production code signing pending.** |
| Fresh install | **FAIL** | Installer generated but not installed on clean VM/machine; first-boot + server URL configuration not executed |
| License regression | **PASS** | `licensing.integration`, `license-hardening`, `commercial-deployment`, `production-config` → **51/51 PASS**; full suite **489/489 PASS** after QA fix |
| Security sanity | **PARTIAL → fixed** | Initial scan: demo password `Admin@123456` bundled in desktop `LoginPage` defaults. **Fixed:** empty login defaults. No `mg.fratelanza.com` runtime references in API source. No JWT/private key files in `release/` tree. Installer unsigned (expected for staging). |

---

## Test 1 — Backup / Restore

### Backup (PASS)

**Command:**

```powershell
cd "D:\Refaat\My Projects\Fratelanza Grand ERP"
npx dotenv -e .env -- powershell -File scripts/backup-database.ps1 -OutputDir staging-backups
```

**Result:**

- Exit code: 0
- Output: `Backup created: staging-backups\fratelanza_erp_20260908-120747.sql`
- Size: 62,468,581 bytes (~59.6 MB)
- Timestamp: 2026-09-08 12:07:48 local

### Source database — representative data (PASS)

Counts from `fratelanza_erp` at verification time:

| Entity | Count |
|--------|------:|
| tenants | 3,952 |
| users | 1,328 |
| parties | 7,786 |
| products | 943 |
| stock balances | 810 |
| sales invoices | 2,631 |
| purchase orders | 1,028 |
| journal entries | 3,257 |
| projects | 4,483 |
| construction contracts | 5,284 |
| licenses | 118 |
| audit logs | 91,808 |

### Restore (FAIL — environment blocker)

**Command:**

```powershell
npx dotenv -e .env -- npx tsx scripts/staging-restore-verify.ts
```

**Failure:**

```
createdb: error: database creation failed: ERROR:  permission denied to create database
```

**Root cause:** PostgreSQL role `fratelanza` has `rolcreatedb=false`. Restore procedure in `docs/PHASE_10_0_BACKUP_RESTORE.md` requires `postgres` superuser to create `fratelanza_erp_restore`. Superuser password was not available for non-interactive staging.

**Required to complete:** Run restore as `postgres` (or grant `CREATEDB` to `fratelanza`), load backup into clean database, compare counts, start API against restored DB, smoke-test login/parties/sales/finance.

---

## Test 2 — LAN Installation

### Server

**Start command:**

```powershell
cd apps\api
npx dotenv -e ../../.env -e ../../.env.staging-license -- node dist/main.js
```

API bound to `0.0.0.0:3000`.

### Initial LAN failure (configuration gap)

Licensed module routes returned 403 with:

`LICENSE_VERIFICATION_PUBLIC_KEY is not configured`

Diagnostics still reported license `isOperational: true` (DB status only — signature verification runs on protected routes).

**Staging remediation:** Re-signed FRATELANZA tenant license with staging Ed25519 pair; loaded public key via `.env.staging-license` (not committed).

### LAN API verification (after license key configured)

**Command:** `npx tsx scripts/staging-lan-verify.ts 192.168.10.158`

| Endpoint | HTTP | Result |
|----------|-----:|--------|
| `/health` | 200 | PASS |
| `/system/version` | 200 | PASS |
| `/auth/login` | 200 | PASS |
| `/dashboard/stats` | 200 | PASS |
| `/parties` | 200 | PASS |
| `/sales/invoices` | 200 | PASS |
| `/accounting/trial-balance` | 200 | PASS |
| `/construction/contracts` | 403 | Expected (construction not in demo license) |
| `/audit-logs` | 200 | PASS |
| `/system/diagnostics` | 200 | PASS |
| `/license/entitlements` | 200 | PASS |

**Limitations:**

- Same physical machine used as server and client; requests used LAN IP `192.168.10.158` (not `localhost`) — valid for API reachability, **not** a separate client PC.
- Packaged Electron desktop app was **not** exercised over LAN.
- Customer server **must** ship with `LICENSE_VERIFICATION_PUBLIC_KEY` configured before licensed modules work — documented in `.env.example` and Customer Installation guide.

---

## Test 3 — Internet Disconnected

**Status:** NOT EXECUTED

Attempted default-route removal for outbound internet block:

```
Remove-NetRoute ... Access is denied
```

Elevated (Administrator) shell required. LAN API smoke script prepared (`scripts/staging-offline-verify.ts`) but not run under true offline conditions.

**Static check:** No `mg.fratelanza.com` references in `apps/api/src` runtime code (docs only).

---

## Test 4 — Installer Build

**Commands:**

```powershell
cd apps\desktop
npm install
npm run pack
```

**Result:** PASS (unsigned)

- Artifact: `apps/desktop/release/Fratelanza-ERP-0.1.0-Setup.exe`
- `app.asar` present in `win-unpacked/resources/`
- electron-builder: `no signing info identified, signing is skipped`
- QA fix applied: `electron` pinned to `34.0.0` / `electronVersion: 34.0.0` (resolves electron-builder failure with semver range)

**Report:** Unsigned staging installer generated successfully; **production code signing remains pending.**

---

## Test 5 — Fresh Install / First Boot

**Status:** FAIL — not executed

Installer exists but was not run on a clean staging VM. Cannot verify absence of dev paths, localhost defaults, or test license keys in a real first-boot flow.

---

## Test 6 — License Commercial Regression

**Command:**

```powershell
cd apps\api
npx jest --testPathPattern="licensing.integration|license-hardening|commercial-deployment|production-config" --runInBand
```

**Result:** 51/51 PASS

Full suite after QA fix: **489/489 PASS**

Covers: perpetual/time-limited licenses, invalid signature, tampered payload, installation binding, unlicensed module block, licensed module allow, RBAC vs license separation.

---

## Test 7 — Security / Production Sanity

| Check | Result |
|-------|--------|
| JWT secret in installer | Not found in scanned release text patterns |
| Ed25519 private key in installer | Not found |
| Database passwords in installer | Not found |
| Demo credentials in desktop bundle | **Found then fixed** — `LoginPage.tsx` defaulted to demo email/password; removed |
| `mg.fratelanza.com` runtime calls | None in API source |
| Debug routes / source maps with secrets | Not exhaustively scanned; no `.env` files packaged |
| Code signing | Skipped (staging) |

---

## Test 8 — Automated Builds (post-fix)

| Check | Result |
|-------|--------|
| Typecheck (monorepo) | PASS |
| API build (`nest build`) | PASS |
| Desktop build (`vite` + electron tsc) | PASS |
| Full API Jest | **489/489 PASS** |

---

## QA Fixes Applied During Staging

| Fix | Reason |
|-----|--------|
| Remove demo login defaults from `LoginPage.tsx` | Demo password shipped in production installer |
| Pin `electron@34.0.0` in desktop packaging | `npm run pack` failed with `^34.0.0` semver in electron-builder |

---

## Remaining Production-Only Requirements

1. **PostgreSQL restore drill** with superuser — mandatory before go-live
2. **True offline test** — block server internet (firewall or route), verify LAN ERP + local license validation
3. **Separate client PC** — packaged Electron over LAN IP, not API-only curl/fetch
4. **Fresh install smoke test** on clean VM from NSIS installer
5. **Production code signing** for desktop installer trust
6. **Customer `.env` hardening** — `LICENSE_VERIFICATION_PUBLIC_KEY`, strong `JWT_SECRET`, `FRATELANZA_INSTALLATION_ID` in production
7. **mg.fratelanza.com** online activation — deferred (not blocking daily LAN ERP)

---

## Commercial Readiness Verdict

The platform **foundation is strong** (489 tests green, backup script works, unsigned installer builds, LAN API operational with correct license configuration, licensing regression passes).

**First customer installation is NOT approved** because:

- Restore was **not** performed into an isolated database
- API was **not** validated against a restored database
- Internet-disconnected daily operations were **not** demonstrated
- Fresh installer first-boot was **not** executed
- Desktop Electron client over LAN was **not** validated on a separate machine

---

## NOT READY — BLOCKERS REMAIN
