# Architecture Audit — Fratelanza Grand ERP → Patient Management & Accounting System

**Audit date:** 2026-09-07  
**Auditor role:** Lead software architect / senior full-stack engineer  
**Scope:** Full repository review before any major feature work or product pivot  
**Status:** Review complete — **no major destructive changes recommended until stakeholders approve this plan**

---

## Executive Summary

This repository is **not an empty greenfield project** (contrary to `docs/ARCHITECTURE.md`). It is a **functional early-stage ERP monorepo** with a NestJS API, PostgreSQL database, Electron + React desktop client, JWT/RBAC auth, partial offline sync, and ~14 desktop modules wired to the API.

The stated new product vision is a **commercial Patient Management & Accounting System** for clinics, deployed on **Windows + Local Area Network (LAN)** with **one central server + PostgreSQL** and **multiple client PCs** — **without requiring Internet** for daily operation.

### Key conclusions

| Question | Decision |
|----------|----------|
| Migrate backend to NestJS? | **No migration needed — backend is already NestJS 11.** Keep and restructure; do not rewrite in Express or another framework. |
| Is current architecture production-ready? | **No.** Suitable as a foundation, not as a commercial clinic product today. |
| Biggest misalignment with new vision | **Offline-first per-client SQLite conflicts with “single centralized database on LAN server.”** |
| Biggest technical risks | Financial concurrency, session/JWT lifecycle, sync/API URL mismatch, zero automated tests |
| Recommended approach | **Evolve the platform layer; replace ERP domain with PMS domain; simplify LAN client model**

---

## 1. Current Architecture

### 1.1 High-level diagram (as built today)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CLIENT PC (Electron + React + Vite)                                    │
│  ┌─────────────────────┐    ┌──────────────────────────────────────┐  │
│  │ Renderer (React 19) │    │ Main process                         │  │
│  │ • Zustand (persist) │◄──►│ • SQLite (local cache + sync queue)  │  │
│  │ • react-router      │ IPC│ • Sync push/pull (fetch to API)      │  │
│  │ • i18next (AR/EN)   │    │ • Offline mutations (partial)        │  │
│  └──────────┬──────────┘    └──────────────────┬───────────────────┘  │
└─────────────┼───────────────────────────────────┼─────────────────────┘
              │ HTTP `/api/v1`                     │ HTTP (hardcoded URL risk)
              ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SERVER PC — NestJS 11 API (Express)                                    │
│  • Global JWT guard + per-route PermissionsGuard                        │
│  • 22 feature modules (auth, users, roles, ERP entities, sync, …)      │
│  • Shared services: document numbers, inventory ledger, accounting     │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ Prisma ORM
                               ▼
                    PostgreSQL 16 (central, Docker dev setup)
```

### 1.2 Monorepo layout

| Path | Purpose |
|------|---------|
| `apps/api/` | NestJS REST API (`/api/v1`) |
| `apps/desktop/` | Electron 34 + React 19 + Vite 6 desktop app |
| `packages/database/` | Dual Prisma schemas (PostgreSQL server + SQLite local) |
| `packages/domain/` | Module registry / shared definitions (minimal today) |
| `packages/localization/` | i18n (English + Arabic, RTL) |
| `packages/types/`, `packages/shared/`, `packages/config/` | Shared types, utilities, config |
| `modules/core/` | Core platform module definition |
| `infra/docker/` | Dev PostgreSQL only |
| `docs/` | Architecture + roadmap (partially outdated) |

### 1.3 Technology stack

| Layer | Technology | Version / notes |
|-------|------------|-----------------|
| **Frontend (renderer)** | React | 19 |
| **Desktop shell** | Electron | 34 (not Tauri) |
| **Build** | Vite + vite-plugin-electron | Dev proxy to API |
| **State** | Zustand + persist (localStorage) | Auth + app settings |
| **Routing** | react-router-dom | v7 |
| **i18n** | i18next + react-i18next | AR primary, EN ready |
| **Backend** | **NestJS** | 11 on Express |
| **ORM** | Prisma | Dual client generation |
| **Server DB** | PostgreSQL | 16 (production-grade ✓) |
| **Local DB** | SQLite | Per-client via Electron |
| **Auth** | JWT access + opaque refresh in `Session` table | bcrypt passwords |
| **Authorization** | RBAC | `module:feature:action` permission keys |
| **Validation** | class-validator + global ValidationPipe | Whitelist enabled |
| **Testing** | Jest referenced | **Not configured — 0 tests** |
| **Deployment** | Manual / dev scripts | No production installer, no API container |

### 1.4 Backend modules (existing)

**Platform:** Auth, Tenants, Branches, Users, Roles, Devices, Settings, Health, Audit  
**ERP domain:** Products, Categories, Units, Customers, Suppliers, Warehouses, Inventory, Sales, Purchasing, Accounting, POS, Dashboard  
**Infrastructure:** Sync (push/pull/queue/conflicts), Database module, Common services

### 1.5 Database (existing models — summary)

**Platform tables:** Tenant, Branch, Warehouse, User, Role, Permission, Session, Device, AuditLog, NumberSequence, TenantModule, …

**ERP tables:** Product, Customer, Supplier, StockBalance, InventoryMovement, SalesInvoice, PurchaseOrder, Account, JournalEntry, PosSale, …

**Sync tables:** SyncQueue, SyncLog, SyncConflict, SyncCursor

**Local SQLite:** Subset of platform + ERP cache fields with `syncStatus`, `deviceId`; **no** sales/accounting/POS tables locally.

### 1.6 Authentication & authorization (existing)

- Login → JWT access token (~15 min) + refresh token (7 days, DB session row)
- Global `JwtAuthGuard`; `@Public()` for login/health
- `@RequirePermissions(...)` on controllers via `PermissionsGuard`
- Permissions loaded from DB on each JWT validation
- Desktop stores tokens in **localStorage** (Zustand persist)
- Electron main process holds access token separately for sync IPC

### 1.7 Desktop UI (existing)

14 pages: Dashboard, Products, Customers, Suppliers, Warehouses, Inventory, Sales, Purchasing, Accounting, POS, Users, Branches, Settings, Login.

UI patterns: custom CSS variables (`global.css`), `DataTable`, `PageState`, modals, basic offline helpers. **No shared design system package.** Navigation does not hide items by permission.

### 1.8 Sync / offline (existing)

Partial implementation:

- Local writes queued in SQLite → push to server on sync
- Pull applies server changes to local cache
- Processor handles customer/supplier/product/POS create
- Auto-sync on reconnect; conflict logging + Settings UI for resolve

---

## 2. Existing Strengths

1. **Correct core stack for a commercial LAN product:** NestJS + PostgreSQL + typed Prisma + modular monolith.
2. **Multi-tenant platform foundation:** Tenants, branches, users, roles, permissions, sessions, devices — reusable for multi-clinic future.
3. **Security baseline present:** Helmet, CORS, throttling, DTO validation, bcrypt, RBAC guards, tenant scoping via JWT.
4. **Financial awareness started:** Double-entry journal engine, document numbering, transactional posting for sales/PO/payments (partial).
5. **Arabic/RTL investment:** Localization package, direction handling, Arabic nav labels.
6. **Electron hardening:** contextIsolation, no nodeIntegration, sandboxed preload.
7. **Monorepo discipline:** Shared packages, workspace scripts, typed API client pattern.
8. **Audit log table exists** (platform) — foundation for compliance requirements.
9. **API listens on `0.0.0.0`** — suitable for LAN server binding.

---

## 3. Existing Weaknesses

1. **Product/domain mismatch:** Built as general ERP (inventory, PO, POS, suppliers), not clinic PMS (patients, encounters, services, patient ledger).
2. **Documentation drift:** `docs/ARCHITECTURE.md` still describes “empty greenfield”; roadmap marks phases complete that are only partial.
3. **UI maturity:** Functional but prototype-level; inconsistent error handling; no toast system; no print layouts; no permission-aware navigation.
4. **Domain layer unused:** Business rules live in API services, not in `packages/domain` as originally planned.
5. **No `packages/ui`:** Design tokens in CSS only; no reusable component library.
6. **Testing absent:** Zero unit/integration/E2E tests despite financial logic.
7. **No backup/restore, no installer, no Windows service packaging for API/PostgreSQL.
8. **Reporting minimal:** Dashboard stats + trial balance only; no scalable report layer.
9. **Incomplete offline story:** Sync covers subset of entities; creates operational complexity without full offline parity.

---

## 4. Critical Problems

| # | Problem | Impact | Evidence |
|---|---------|--------|----------|
| C1 | **Deployment model conflict** | Target product uses **one central DB**; current design puts **SQLite on every client** as offline cache/queue | `apps/desktop/electron/local-db.ts`, `schema.local.prisma` |
| C2 | **Document number race** | Concurrent users can get duplicate/skipped invoice/POS numbers | `document-number.service.ts` — sequence update outside business `$transaction` |
| C3 | **Stock ledger race** | Lost updates under concurrent inventory operations | `inventory-ledger.service.ts` — read-modify-write without locking |
| C4 | **JWT not bound to live session** | Logged-out/revoked users retain API access until token expiry | `jwt.strategy.ts` — no `session.revokedAt` check |
| C5 | **Electron sync URL mismatch** | Renderer may use LAN server IP; sync IPC may still call `localhost:3000` | `electron/sync-service.ts` vs `stores/index.ts` `apiUrl` |
| C6 | **No automated tests on financial paths** | Payment/refund/balance bugs will reach production | No `*.spec.ts` files |
| C7 | **GlobalExceptionFilter not registered** | Inconsistent error responses; potential information leakage on 500s | `main.ts` lacks filter; filter exists in `common/filters/` |
| C8 | **Default JWT secret fallback** | Production misconfiguration → trivial token forgery | `auth.module.ts`, `packages/config` |

---

## 5. Technical Debt

| Item | Severity | Notes |
|------|----------|-------|
| Sync processor duplicates service logic | High | Drift from API validation rules |
| Monolithic `ApiClient` (300+ lines) | Medium | Hard to maintain as modules grow |
| `DataTable.tsx` mixes table + layout + hook exports | Medium | Blocks design system extraction |
| Hardcoded chart-of-account codes (`1000`, `4000`, …) | Medium | Breaks when COA customized |
| POS accounting assumes all-cash | High | Multi-method payments → unbalanced journals |
| Pull sync capped at 100 records/entity | Medium | Large clinics need pagination |
| Local schema maintained manually vs server | Medium | Migration drift risk |
| Seed/demo credentials in UI + README | Low (dev) / High (prod) | `LoginPage.tsx` pre-filled admin password |
| ERP-specific seed data | Medium | Must be replaced for PMS demo |

---

## 6. Security Concerns

| Concern | Severity | Recommendation |
|---------|----------|----------------|
| JWT secret default in code | Critical | Fail startup if `JWT_SECRET` missing in production |
| Session not validated per request | High | Check `Session.revokedAt` / expiry in JWT strategy |
| Refresh token not rotated | High | Rotate on refresh; invalidate old refresh token |
| Tokens in localStorage | Medium | Accept for Electron LAN MVP; plan secure storage later |
| Sync accepts arbitrary `deviceId` | Medium | Bind device to tenant + authenticated user |
| No TLS on LAN | Medium | Document reverse proxy / self-signed TLS option for clinic LAN |
| Permissions not enforced in UI | Low (UX) / Medium (info leak) | Hide/disable by permission; never rely on UI alone |
| `@Public()` health endpoint | Low | OK; ensure no sensitive data exposed |

**Positive:** Backend authorization is generally enforced on controllers; not only UI hiding.

---

## 7. Database Concerns

### 7.1 Strengths

- PostgreSQL as central store (correct for product vision)
- Prisma migrations for server schema (2 migrations applied)
- Foreign keys, tenant scoping, soft delete on several entities
- Journal double-entry validation before insert

### 7.2 Gaps for PMS + commercial use

| Gap | Required for target product |
|-----|----------------------------|
| No `Patient` / encounter / appointment models | Core domain missing |
| Customer balance as mutable field + transactions | Need **immutable patient ledger** (charges, payments, discounts, refunds) |
| No payment idempotency keys | Duplicate payment prevention |
| No row versioning / optimistic locking | Multi-PC concurrency |
| SQLite local schema divergence | Conflicts with centralized DB deployment |
| Audit log exists but underused | Must log all financial + PHI-adjacent changes |
| No backup metadata tables | Backup/restore feature missing |
| Trial balance returns object not array (fixed in UI recently) | API contract discipline needed |

### 7.3 Financial integrity requirements (target)

All patient financial operations must run in **one DB transaction**:

1. Validate request + permissions  
2. Validate patient + amounts  
3. Insert ledger transaction(s)  
4. Update derived balance (if used) or compute balance from ledger  
5. Write audit log  
6. Commit or full rollback  

**Current state:** Sales/PO posting uses `$transaction` in places, but document numbers and stock movements are not fully concurrency-safe.

---

## 8. Multi-User Concerns

| Area | Current behavior | Risk |
|------|------------------|------|
| Concurrent POS/sales | Sequence + stock races | Duplicate docs / wrong stock |
| Concurrent payments (same patient) | Balance update in transaction but no row lock on patient | Possible stale balance if architecture uses stored balance |
| Session management | Multiple PCs can share user login | Acceptable if intended; needs session list UI |
| Permission changes | Effective after token expiry only | Admin changes roles → delayed enforcement |
| Offline queue idempotency | Key `entityType:entityId:operation` drops subsequent updates | Lost offline edits |
| Open POS shift | Race on concurrent open | Duplicate shifts possible |

**Verdict:** Not safe for multiple reception + accounting stations on same patient data without fixes.

---

## 9. Local Network Concerns

### 9.1 Target deployment (from product vision)

```
                 CLINIC SERVER (Windows)
              PostgreSQL + NestJS API
                        │
                   LAN / Ethernet
          ┌─────────────┼─────────────┐
          │             │             │
     Reception PC   Doctor PC   Accounting PC
     (Electron)     (Electron)   (Electron)
```

- **No Internet required** for daily use  
- **Single database** on server  
- Clients are **thin** — API is source of truth  

### 9.2 Current implementation vs target

| Requirement | Current | Gap |
|-------------|---------|-----|
| Central PostgreSQL | ✓ Server uses PostgreSQL | Good |
| Clients talk to server API | ✓ Renderer uses HTTP | Good |
| No per-client authoritative DB | ✗ Each Electron has SQLite queue/cache | **Architectural mismatch** |
| Configurable server address on LAN | Partial (`apiUrl` in store) | Sync IPC URL not aligned |
| Server unavailable detection | Partial (connectivity badge) | Needs clearer blocking UX for financial actions |
| API as Windows service | Not implemented | Needed for clinic server PC |
| PostgreSQL install/bundle | Docker dev only | Production installer TBD |
| Offline operation | Partial sync engine | **Not required for MVP LAN** if server always on LAN |

### 9.3 Recommendation for LAN

**Phase out client SQLite as system of record.** For MVP LAN clinic deployment:

- Electron client → HTTP only → central API → PostgreSQL  
- Remove or drastically simplify offline queue (optional read-only cache later)  
- Keep sync architecture **optional** for future cloud/branch sync, not primary LAN mode  

---

## 10. Missing Architectural Layers

| Layer | Status | Needed for commercial PMS |
|-------|--------|----------------------------|
| Domain services (pure business logic) | Missing | Patient ledger rules, pricing, discounts |
| Application services (use cases) | Partial (in Nest services) | Explicit command handlers per use case |
| DTO / API layer | Present | Expand with pagination/filter DTOs |
| Infrastructure (Prisma repos) | Coupled in services | Optional repository interfaces for testability |
| Design system (`packages/ui`) | Missing | Buttons, tables, forms, dialogs, toasts |
| Report engine | Missing | Query layer + templates, not inline in pages |
| Print layer | Missing | Receipts, statements, reports |
| Backup service | Missing | pg_dump wrapper + metadata + restore |
| Centralized error/logging | Partial | Register exception filter + structured logs |
| Feature flags / clinic config | Minimal (`Settings`) | Payment methods, services, branding |
| Test pyramid | Missing | Unit + integration + API tests |

---

## 11. Architecture Decision — NestJS: Keep or Migrate?

### Question restated

The backend **already is NestJS 11**. The decision is:

> **A.** Keep NestJS and properly structure it for the PMS product  
> **B.** Migrate away from NestJS to another Node framework  

### Decision: **A — Keep NestJS. Do not migrate.**

### Rationale

| Criterion | Assessment |
|-----------|------------|
| Project complexity | High (patients, ledger, payments, reports, RBAC, audit, backup) — Nest modules scale well |
| Maintainability | DI, guards, pipes, modules already in use — rewriting to Express loses structure |
| Number of modules | 22+ API modules today; PMS will add more — Nest modular monolith fits |
| Business logic complexity | Financial ledger + concurrency + audit — needs disciplined service layer, not microservices |
| Security | Guards/decorators already implemented — migration risk with no benefit |
| Multi-user | Session + RBAC maps cleanly to Nest guards |
| Testing | Nest testing utilities (`@nestjs/testing`) ready once Jest configured |
| Migration risk | **High** if rewriting working API — **zero benefit** |
| Developer productivity | Team already invested in Nest patterns in this repo |

**Migrating to NestJS is not applicable** — that work is done. **Migrating away from NestJS would be harmful.**

If the backend had been a flat Express spaghetti codebase, NestJS migration might be justified. It is not the case here.

---

## 12. Recommended Target Architecture

### 12.1 Product positioning

Rename/evolve the codebase mentally from **“Fratelanza Grand ERP”** to a **Clinic Patient Management & Accounting Platform** while **reusing the platform shell**.

### 12.2 Target diagram (LAN-first)

```
┌─────────────────── CLIENT PCs (Electron thin client) ───────────────────┐
│  React UI + Design System + i18n (AR RTL / EN)                          │
│  • No business logic in components                                       │
│  • API client only (no local authoritative DB for MVP)                   │
│  • Connection monitor → clear “clinic server unavailable” states         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ HTTP REST `/api/v1` (LAN)
                                ▼
┌─────────────────── CLINIC SERVER (Windows) ───────────────────────────────┐
│  NestJS Modular Monolith                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐ ┌─────────────────┐ │
│  │ Patients    │ │ Services    │ │ Patient      │ │ Payments        │ │
│  │ Encounters  │ │ Catalog     │ │ Ledger       │ │ Refunds/Discount│ │
│  └─────────────┘ └─────────────┘ └──────────────┘ └─────────────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐ ┌─────────────────┐ │
│  │ Reports     │ │ Audit       │ │ Backup       │ │ Users/Roles     │ │
│  └─────────────┘ └─────────────┘ └──────────────┘ └─────────────────┘ │
│  Shared: Auth, Validation, Transactions, Permissions, Document numbers   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ Prisma
                                ▼
                         PostgreSQL (single source of truth)
```

**Optional future (not MVP):** cloud backup, licensing phone-home, branch sync — must not block offline LAN operation.

### 12.3 Domain modules (target minimum)

| Module | Responsibility |
|--------|----------------|
| **Patients** | Registration, demographics, status, search |
| **Patient Profile (360°)** | Aggregated view: info, balance, services, charges, payments, timeline |
| **Services** | Catalog, categories, default prices, active/inactive |
| **Patient Ledger** | Immutable entries: opening balance, charges, discounts, payments, refunds, adjustments |
| **Payments** | Methods (cash/card/transfer), idempotency, receipts |
| **Users & Security** | Auth, roles, configurable permissions |
| **Audit** | Sensitive action trail |
| **Reports** | Revenue, outstanding balances, statements, exports |
| **Backup/Restore** | pg_dump-based, admin UI |
| **Clinic Settings** | Branding, payment methods, numbering, locale |

### 12.4 Patient ledger (target pattern)

Prefer **append-only ledger** over mutating balance fields:

```text
patient_ledger_entries
  id, patient_id, type, amount, balance_after (optional snapshot),
  reference_type, reference_id, user_id, notes, created_at

Types: OPENING | CHARGE | SERVICE | DISCOUNT | PAYMENT | REFUND | ADJUSTMENT
```

Current balance = `SUM(amount)` or last snapshot + verification job.

### 12.5 API design standards (target)

- Consistent `{ success, data, meta }` with pagination meta  
- Cursor/offset pagination on all lists  
- Sorting + filtering query params  
- Idempotency-Key header for payments  
- Never expose raw Prisma models — use response DTOs  
- Problem details for errors (Arabic + English messages)  

### 12.6 Desktop decision: Electron vs Tauri

| Option | Verdict |
|--------|---------|
| **Electron (current)** | **Keep for MVP** — already integrated, team knowledge, preload IPC exists |
| Tauri | Lower footprint but **rewrite cost** — evaluate only if installer size becomes a sales blocker |

Electron shell must remain **thin** — no business rules in main process except connectivity/printing helpers.

---

## 13. What Should Be Kept

| Asset | Reason |
|-------|--------|
| NestJS API + module pattern | Correct framework; already invested |
| PostgreSQL + Prisma server schema approach | Matches product requirements |
| Monorepo workspaces | Shared types, i18n, config |
| Auth module (JWT + refresh + sessions) | Fix gaps, don’t rewrite |
| RBAC permission model (`module:feature:action`) | Maps to clinic roles |
| Tenants/branches/users/roles/devices | Platform for multi-clinic future |
| Electron + React + Vite shell | Working desktop delivery |
| Arabic/English localization package | Primary market requirement |
| Audit log table + module skeleton | Extend for compliance |
| Document numbering service | Fix concurrency, reuse for receipts/invoices |
| Accounting engine concept | Adapt to patient ledger + clinic revenue accounts |
| Docker PostgreSQL for development | Keep for dev; production uses native PostgreSQL on server |

---

## 14. What Should Be Refactored

| Area | Action |
|------|--------|
| **Deployment model** | Deprioritize client SQLite; LAN thin client first |
| **Financial services** | Wrap all money movements in transactions; add idempotency |
| **DocumentNumberService** | Move sequence increment inside same `$transaction` as document create |
| **InventoryLedgerService** | Add row locking or atomic SQL upsert (if pharmacy module kept) |
| **JWT strategy** | Validate session still active |
| **Exception handling** | Register `GlobalExceptionFilter`; user-safe Arabic/English messages |
| **API client** | Split by domain module; add typed pagination |
| **Desktop pages** | Extract design system; permission-aware nav |
| **Sync module** | Freeze/simplify until LAN MVP stable; don’t expand for PMS v1 |
| **Dashboard** | Replace ERP KPIs with clinic KPIs |
| **docs/ARCHITECTURE.md** | Update to reflect actual state (after approval) |
| **Seed data** | Replace ERP demo with clinic demo patients/services |

---

## 15. What Should Be Rewritten (Domain Layer)

These are **ERP concepts** that do not map 1:1 to clinic PMS — plan new modules rather than renaming in place:

| Current | Replace with |
|---------|--------------|
| Customers | **Patients** (+ MRN, DOB, gender, insurance fields) |
| Products | **Services catalog** (clinical/admin services) |
| Sales invoices | **Patient charges / billing documents** |
| POS | **Front-desk payment/checkout** (simpler UX, tied to patient ledger) |
| Suppliers / Purchasing | **Optional** — defer unless clinic needs inventory purchasing |
| Inventory / Warehouses | **Optional** — pharmacy module only if in scope |
| ERP Dashboard stats | **Clinic dashboard** (patients, revenue, outstanding, today’s activity) |
| Desktop ERP pages | New PMS screens including **Patient 360°** |

**Do not blindly rename `Customer` → `Patient` in Prisma** without redesigning relationships and ledger model.

---

## 16. What Should NOT Be Changed Unnecessarily

- NestJS as framework (no Express rewrite)
- PostgreSQL as primary database (no MongoDB/SQLite server)
- Modular monolith (no microservices)
- Monorepo structure
- Prisma ORM (no raw SQL migration to another ORM)
- Electron for desktop v1 (no Tauri rewrite yet)
- Permission key convention
- Global API prefix `/api/v1`
- TypeScript strict mode baseline
- Arabic RTL architecture in localization package

**Avoid:** Redis, Kafka, Kubernetes, GraphQL unless a concrete requirement emerges.

---

## 17. ERP vs Patient Management — Gap Analysis

| PMS requirement | Current ERP state | Gap size |
|-----------------|-------------------|----------|
| Patient registration | Customers (code, balance) | **Large** — new model + UI |
| Patient 360° profile | None | **Large** — new aggregate API + page |
| Service catalog | Products (SKU, inventory) | **Medium** — simplify, remove inventory coupling |
| Patient ledger | Customer balance field + invoices | **Large** — need append-only ledger |
| Payments (cash/card/…) | Customer payments + POS payments | **Medium** — unify under patient ledger |
| Discounts / refunds | Not first-class | **Large** |
| Role-based discount limits | Permissions exist, no discount rules | **Medium** |
| Reports | Minimal | **Large** |
| Audit trail | Table exists, limited writes | **Medium** |
| Backup/restore | None | **Large** |
| Printing | None | **Large** |
| Multi-PC LAN | Partial | **Medium** — fix concurrency + connectivity |
| Arabic RTL UI | Good foundation | **Small** — polish + print RTL |
| Offline without server | Partial sync | **Out of scope for MVP** per new vision |

---

## 18. Recommended Migration / Implementation Roadmap

### Phase 0 — Stabilize foundation (before PMS features)

**Goal:** Safe platform for financial and multi-user work.

- [ ] Register global exception filter; production env validation (`JWT_SECRET`, `DATABASE_URL`)
- [ ] JWT session validation on each request; refresh token rotation
- [ ] Fix document number + ledger concurrency (transactions + locking)
- [ ] Unify Electron API URL for renderer + sync (or remove sync from MVP path)
- [ ] Configure Jest; add integration tests for auth + one financial flow
- [ ] Fix POS accounting for multi-payment methods
- [ ] Update outdated architecture docs

**Exit criteria:** Tests pass; two concurrent API operations don’t corrupt sequences/stock; revoked sessions fail immediately.

---

### Phase 1 — Architecture + LAN thin client

- [ ] Define PMS domain model (ERD) for patients, ledger, services, payments
- [ ] Decide: deprecate client SQLite for MVP (recommended) or document hybrid mode
- [ ] Create `packages/ui` design system (buttons, inputs, tables, dialogs, toasts)
- [ ] Server connection UX (“Cannot reach clinic server”)
- [ ] Permission-aware navigation
- [ ] Pagination pattern on API + tables

---

### Phase 2 — Database + auth + authorization (PMS)

- [ ] New Prisma migrations: `Patient`, `Service`, `PatientLedgerEntry`, `Payment`, …
- [ ] Seed clinic roles: Administrator, Reception, Accountant, Doctor
- [ ] Permission matrix for PMS modules
- [ ] Audit writes for patient + financial mutations

---

### Phase 3 — Patients

- [ ] Patient CRUD API + validation
- [ ] Patient search (name, phone, ID)
- [ ] Patient list UI (professional table, pagination)
- [ ] Patient create/edit forms (Arabic RTL)

---

### Phase 4 — Patient 360° profile

- [ ] Aggregate API: patient + balance + recent ledger + notes
- [ ] Profile page tabs: Info, Financial, Services, Timeline
- [ ] Empty/loading/error states

---

### Phase 5 — Services catalog

- [ ] Service CRUD, categories, default pricing
- [ ] Role-based price override rules

---

### Phase 6 — Patient financial ledger

- [ ] Ledger entry service (transactional)
- [ ] Charges from services
- [ ] Opening balance migration path
- [ ] Balance calculation + statement query

---

### Phase 7 — Payments, discounts, refunds

- [ ] Payment recording with idempotency
- [ ] Discount/refund entries on ledger
- [ ] Payment receipt data model
- [ ] Reception checkout UI

---

### Phase 8 — Reports

- [ ] Report query layer (not in React components)
- [ ] Daily revenue, outstanding balances, patient statement
- [ ] Export CSV/PDF hooks

---

### Phase 9 — Audit, backup, restore

- [ ] Complete audit coverage
- [ ] Backup job (pg_dump) + history + restore workflow
- [ ] Admin UI

---

### Phase 10 — Desktop/LAN packaging

- [ ] Windows installer for client
- [ ] Server setup guide: PostgreSQL + NestJS as Windows Service
- [ ] First-run wizard: server IP, clinic name, admin user

---

### Phase 11 — Testing + hardening

- [ ] Financial integration tests (payment, refund, discount, concurrent ops)
- [ ] Permission tests
- [ ] Load smoke tests (10k patients, 100k ledger rows)
- [ ] Security review

---

## 19. Incremental NestJS Restructuring (not migration)

Since we keep NestJS, evolve module layout:

```
apps/api/src/modules/
  platform/     # auth, users, roles, tenants, audit, backup
  patients/     # NEW
  services/     # NEW (clinic service catalog)
  ledger/       # NEW (patient financial core)
  payments/     # NEW
  reports/      # NEW
  settings/     # clinic configuration
  legacy-erp/   # TEMP: freeze existing ERP modules until removed
```

Introduce **use-case services** per command (`RecordPaymentHandler`, `ApplyChargeHandler`) that orchestrate Prisma transactions + audit.

Move shared business rules toward `packages/domain` **only when** they are needed by both API and tests — avoid premature abstraction.

---

## 20. Risk Register (summary)

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | Building PMS on ERP models | High | High | New domain module; don’t rename-only |
| R2 | Offline sync complexity | High | Medium | Defer; LAN thin client MVP |
| R3 | Financial data corruption | Medium | Critical | Transactions, tests, ledger design |
| R4 | No tests | High | High | Phase 0 test harness |
| R5 | UI stays prototype-quality | High | High | Design system in Phase 1 |
| R6 | LAN misconfiguration | Medium | High | Server discovery / config UI |
| R7 | Scope creep (inventory, PO, POS ERP) | Medium | Medium | Freeze legacy ERP modules |

---

## 21. Immediate Next Steps (STOP point)

Per instructions, **stop here** before major architectural changes.

**Recommended approvals needed from product owner:**

1. Confirm **LAN thin client** (central PostgreSQL only) vs continue **offline-first SQLite** on each PC  
2. Confirm **ERP modules frozen/removed** in favor of PMS domain  
3. Confirm **Phase 0 stabilization** before Patient module work  
4. Confirm **Electron kept** for desktop v1  

**After approval, first implementation tasks (Phase 0):**

1. Register `GlobalExceptionFilter` + env hardening  
2. Session validation in JWT strategy  
3. Document number service transaction fix  
4. Electron API URL unification  
5. Jest setup + first financial integration test  

---

## 22. Appendix — Key file references

| Topic | Path |
|-------|------|
| API entry | `apps/api/src/main.ts` |
| App module | `apps/api/src/app.module.ts` |
| JWT strategy | `apps/api/src/modules/auth/jwt.strategy.ts` |
| Permissions guard | `apps/api/src/common/guards/index.ts` |
| Document numbers | `apps/api/src/common/services/document-number.service.ts` |
| Inventory ledger | `apps/api/src/common/services/inventory-ledger.service.ts` |
| Accounting engine | `apps/api/src/common/services/accounting-engine.service.ts` |
| Server schema | `packages/database/prisma/schema.server.prisma` |
| Local schema | `packages/database/prisma/schema.local.prisma` |
| Electron main | `apps/desktop/electron/main.ts` |
| Sync service | `apps/desktop/electron/sync-service.ts` |
| Desktop app | `apps/desktop/src/App.tsx` |
| Auth store | `apps/desktop/src/stores/index.ts` |
| Existing architecture doc (outdated) | `docs/ARCHITECTURE.md` |
| Roadmap | `docs/ROADMAP.md` |

---

*End of audit. No major code changes were made during this review except creation of this document.*
