# PHASE 10.0 — DEPLOYMENT ARCHITECTURE AUDIT

**Date:** 2026-09-08  
**Repository baseline:** `origin/main` after Phase 9.10, Phase 11 UI/UX  
**Known-good:** 478/478 API integration tests, typecheck passing  

---

## Executive Summary

Fratelanza Grand ERP is a **monorepo LAN-first business platform**:

| Layer | Technology | Role |
|-------|------------|------|
| Customer server | NestJS 11 + PostgreSQL 16 + Prisma | Authoritative business data, licensing enforcement, RBAC, audit |
| Customer desktop | Electron 34 + React 19 + Vite | Thin client over LAN HTTP API |
| Fratelanza authority | `mg.fratelanza.com` (deferred) | License issuance, optional activation/update — **not required for daily ERP** |

Commercial model: **perpetual / one-time license**, Ed25519 signed payloads, local verification.

Phase 10.0 closes the gap between a mature development codebase and **reproducible customer-server deployment**.

---

## 1. Deployment Topology

### 1.1 Development (engineer workstation)

```
Developer PC
├── npm workspaces monorepo
├── .env (dev secrets, optional unsigned license bypass)
├── docker compose → PostgreSQL only (infra/docker/docker-compose.yml)
├── npm run dev:api → NestJS :3000
└── npm run dev:desktop → Vite :5173 + Electron
```

**Assumptions:** seed data, demo admin, test Ed25519 keys in Jest, `LICENSE_ALLOW_UNSIGNED_DEV` optional.

### 1.2 Customer-server production (on-prem / LAN)

```
Customer Server PC
├── PostgreSQL 16 (customer-owned data)
├── Fratelanza API (Node.js service, :3000 on LAN)
│   ├── LICENSE_VERIFICATION_PUBLIC_KEY only
│   ├── Strong JWT_SECRET
│   ├── FRATELANZA_INSTALLATION_ID
│   └── No LICENSE_SIGNING_PRIVATE_KEY
├── Activated TenantLicense (Ed25519 signed)
└── Backup scripts (pg_dump)

Customer Client PCs (LAN)
└── Fratelanza Desktop (compiled installer)
    └── Configured API URL → customer server IP:3000
```

**Authoritative for:** tenants, users, transactions, inventory, finance, construction, audit, license enforcement.

**Internet required only for:** initial activation handshake (optional), license renewal/replacement, optional updates, optional support.

### 1.3 Fratelanza management / licensing authority

```
mg.fratelanza.com (Phase 10.0: contract documented, not built)
├── Ed25519 PRIVATE signing key (never leaves Fratelanza)
├── Customer license issuance
├── Optional online activation API
└── Optional update catalog
```

Customer installations verify licenses **locally** with the shipped public key.

---

## 2. Backend Architecture

**Entry:** `apps/api/src/main.ts`  
**Module root:** `apps/api/src/app.module.ts`  
**API prefix:** `/api/v1`

### Global guard chain

1. `ThrottlerGuard` — 100 req/min
2. `JwtAuthGuard` — all routes unless `@Public()`
3. `EntitlementGuard` — license/module/feature (global via LicenseModule)
4. `PermissionsGuard` — per-controller RBAC

### Security middleware

- Helmet
- CORS from `CORS_ORIGINS`
- Global `ValidationPipe` (whitelist, forbidNonWhitelisted)
- `GlobalExceptionFilter` — no stack traces to client in normal flow

### Domain modules

| Category | Modules |
|----------|---------|
| Platform | auth, tenants, branches, users, roles, devices, settings, audit, health, license |
| Legacy ERP | products, customers, suppliers, warehouses, inventory, sales, purchasing, accounting, pos, sync, dashboard |
| Universal | finance, parties, projects, pms, construction |

Legacy modules remain functional; universal finance migration controlled by pilot flags.

---

## 3. Desktop Architecture

**Build:** Vite 6 + `vite-plugin-electron`  
**Output:** `dist/` (renderer), `dist-electron/` (main/preload)

### Thin-client model

- Business data on PostgreSQL via API
- Desktop stores: auth tokens, locale, theme, API URL, device fingerprint
- SQLite local DB exists for legacy sync experiments (`SYNC_ENABLED=false` by default)
- Connectivity check: `GET /api/v1/health`

### Production gaps (addressed in Phase 10.0)

- No installer → electron-builder foundation added
- Hardcoded localhost defaults → documented configuration strategy
- CSP allows localhost only → production LAN CSP guidance

---

## 4. PostgreSQL & Migrations

**Schema:** `packages/database/prisma/schema.server.prisma`  
**Migrations:** 18 sequential migrations under `packages/database/prisma/migrations/`  
**Production apply:** `npm run db:migrate:server:deploy`  
**Seed:** `packages/database/prisma/seed.ts` — **development/demo only**; production uses admin bootstrap + license activation

### Seed risks for production

- Creates `admin@fratelanza.local` / `Admin@123456`
- Creates unsigned or test-signed demo license
- Must NOT be run on customer production without post-seed hardening

---

## 5. Environment Configuration

**Template:** `.env.example` (root monorepo)

| Variable | Dev | Production customer server |
|----------|-----|---------------------------|
| `NODE_ENV` | development | production |
| `DATABASE_URL` | local postgres | customer postgres |
| `JWT_SECRET` | dev fallback allowed | **required ≥32 chars** |
| `LICENSE_VERIFICATION_PUBLIC_KEY` | optional in dev | **required** |
| `LICENSE_SIGNING_PRIVATE_KEY` | test/dev issuance | **must NOT be set** |
| `LICENSE_ALLOW_UNSIGNED_DEV` | optional true in dev | **must be false** |
| `FRATELANZA_INSTALLATION_ID` | optional | **required** (Phase 10.0) |
| `CORS_ORIGINS` | localhost:5173 | LAN desktop origins |
| `SYNC_ENABLED` | false | false (LAN MVP) |

**Validation:** `packages/config/src/index.ts` → `validateAppConfig()` — hardened in Phase 10.0 for production rules.

---

## 6. Licensing Implementation

### Data model

- `TenantLicense` — one per tenant, includes `installationId`, `payloadDigest`, `payloadSignature`
- `LicenseModuleEntitlement`, `LicenseFeatureEntitlement`
- `tenant_modules` — compatibility sync only (not source of truth)

### Cryptography

- Ed25519 sign (Fratelanza authority) / verify (customer server)
- Canonical JSON document + SHA-256 digest
- Files: `apps/api/src/modules/license/verification/*`

### Enforcement

- `EntitlementGuard` → `EntitlementService` → `LicenseService.requireOperationalLicense` → `assertLicenseIntegrity`
- `@LicenseExempt()` on core admin routes (auth, users, license, settings, audit)
- RBAC separate via `@RequirePermissions` — license does not bypass RBAC

### Activation flow (production)

1. Customer receives signed license payload from Fratelanza
2. Admin calls `POST /api/v1/license/activate` with signed payload
3. Server verifies Ed25519 signature locally
4. Tenant binding validated
5. Installation binding validated against `FRATELANZA_INSTALLATION_ID` when configured
6. Entitlements persisted; normal LAN operation continues offline

### Deferred

- Online handshake with `mg.fratelanza.com` — contract documented, not implemented
- Runtime `installationId` enforcement against desktop deviceId — server installation ID only in Phase 10.0

---

## 7. RBAC & Tenant Isolation

- Permissions: global catalog, `module:feature:action` keys
- JWT carries `tenantId`, `permissions[]`
- Services scope queries by `tenantId` (application-level isolation)
- Login by email (single-tenant-per-deployment LAN model)

### Audit

- `AuditLog` model + selective writes (parties, construction, license, projects, purchasing)
- Read: `GET /api/v1/audit-logs` with `core:audit:read`
- Not universal on all mutations (known limitation)

---

## 8. Build Process

| Command | Output |
|---------|--------|
| `npm run build:api` | `apps/api/dist/` |
| `npm run build:desktop` | `apps/desktop/dist/` + `dist-electron/` |
| `npm run db:migrate:server:deploy` | Apply migrations |
| `npm test -w @fratelanza/api` | Jest integration suite |

No API Docker image in baseline; PostgreSQL-only docker compose for dev.

---

## 9. Health & Diagnostics (baseline → Phase 10.0)

**Before Phase 10.0:**

- `GET /api/v1/health` — public, DB ping, hardcoded version `0.1.0`

**Phase 10.0 additions:**

- `GET /api/v1/system/version` — unified version
- `GET /api/v1/system/diagnostics` — authenticated support report (no secrets)

---

## 10. Development-Only Assumptions (must not reach production)

| Risk | Mitigation in Phase 10.0 |
|------|--------------------------|
| Dev JWT fallback | Production validation rejects |
| Unsigned seed license | Production requires signed activation |
| Test signing key in `.env` on customer server | Production rejects private key presence |
| Demo admin credentials from seed | Installation doc: change password / skip seed |
| `localhost:3000` desktop default | Desktop distribution doc: configure LAN URL |
| Hardcoded health version | Unified version from config/package |
| Verbose internal errors | GlobalExceptionFilter unchanged; no stack to client |

---

## 11. Construction & Module Licensing

- Construction module: `construction` module key + feature keys (`construction.contracts`, `construction.boq`, `construction.progress`, etc.)
- Stock side effects from Sales/Purchasing/POS do not require standalone Inventory license (verified by existing integration tests)
- Construction entitlements isolated from other modules

---

## 12. Phase 10.0 Scope Matrix

| Item | Audit status | Phase 10.0 action |
|------|--------------|-------------------|
| Production env validation | Gap | Implement |
| License activation boundary | Partial | Harden installation binding |
| Customer installation docs | Missing | Create |
| Desktop installer | Missing | electron-builder foundation |
| Unified versioning | Gap | Implement |
| Backup/restore | Missing | Scripts + docs + test |
| Diagnostics | Minimal | Extend |
| Security review | Partial | Document + tests |
| Update strategy | Missing | Document |
| Commercial QA | Partial | Extend tests |
| mg.fratelanza.com integration | N/A | Document contract only |

---

## 13. File Index

```
apps/api/src/main.ts
apps/api/src/app.module.ts
apps/api/src/config/app-config.ts
apps/api/src/modules/health/
apps/api/src/modules/license/
apps/api/src/modules/system/          (Phase 10.0)
apps/desktop/electron/main.ts
apps/desktop/vite.config.ts
packages/config/src/index.ts
packages/database/prisma/schema.server.prisma
packages/database/prisma/seed.ts
.env.example
infra/docker/docker-compose.yml
scripts/                              (Phase 10.0)
```

---

## 14. Verdict (pre-implementation)

**NOT READY FOR COMMERCIAL DEPLOYMENT** — gaps documented above. Phase 10.0 implementation targets the minimum foundation to reach readiness.

Final verdict recorded in `docs/PHASE_10_0_COMPLETE.md` after implementation and verification.
