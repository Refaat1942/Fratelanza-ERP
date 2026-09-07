# PHASE 8 COMPLETE

**Universal Projects + Cost Centers Foundation**

**Date:** 2026-09-07  
**Status:** Complete

> **Projects and Cost Centers are universal Business Core capabilities and are not Construction-specific.**

> **This phase does not implement Construction.**

---

## Architecture Decision

Phase 8.0 delivers **master-data only**:

```text
                UNIVERSAL PROJECTS (licensed Business Core)
                       │
         ┌─────────────┴─────────────┐
         │                           │
      Project                   CostCenter
         │                           │
         └──────── optional projectId ┘
```

- **Project ≠ Cost Center** — separate entities, separate lifecycles
- All stock/finance/commercial paths **unchanged**
- No second ledger, no GL on project/cost-center CRUD
- `InventoryLedgerService`, `AccountingEngineService`, `FinancialPostingService` **not modified**

---

## Audit Findings (Baseline)

| Before Phase 8 | After Phase 8 |
|----------------|---------------|
| No Project/CostCenter tables | `projects`, `cost_centers` tables |
| `journal_lines` dimension columns only (no FK) | Unchanged — **no FK migration in 8.0** |
| `projects` catalog entry `available: false` | `available: true` |
| No API / RBAC / features | Full master-data stack |

---

## Project Model

**Table:** `projects`

| Field | Notes |
|-------|-------|
| `tenantId`, `code` | `@@unique([tenantId, code])` |
| `name`, `description` | Required name |
| `status` | `draft \| active \| on_hold \| completed \| cancelled \| archived` |
| `branchId` | Optional home branch |
| `customerPartyId` | Optional FK → `Party` |
| `managerUserId` | Optional FK → `User` |
| `startDate`, `endDate` | Optional |
| `deletedAt` | Set on archive |

**Numbering:** `DocumentNumberService` — `PRJ-YYYY-NNNNNN` (default branch when `branchId` null)

---

## Cost Center Model

**Table:** `cost_centers`

| Field | Notes |
|-------|-------|
| `tenantId`, `code` | Tenant-unique manual code (`CC-001`, etc.) |
| `name`, `description` | |
| `parentId` | Optional hierarchy (max depth 8) |
| `projectId` | Optional association |
| `branchId` | Optional; null = tenant-wide |
| `isActive` | Deactivate without delete |
| `deletedAt` | Set on archive |

---

## Project Lifecycle

Transitions enforced in `project-lifecycle.ts`:

```text
draft → active | cancelled | archived
active → on_hold | completed | cancelled | archived
on_hold → active | cancelled | archived
completed → archived
cancelled → archived
archived → terminal
```

---

## Cost Center Lifecycle

| State | Mechanism |
|-------|-----------|
| Active | `isActive = true`, `deletedAt = null` |
| Inactive | `isActive = false` via PATCH |
| Archived | `POST /cost-centers/:id/archive` |

Hierarchy: self-parent rejected, cross-tenant parent rejected, cycles prevented.

---

## Project ↔ Cost Center

- Many cost centers → one optional project via `CostCenter.projectId`
- Shared cost centers: `projectId = null`
- Branch rule: cost center branch must match project branch or be tenant-wide
- `GET /projects/:id/cost-centers` lists assigned centers

---

## Tenant Isolation

- All queries scoped by JWT `tenantId`
- Cross-tenant read/update/assign → `404` or `400` with generic message
- Integration tests use `createIsolatedTenant` pattern

---

## Branch Semantics

| Entity | `branchId` |
|--------|------------|
| Project | Optional — tenant-wide allowed |
| Cost Center | Optional — tenant-wide allowed |
| PRJ numbering | Uses project branch or tenant default branch |

---

## Party / Customer Boundary

- Optional `customerPartyId` → active `Party` in same tenant
- No `customerId` on Project
- No Party identity mutation on project create/update

---

## Finance Boundary

| Action | Phase 8 |
|--------|---------|
| Create project/cost center | **No GL** |
| Modify `FinancialPostingService` | **No** |
| Modify `AccountingEngineService` | **No** |
| Expose journal-line dimensions | **No** |
| FK on `journal_lines` | **No** (deferred) |

Verified by integration test: journal count unchanged on project create.

---

## Inventory Boundary

No inventory mutations. Verified by integration test.

---

## Licensing

| Layer | Implementation |
|-------|----------------|
| Module | `@RequireModule('projects')` |
| Features | `projects.projects`, `projects.cost-centers` |
| Demo license | Added to `DEMO_ENABLED_MODULES` + `DEMO_ENABLED_FEATURES` |
| Catalog | `projects.available = true`; `construction` remains `false` |

Server-side entitlement enforcement is authoritative over RBAC.

---

## RBAC

| Permission | Action |
|------------|--------|
| `projects:projects:read` | List/get/search |
| `projects:projects:create` | Create |
| `projects:projects:update` | Update + status |
| `projects:projects:archive` | Archive |
| `projects:cost-centers:read` | List/get/tree |
| `projects:cost-centers:manage` | Create/update/archive/hierarchy/assign |

Seeded in `packages/database/prisma/seed.ts` and `test-app.ts` (`ensureProjectsPermissions`).

---

## Audit

| Action | Entity |
|--------|--------|
| `projects.project.created` | `project` |
| `projects.project.updated` | `project` |
| `projects.project.archived` | `project` |
| `projects.cost_center.created` | `cost_center` |
| `projects.cost_center.updated` | `cost_center` |
| `projects.cost_center.archived` | `cost_center` |

---

## API

| Method | Route | Feature |
|--------|-------|---------|
| GET/POST | `/projects` | `projects.projects` |
| GET/PATCH | `/projects/:id` | `projects.projects` |
| POST | `/projects/:id/archive` | `projects.projects` |
| GET | `/projects/:id/cost-centers` | `projects.cost-centers` |
| GET/POST | `/cost-centers` | `projects.cost-centers` |
| GET/PATCH | `/cost-centers/:id` | `projects.cost-centers` |
| POST | `/cost-centers/:id/archive` | `projects.cost-centers` |

---

## Desktop

- `/projects` — list, search, create (`LicensedRoute` + `projects.projects`)
- `/cost-centers` — list, search, create (`LicensedRoute` + `projects.cost-centers`)
- Nav hides routes when module or feature disabled

---

## Database

**Migration:** `20250907193000_universal_projects`

Additive only — new tables, no changes to finance/commercial tables.

---

## Concurrency

- Tenant-unique codes enforced by DB constraints
- `PRJ` numbering via atomic `DocumentNumberService`
- Duplicate code → deterministic conflict error

---

## Tests

**New:** `apps/api/test/projects.integration.spec.ts` — 27 tests

Covers: licensing, project CRUD, cost center CRUD, hierarchy, association, boundaries (no GL/inventory/Party mutation), audit, RBAC.

**Full regression:** **227/227 PASS**

---

## Typecheck

**PASS** (all workspaces including desktop)

---

## Known Risks

| Risk | Status |
|------|--------|
| Commercial docs cannot carry project dimensions yet | By design — Phase 8.1+ |
| `journal_lines` columns have no FK to masters | Deferred |
| Sales/Purchasing on legacy GL | Unchanged |
| Construction depends on `projects` module | Enabled; construction still disabled |

---

## Future Construction Integration

Construction vertical (future) builds on:

```text
Projects ✅  +  Cost Centers ✅  +  Finance dimension migration ⏳
+ Inventory allocation ⏳  +  Construction module (BOQ, sites) ❌
```

**This phase does not implement Construction.**

---

## Future Finance Dimension Migration

Phase 8.1+ candidates:

1. FK constraints on `journal_lines.projectId/costCenterId`
2. Dimension validation in `FinancialPostingService`
3. Finance REST DTO exposure for `PostingDimensions`
4. Optional project/cost center on Sales/Purchasing (feature-flagged)
5. Sales/Purchasing migration from `AccountingEngineService` → FPS

**Not started in Phase 8.0.**

---

## Phase 9 Recommendation

**Do not start Phase 9** without explicit product approval.

Recommended next steps:

- **Phase 8.1:** Finance dimension validation + REST DTOs
- **Phase 8.2:** Optional commercial document dimensions (flagged)
- **Construction vertical:** Separate phase after Finance migration

---

## Files Changed (Summary)

### Schema / Migration
- `packages/database/prisma/schema.server.prisma`
- `packages/database/prisma/migrations/20250907193000_universal_projects/migration.sql`
- `packages/database/prisma/seed.ts`

### API
- `apps/api/src/modules/projects/` (module, services, controllers, DTOs, lifecycle)
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/license/catalog/module-catalog.ts`
- `apps/api/src/modules/license/catalog/feature-catalog.ts`

### Tests
- `apps/api/test/projects.integration.spec.ts`
- `apps/api/test/projects-test.helpers.ts`
- `apps/api/test/test-app.ts`

### Desktop
- `apps/desktop/src/pages/ProjectsPage.tsx`
- `apps/desktop/src/pages/CostCentersPage.tsx`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/AppLayout.tsx`
- `apps/desktop/src/lib/api.ts`
- `apps/desktop/src/pages/PartiesPage.tsx` (typecheck fix)

### Localization
- `packages/localization/src/locales/en.ts`
- `packages/localization/src/locales/ar.ts`

### Documentation
- `docs/PHASE_8_PROJECTS_DESIGN.md`
- `docs/PHASE_8_PROJECTS_COMPLETE.md`
