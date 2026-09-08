# Fratelanza Seed Architecture

**Date:** 2026-09-08  
**Purpose:** Separate test fixtures, demo data, and real customer data — and document safe reset procedures.

---

## Three Data Classes

```
┌─────────────────────────────────────────────────────────────────┐
│                     REAL CUSTOMER DATA                          │
│  Production / live customer PostgreSQL                          │
│  NEVER auto-reset · NEVER run test or eval seed against it      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     DEMO / EVALUATION DATA                      │
│  Database: fratelanza_eval                                      │
│  Source: packages/database/prisma/seed-eval.ts                  │
│  Intentional, human-readable, 3 demo tenants                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     TEST FIXTURES                               │
│  Created by integration tests (apps/api/test)                   │
│  Must stay isolated — never mixed with demo or production       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. TEST FIXTURES

**What:** Records created inside `*.integration.spec.ts` files — users, roles, construction contracts, invoices, etc.

**Where:** Must target **`fratelanza_eval` only** (enforced by `apps/api/test/setup-env.ts`).

**Rules:**

| Rule | Reason |
|------|--------|
| Tests must use `DATABASE_URL` containing `fratelanza_eval` | Prevents pollution of legacy dev DB |
| Tests must NOT assume pre-existing junk data | Flaky tests + confused demos |
| Prefer factories/helpers that clean up or use unique codes | Avoid duplicate key failures |
| Never point tests at `fratelanza_erp` on a machine with customer data | Destructive risk |

**What went wrong before reset:** Tests shared `fratelanza_erp` with local dev, creating hundreds of duplicate roles ("Foundation Only") and throwaway users. That pollution is why the eval database was introduced.

---

## 2. DEMO DATA

**What:** Curated sample businesses for sales, training, and local evaluation.

**Database:** **`fratelanza_eval`**

**Seed file:** `packages/database/prisma/seed-eval.ts`  
**Entry point:** `packages/database/prisma/seed.ts` delegates to `seed-eval.ts`

**Tenants seeded:**

| Code | Business |
|------|----------|
| `TRADING_DEMO` | Nile Trading Company — trading workflow |
| `CONSTRUCTION_DEMO` | Ahram Construction — construction workflow |
| `SERVICES_DEMO` | Hilal Professional Services — services workflow |

**Credentials:** `docs/DEMO_CREDENTIALS.md`

**Characteristics:**

- Realistic Arabic/English names
- Small, explainable datasets (~3 items per master where appropriate)
- Role-based users for RBAC demos (trading tenant)
- No random UUID labels in user-visible names
- License permissions **excluded** from eval seed

---

## 3. REAL CUSTOMER DATA

**What:** Live business data from paying customers.

**Database:** Typically a dedicated PostgreSQL instance — **not** `fratelanza_eval`.

**Rules:**

| Action | Allowed? |
|--------|----------|
| Run `Setup-Eval-Database.cmd` | ❌ Only on eval DB |
| Run `seed:eval` | ❌ Refuses non-eval URLs |
| Run integration tests | ❌ Against customer DB |
| `db:reset` / DROP | ❌ Without explicit customer backup + approval |
| Desktop SQLite `fratelanza-local.db` | Reset separately for offline cache only |

**If unsure whether a database is production:** **STOP** and confirm with the business owner before any destructive operation.

---

## Safety Guards

### In seed (`seed-eval.ts`)

```text
DATABASE_URL must contain:  fratelanza_eval
DATABASE_URL must NOT contain: fratelanza_erp
```

Seed aborts if either rule fails.

### In setup script (`scripts/Setup-Eval-Database.cmd`)

Same URL checks before migrate + seed.

### In integration tests (`apps/api/test/setup-env.ts`)

Throws if `DATABASE_URL` does not target `fratelanza_eval`.

---

## How to Reset the Evaluation Environment

### Full reset (recommended for clean demo)

From the project root, run:

```text
scripts\Setup-Eval-Database.cmd
```

This script:

1. Verifies `DATABASE_URL` targets **`fratelanza_eval`** (via `scripts/.env` used by dotenv)
2. Creates database `fratelanza_eval` if missing (`CREATE DATABASE … OWNER fratelanza`)
3. Runs server migrations: `npm run migrate:server:deploy -w @fratelanza/database`
4. Seeds demo businesses: `npm run seed:eval -w @fratelanza/database`

### Manual equivalent

```bash
# Ensure DATABASE_URL=postgresql://…/fratelanza_eval?schema=public
npm run migrate:server:deploy -w @fratelanza/database
npm run seed:eval -w @fratelanza/database
```

### Override demo password (optional)

```bash
set DEMO_SEED_PASSWORD=YourLocalPassword
npm run seed:eval -w @fratelanza/database
```

Document any override only in local notes — not in source code.

---

## What NOT to Use for Eval Reset

| Script / command | Purpose | Use for eval? |
|------------------|---------|---------------|
| `3-Clean-Test-Data.cmd` | Deletes test junk from **legacy dev DB** via `clean-dev-junk.ts` | ❌ Not a full demo reset |
| `db:reset` on unknown URL | Wipes entire database | ❌ Dangerous |
| Old `fratelanza_erp` seed | Pre-reset polluted dev data | ❌ Deprecated |

---

## Creating a Clean **Customer** Database (not demo)

For a new customer installation (not evaluation):

1. Create a **new** empty PostgreSQL database (e.g. `customer_acme_erp`)
2. Set `DATABASE_URL` to that database
3. Run migrations only: `npm run migrate:server:deploy -w @fratelanza/database`
4. **Do not** run `seed:eval` — eval seed is blocked unless URL contains `fratelanza_eval`
5. Use first-run onboarding (when implemented) or controlled implementation import

Customer data never belongs in `fratelanza_eval`.

---

## File Map

| Path | Role |
|------|------|
| `packages/database/prisma/seed-eval.ts` | Canonical eval demo seed |
| `packages/database/prisma/seed.ts` | CLI entry → `seed-eval` |
| `packages/database/package.json` | `"seed:eval": "tsx prisma/seed-eval.ts"` |
| `scripts/Setup-Eval-Database.cmd` | One-click eval DB create + migrate + seed |
| `scripts/.env` | Local `DATABASE_URL` for scripts (must be eval) |
| `docs/DEMO_CREDENTIALS.md` | Demo usernames/passwords |
| `apps/api/test/setup-env.ts` | Test DB guard |
| `apps/api/test/test-app.ts` | Test helpers (tenant `TRADING_DEMO`) |

---

## Known Issue (post–Step 4)

Migration `20250908140000_product_reset_drop_licensing` removed the `tenant_modules` table, but `seed-eval.ts` still calls `enableTenantModules()` which upserts `tenantModule`. **Remove that function** in a follow-up commit so `seed:eval` succeeds cleanly after migrate.

---

## Quick Reference

| I want to… | Do this |
|------------|---------|
| Reset demo for a sales meeting | `scripts\Setup-Eval-Database.cmd` |
| Run tests safely | `DATABASE_URL=…/fratelanza_eval` + `npm run test -w @fratelanza/api` |
| Never touch customer data | Never run eval seed/reset on unknown URLs |
| Change demo password | `DEMO_SEED_PASSWORD` env var during seed |

---

*This document satisfies Step 18 of the Fratelanza Product Reset brief.*
