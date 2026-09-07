# PHASE 9.0 CONSTRUCTION FOUNDATION COMPLETE

**Status:** COMPLETE — 2026-09-07  
**Prerequisites:** Phase 9 Construction Design ✅, Phase 8.3.1 Regression Triage ✅

> Phase 9.0 establishes Construction vertical **infrastructure only**. No contracts, BOQ, progress, variations, retention, or GL posting in this phase.

---

## Scope Delivered

| Area | Status |
|------|--------|
| Party roles `contractor`, `subcontractor` | ✅ |
| Construction module licensing (`construction`) | ✅ |
| Feature `construction.foundation` | ✅ |
| RBAC `construction:foundation:read/manage` | ✅ |
| Construction project profile (1:1 Universal Project) | ✅ |
| Construction cost subledger (`ConstructionCostEntry`) | ✅ |
| Dimension validation via `PostingDimensionService` | ✅ |
| Idempotent source identity on cost entries | ✅ |
| Append-only cost subledger | ✅ |
| Integration tests | ✅ 11 tests |

**Not delivered (future sub-phases):** contracts, BOQ, sites, progress, variations, retention, subcontracts, material issues, FPS posting rules, profitability reports, desktop UI.

---

## Party Construction Roles

Extended `PartyRoleType` enum:

- `contractor`
- `subcontractor`

Uses existing `Party` + `PartyRole` architecture. No duplicate contractor/subcontractor master tables.

A party may hold multiple roles (e.g. `subcontractor` + `supplier`).

---

## Commercial Licensing

| Item | Value |
|------|-------|
| Module key | `construction` |
| `available` | `true` (licensable — **not** in `DEMO_ENABLED_MODULES`) |
| Dependencies | `core`, `projects`, `finance`, `party` |
| Feature | `construction.foundation` |
| Enforcement | `@RequireModule('construction')` + `@RequireFeature('construction.foundation')` |

Perpetual/time-limited semantics unchanged. Tenants cannot self-enable Construction without signed license activation.

---

## RBAC

| Permission | Purpose |
|------------|---------|
| `construction:foundation:read` | Read profile + cost entries |
| `construction:foundation:manage` | Enable profile + record cost entries |

Seeded in `packages/database/prisma/seed.ts` and `apps/api/test/test-app.ts`.

---

## Universal Project Relationship

**`ConstructionProjectProfile`** — additive 1:1 extension linked to existing `Project`:

- Does **not** duplicate project code, name, branch, manager, or `customerPartyId`
- Created via `POST /api/v1/construction/projects/:projectId/profile`
- Required before cost entries can be recorded

---

## Cost Subledger

**Table:** `construction_cost_entries`

| Field | Purpose |
|-------|---------|
| `projectId` | Universal Project FK |
| `costCenterId?` | Universal Cost Center FK |
| `branchId` | Branch context for dimension validation |
| `category` | `material`, `labor`, `subcontract`, `equipment`, `other` |
| `amount` | Positive `Decimal(18,4)` |
| `currency` | Default `EGP` |
| `sourceModule/sourceType/sourceId/sourceEvent` | Deterministic idempotency |
| `occurredAt` | Business date |
| `description?` | Reference text |

**Invariants:**

- Append-only — no update/delete service paths
- Idempotent on `(tenantId, sourceModule, sourceType, sourceId, sourceEvent)`
- Validates project/cost center via `PostingDimensionService.assertCostEntryDimensions()`
- **Does not** post to General Ledger in Phase 9.0

---

## API

| Method | Route | Permission |
|--------|-------|------------|
| POST | `/construction/projects/:projectId/profile` | `manage` |
| GET | `/construction/projects/:projectId/profile` | `read` |
| GET | `/construction/projects/:projectId/cost-entries` | `read` |
| POST | `/construction/projects/:projectId/cost-entries` | `manage` |
| GET | `/construction/cost-entries/:id` | `read` |

---

## Migration

**`20250907210000_construction_foundation`**

- Alters `PartyRoleType` (+ contractor, subcontractor)
- Creates `ConstructionCostCategory` enum
- Creates `construction_project_profiles`
- Creates `construction_cost_entries`

---

## Tests

**New:** `apps/api/test/construction.integration.spec.ts` — 11 tests

Covers: licensing, profile extension, cost subledger CRUD/idempotency, dimension rejection, party roles, no GL side effects.

**Regression before:** 259/259  
**Regression after:** **270/270 PASS**

---

## Typecheck

`npm run typecheck` — PASS across workspaces.

---

## Files Changed (Summary)

| Path | Change |
|------|--------|
| `packages/database/prisma/schema.server.prisma` | Construction models + party roles |
| `packages/database/prisma/migrations/20250907210000_construction_foundation/` | Migration |
| `packages/database/prisma/seed.ts` | Construction permissions |
| `apps/api/src/modules/construction/` | **New module** |
| `apps/api/src/modules/license/catalog/module-catalog.ts` | Construction deps + available |
| `apps/api/src/modules/license/catalog/feature-catalog.ts` | `construction.foundation` |
| `apps/api/src/modules/parties/party-roles.service.ts` | New role params |
| `apps/api/src/modules/finance/posting/posting-dimension.service.ts` | `assertCostEntryDimensions` |
| `apps/api/src/app.module.ts` | Import ConstructionModule |
| `apps/api/test/construction.integration.spec.ts` | **New** |
| `apps/api/test/construction-test.helpers.ts` | **New** |
| `apps/api/test/test-app.ts` | Construction permissions helper |

---

## Explicit Statements

- Phase 9.0 implements **Construction foundation only** — not contracts, BOQ, progress, variations, retention, or Construction GL posting.
- Construction attaches to **Universal Project** — no `ConstructionProject` duplicate master.
- Construction cost subledger is **operational truth** — not a replacement for General Ledger.
- Construction module is **separately licensable** on perpetual/one-time license model.
- Phase 9.1+ should implement contracts/BOQ on top of this foundation.

---

## Next Recommended Phase

**Phase 9.1 — Construction Contracts + BOQ** (separate approval required)
