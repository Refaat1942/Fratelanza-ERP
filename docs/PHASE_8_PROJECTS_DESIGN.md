# Phase 8 — Universal Projects + Cost Centers Design

**Status:** Phase 8.0 implemented — 2026-09-07  
**Date:** 2026-09-07  
**Prerequisites:** Phase 7.0 Inventory ✅, Phase 6 Purchasing ✅, Phase 5 Sales ✅, Phase 2 Finance ✅

> **Principle:** Projects and Cost Centers are universal Business Core capabilities — **not Construction-specific.** This phase does **not** implement Construction.

---

## Executive Summary

The repository has **no Projects or Cost Centers domain today**. Finance prepared dimension **columns** on `journal_lines` (`projectId`, `costCenterId`, `department`) and `FinancialPostingService` can persist them — but there are **no master tables**, **no FK constraints**, **no API**, **no permissions**, and **no commercial features**.

Phase 8 should deliver **master-data foundation only**: Project lifecycle, Cost Center lifecycle, optional hierarchy, optional Project ↔ Cost Center association, licensing, RBAC, audit, and minimal desktop UI.

Phase 8 must **not** rewrite Sales, Purchasing, Inventory, Finance posting paths, or PMS. Creating a Project must **not** create GL journals, inventory movements, or Party identity changes.

**Hard STOP:** Do not wire commercial documents or legacy `AccountingEngineService` to project dimensions in Phase 8.0. That requires a separate Finance migration decision (Sales/Purchasing → `FinancialPostingService`).

---

## 1. Repository Audit

### 1.1 Search Scope

Audited across: Prisma schemas (server + local), API modules, finance posting, legacy accounting, sales/purchasing/inventory services, licensing catalogs, RBAC seed, audit patterns, document numbering, desktop routes, integration tests, and architecture docs.

### 1.2 What EXISTS Today

| Area | Finding |
|------|---------|
| **`JournalLine` dimensions** | `projectId`, `costCenterId`, `department` nullable columns with indexes — migration `20250907160000_universal_finance` |
| **`PostingDimensions` type** | `branchId`, `projectId`, `costCenterId`, `department` in `posting.types.ts` |
| **`FinancialPostingService`** | Writes dimension fields to `journal_lines` when provided internally |
| **Module catalog** | `projects` entry exists — `tier: business`, `dependencies: ['core']`, **`available: false`** |
| **Construction catalog** | `construction` depends on `projects` — also `available: false` |
| **Architecture docs** | Target models described in `PHASE_1_5_PLATFORM_ARCHITECTURE.md` §9 |
| **Licensing test** | Validates `construction` activation fails without `projects` module |
| **`User` model** | Tenant-scoped users with optional `branchId` — suitable for project manager |
| **`Party` model** | Universal identity with customer/supplier roles — suitable for project client reference |
| **`DocumentNumberService`** | Atomic tenant + branch + documentType + fiscalYear numbering |
| **`AuditService`** | Generic entity/action logging — reusable pattern from Party/Inventory phases |

### 1.3 What DOES NOT Exist

| Area | Status |
|------|--------|
| `Project` table | ❌ |
| `CostCenter` table | ❌ |
| `ProjectCostCenter` / association table | ❌ |
| `Budget`, `ProjectCostEntry`, tasks, timesheets | ❌ |
| `Employee` model | ❌ |
| `apps/api/src/modules/projects/` | ❌ |
| Projects permissions in `seed.ts` | ❌ |
| `projects.*` feature keys | ❌ |
| Desktop `/projects` route or page | ❌ |
| Sales/Purchasing project fields | ❌ |
| Inventory project allocation | ❌ |
| Expenses module | ❌ |
| FK from `journal_lines.projectId/costCenterId` to master tables | ❌ |
| Finance REST DTOs exposing `dimensions` | ❌ |
| Dimension validation in posting engine | ❌ |
| Legacy `AccountingEngineService` dimension support | ❌ |
| Work orders, jobs, activities | ❌ |
| Attachment system for projects | ❌ |
| Local/offline schema mirror for projects | ❌ |

### 1.4 Legacy / Project-Like References (Not Universal Projects)

| Reference | Location | Meaning |
|-----------|----------|---------|
| `department` on PMS `Service` / `Encounter` | `schema.server.prisma` | Free-text clinical field — **not** a Cost Center entity |
| `department` on `JournalLine` | Finance migration | Free-text dimension placeholder — **not** normalized master data |
| `projects` in module catalog | `module-catalog.ts` | Placeholder — module not implemented |
| Architecture doc budgets/subledger | `PHASE_1_5` §9 | Target future state — **not in schema** |

---

## 2. Concept Separation (Mandatory)

These concepts are **distinct** and must not be merged in schema, API, or documentation.

| Concept | Role | Phase 8 |
|---------|------|---------|
| **Project** | Business container for work delivery, timelines, ownership | ✅ Master entity |
| **Cost Center** | Accounting/management dimension for cost allocation | ✅ Master entity |
| **Department** | Informal org label OR free-text GL dimension | ❌ No Department master table in 8.0; keep `journal_lines.department` as future text dimension |
| **Branch** | Organizational unit within tenant (location/legal entity slice) | ✅ Optional FK on Project/CostCenter — reporting dimension only |
| **Party** | Universal business identity | ✅ Optional `customerPartyId` on Project |
| **Customer** | Legacy ERP sales identity | ❌ Do not add `customerId` on Project; use Party + `PartyLegacyAdapter` when legacy UI needs Customer |
| **Supplier** | Legacy ERP purchasing identity | ❌ Not on Project in 8.0 |

**Rule:** `Project ≠ Cost Center ≠ Branch ≠ Party ≠ Customer`

---

## 3. Architectural Principle

### 3.1 Project vs Cost Center

A **Project** is a business container:

> "New Cairo Hospital Fit-Out" or "Annual Audit — ABC Group"

A **Cost Center** is an accounting/management dimension:

> "Electrical", "Audit Labor", "Travel", "Site Operations"

One project may have **many** cost centers. A cost center may exist **without** a project (tenant-wide shared centers like "Administration" or "Travel").

### 3.2 Target Architecture (Phase 8 Foundation)

```text
                UNIVERSAL PROJECTS (licensed Business Core)
                       │
         ┌─────────────┼─────────────┐
         │             │             │
      Project    (future Tasks)   Cost Centers
         │                           │
         └──────────────┬────────────┘
                        │
              optional association
                        │
                 (future) Business Documents
                        │
              Sales / Purchasing / Expenses
                        │
                     Finance GL
                        │
              dimensions: projectId, costCenterId
```

Phase 8.0 implements **Project + Cost Center master data only**. Tasks, budgets, subledgers, and document dimensions are **deferred**.

### 3.3 No Vertical-Specific Project Systems

Construction, Manufacturing, Professional Services, and PMS must **not** get separate project tables. The future Construction vertical builds on this foundation — it does **not** replace it.

---

## 4. Universal Data Model (Phase 8.0 — Recommended)

### 4.1 Design Goals

- Additive migration only
- Tenant-safe uniqueness on business codes
- Soft archive via status + `deletedAt` (Party/PMS convention)
- Optional branch — not forced
- No Construction-specific fields (BOQ, site, retention, progress %, variations, subcontractor contracts)

### 4.2 `Project`

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | PK |
| `tenantId` | UUID | Required — tenant scope |
| `branchId` | UUID? | Optional home/reporting branch |
| `code` | String | Business identifier — `@@unique([tenantId, code])` |
| `name` | String | Display name |
| `description` | String? | Optional |
| `status` | Enum | See lifecycle §5 |
| `startDate` | Date? | Optional |
| `endDate` | Date? | Optional |
| `customerPartyId` | UUID? | Optional FK → `Party` |
| `managerUserId` | UUID? | Optional FK → `User` (`onDelete: SetNull`) |
| `createdAt`, `updatedAt` | DateTime | Standard |
| `deletedAt` | DateTime? | Soft delete / archive marker |

**Explicitly excluded from Phase 8.0:** `projectType` enum with construction values, `contractValue`, BOQ, WBS, site, budget tables, revenue recognition fields.

### 4.3 `CostCenter`

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | PK |
| `tenantId` | UUID | Required |
| `branchId` | UUID? | Optional — null = tenant-wide |
| `parentId` | UUID? | Optional hierarchy — self-FK |
| `projectId` | UUID? | Optional — when set, center is dedicated to that project |
| `code` | String | `@@unique([tenantId, code])` — manual or seeded pattern `CC-001` |
| `name` | String | |
| `description` | String? | |
| `isActive` | Boolean | Default `true` — prefer deactivate over hard delete |
| `createdAt`, `updatedAt` | DateTime | |
| `deletedAt` | DateTime? | Archive marker |

**Association rule (recommended):**

- **Many cost centers → one project** via optional `CostCenter.projectId`
- **Shared cost centers:** `projectId = null` — used across projects at posting time (future)
- **Do not** use many-to-many junction in 8.0 unless product review requires shared centers formally linked to multiple projects simultaneously

This avoids rewrite for construction/consulting while keeping shared centers tenant-wide.

### 4.4 Optional Additive Finance Hook (Phase 8.0)

After `Project` and `CostCenter` tables exist, add **nullable FK constraints**:

```sql
journal_lines.projectId → projects.id (ON DELETE SET NULL)
journal_lines.costCenterId → cost_centers.id (ON DELETE SET NULL)
```

**Safe because:** columns already exist; legacy `AccountingEngineService` never writes these fields (remains null); no breaking change to Sales/Purchasing/POS.

**Do not** add FK in the same migration if implementation team prefers validate-in-service first — document as Phase 8.0b micro-step.

### 4.5 Explicitly Deferred Schema

| Model | Reason |
|-------|--------|
| `ProjectBudgetVersion`, `ProjectBudgetLine` | Budget management — future sub-phase |
| `ProjectCostEntry`, `ProjectRevenueEntry` | Subledger — requires finance + commercial integration |
| `ProjectTask` | Task management — future |
| `Timesheet`, `Employee` | HR / Professional Services vertical |
| `ProjectDocument` / attachments | No reusable attachment platform audited |

---

## 5. Project Lifecycle

### 5.1 Status Enum

```
draft | active | on_hold | completed | cancelled | archived
```

| Status | Meaning |
|--------|---------|
| `draft` | Created, not yet operational |
| `active` | Operational project |
| `on_hold` | Temporarily paused |
| `completed` | Work finished successfully |
| `cancelled` | Abandoned before completion |
| `archived` | Removed from active lists; historical retention |

### 5.2 Allowed Transitions

```text
draft       → active | cancelled | archived
active      → on_hold | completed | cancelled | archived
on_hold     → active | cancelled | archived
completed   → archived
cancelled   → archived
archived    → (terminal — no automatic unarchive in 8.0)
```

Implement as service-level validation — **no workflow engine**.

### 5.3 Archive Semantics

- `POST /projects/:id/archive` sets `status = archived` and `deletedAt = now()`
- Archived projects excluded from default list filters
- Archived projects remain readable for audit/history
- Do not hard-delete projects referenced by future financial records

---

## 6. Cost Center Lifecycle

| State | Mechanism |
|-------|-----------|
| Active | `isActive = true`, `deletedAt = null` |
| Inactive | `isActive = false` — blocks new associations (service validation) |
| Archived | `POST .../archive` → `isActive = false`, `deletedAt = now()` |

**Deletion policy:** Prefer deactivation/archive. Hard delete only when no references exist (Phase 8.0: no financial references yet).

### 6.1 Hierarchy Rules (if `parentId` implemented)

- Parent must belong to same tenant
- Reject self-parent
- Reject cycles (walk ancestors before save)
- Recommend max depth guard (e.g. 8 levels) — service-level, not DB trigger

---

## 7. Project Numbering

### 7.1 Decision: Use `DocumentNumberService`

**Do not** invent a second numbering engine.

| Attribute | Value |
|-----------|-------|
| `documentType` | `PRJ` |
| Prefix | `PRJ` |
| Format | `PRJ-YYYY-NNNNNN` (existing service format) |
| Branch context | Use project's `branchId` if set; otherwise resolve tenant **default branch** (Party/Patient pattern) |

**Never** pass null branch to `nextNumber` without default-branch resolution — unsafe uniqueness.

Auto-number on create when `code` omitted; allow manual code when provided (validate uniqueness).

### 7.2 Cost Center Code

Cost centers use **business codes**, not document sequences:

- Pattern: `CC-001`, `OPS-MAINT`, etc.
- `@@unique([tenantId, code])`
- User-supplied on create — **do not** reuse `PRJ` numbering for cost centers

---

## 8. Tenant Isolation

All queries and mutations scoped by `tenantId` from JWT (`@TenantId()`).

| Operation | Expected failure |
|-----------|------------------|
| Read/update/archive another tenant's project | `404 Not Found` or `400` with generic message — **no leakage** |
| Assign another tenant's cost center to project | Rejected |
| Cross-tenant parent cost center | Rejected |
| Cross-tenant Party on project | Rejected |

Use PostgreSQL integration tests mirroring Party/Inventory Phase patterns (`createIsolatedTenant` helper).

---

## 9. Branch Semantics

### 9.1 Audit Finding

| Entity | Branch pattern in codebase |
|--------|---------------------------|
| Party | Tenant-wide — numbering uses default branch |
| Customer | Tenant-wide |
| Sales invoice | Branch required on document |
| Warehouse | Branch required |
| Patient | Optional branch on master |

### 9.2 Recommended Rules for Phase 8

| Entity | `branchId` | Rule |
|--------|------------|------|
| **Project** | Optional | Home/reporting branch; null = tenant-wide project |
| **Cost Center** | Optional | null = tenant-wide cost center |
| **Validation** | If both set on association | Cost center branch should match project branch **or** cost center is tenant-wide (`branchId null`) |

**Do not assume Project = Branch.** A tenant may run cross-branch projects with optional home branch for numbering/reporting only.

**Numbering:** When `Project.branchId` is null, resolve default branch for `PRJ` sequence allocation.

---

## 10. Party / Customer Boundary

### 10.1 Recommended Reference

`Project.customerPartyId` → optional FK to `Party`

- Validates party belongs to tenant and is active
- Does **not** require customer role at project create (internal projects have no client)
- When legacy Customer display needed: `PartyLegacyAdapterService` — **no new adapter**

### 10.2 Do Not

- Add `customerId` directly on `Project`
- Modify Customer/Supplier schema
- Auto-create Party from Project
- Merge Project with Party identity

---

## 11. Project Manager / Employee

### 11.1 Audit

- **`Employee` model:** does not exist
- **`User` model:** exists — tenant-scoped, RBAC-enabled

### 11.2 Decision

`Project.managerUserId` → optional FK to `User` with `onDelete: SetNull`

- Validate user belongs to same tenant and is active
- Do not force employees to become Party records
- Do not create HR module dependency

---

## 12. Project ↔ Cost Center Association

### 12.1 Supported Model (Phase 8.0)

```text
Project "Hospital Fit-Out"
 ├── Cost Center "Civil Works"     (projectId = project.id)
 ├── Cost Center "Electrical"      (projectId = project.id)
 └── Cost Center "HVAC"            (projectId = project.id)

Cost Center "Travel"              (projectId = null)  ← shared tenant-wide
```

**API (if implemented in 8.0):**

- Assign: `PATCH /cost-centers/:id` with `{ projectId }`
- Unassign: `{ projectId: null }`
- List project cost centers: `GET /projects/:id/cost-centers` or filter `GET /cost-centers?projectId=`

### 12.2 Validation

- Project and cost center must share tenant
- Cannot assign to archived project
- Cannot assign inactive/archived cost center
- Optional branch consistency check (§9.2)

---

## 13. Finance Boundary — CRITICAL

### 13.1 What Finance Already Has

```831:850:packages/database/prisma/schema.server.prisma
model JournalLine {
  id           String  @id @default(uuid()) @db.Uuid
  entryId      String  @db.Uuid
  accountId    String  @db.Uuid
  branchId     String? @db.Uuid
  projectId    String? @db.Uuid
  costCenterId String? @db.Uuid
  department   String?
  // ...
}
```

`FinancialPostingService` persists `PostingDimensions` when called internally.

### 13.2 What Finance Does NOT Do Today

| Path | Dimensions |
|------|------------|
| `AccountingEngineService` (Sales, Purchasing, POS) | **Never writes** `projectId` / `costCenterId` |
| Finance REST `POST /finance/postings/*` | DTOs **omit** `dimensions` |
| Sales/Purchasing documents | **No** project/cost center columns |

### 13.3 Phase 8.0 Finance Scope

| Action | Phase 8.0 |
|--------|-----------|
| Create `Project` / `CostCenter` master tables | ✅ |
| Add optional FK on `journal_lines` | ✅ Optional additive |
| Modify `FinancialPostingService` | ❌ Not required for master-data MVP |
| Modify `AccountingEngineService` | ❌ Forbidden |
| Expose dimensions on Finance REST DTOs | ❌ Deferred to Finance sub-phase |
| Create project ledger / project GL / project AR/AP | ❌ Forbidden |
| Auto-create journals on project create | ❌ Forbidden — **must test** |

**Future architecture (not Phase 8):**

```text
Business Transaction → FinancialPosting → JournalEntry/GL
                              ↓
                    dimensions: projectId, costCenterId
```

### 13.4 STOP Condition

**STOP** if implementation attempts to:

- Require project on every sale/purchase
- Wire Sales post to project dimensions without approved FPS migration plan
- Create parallel journal system for projects

Document dependency: **Commercial document dimensions require Phase 8.1+ and Sales/Purchasing FPS migration.**

---

## 14. Sales / Purchasing Boundary

| Rule | Phase 8 |
|------|---------|
| Rewrite Sales/Purchasing | ❌ |
| Require Projects license on existing sales/PO flows | ❌ |
| Add optional project fields to invoices/POs | ❌ Phase 8.0 (future, feature-flagged) |
| Block unlicensed tenants from legacy flows | ❌ |

Same independence principle as Phase 7 Inventory vs Sales stock side effects.

---

## 15. Inventory Boundary

| Rule | Phase 8 |
|------|---------|
| Rewrite Inventory | ❌ |
| Project-specific stock ledger | ❌ |
| Inventory allocation/consumption by project | ❌ Future controlled integration |

No `InventoryLedgerService` changes in Phase 8.

---

## 16. PMS Boundary

No PMS schema, API, or Patient ↔ Party changes in Phase 8.

PMS `department` field on clinical services remains unrelated to Cost Center master data.

---

## 17. Licensing Model

### 17.1 Commercial Model

Perpetual license — Projects is a **separately purchasable Business Core module**.

Example entitlements:

| Customer | Projects module |
|----------|-----------------|
| Customer A | ✅ Licensed |
| Customer B | ❌ Not licensed — **must not** access Project APIs even with RBAC grants |

Server-side `@RequireModule('projects')` + `@RequireFeature(...)` remains authoritative.

### 17.2 Module Catalog Change (Implementation)

```typescript
projects: {
  key: 'projects',
  displayName: 'Projects',
  description: 'Universal projects and cost centers',
  tier: 'business',
  available: true,  // flip when shipping
  dependencies: ['core'],
}
```

Keep `construction.available: false`.

### 17.3 Feature Keys (Register Only What Exists)

| Feature key | Covers |
|-------------|--------|
| `projects.projects` | Project CRUD, list, search, archive, lifecycle |
| `projects.cost-centers` | Cost center CRUD, hierarchy, archive |

**Do not register:** `projects.tasks`, `projects.budgets`, `projects.timesheets` until implemented.

### 17.4 Demo License

Add to `DEMO_ENABLED_MODULES` and `DEMO_ENABLED_FEATURES` when implementation ships — for regression parity with other Business Core modules.

---

## 18. RBAC

Follow `{module}:{feature}:{action}` convention.

### 18.1 Recommended Permissions (Phase 8.0)

**Projects:**

| Permission | Action |
|------------|--------|
| `projects:projects:read` | List/get/search |
| `projects:projects:create` | Create |
| `projects:projects:update` | Update + lifecycle transitions |
| `projects:projects:archive` | Archive |

**Cost Centers:**

| Permission | Action |
|------------|--------|
| `projects:cost-centers:read` | List/get/tree |
| `projects:cost-centers:manage` | Create, update, archive, hierarchy, project assignment |

Use `manage` for cost centers to avoid permission explosion — or split create/update/archive if matching projects granularity.

### 18.2 Controller Stack (Canonical)

```typescript
@Controller('projects')
@UseGuards(PermissionsGuard)
@RequireModule('projects')
export class ProjectsController {
  @Get()
  @RequireFeature('projects.projects')
  @RequirePermissions('projects:projects:read')
  // ...
}
```

Authorization at **API boundary only** — not inside shared services used by future cross-module callers.

---

## 19. API Surface (Phase 8.0)

Base path: `/api/v1/projects` and `/api/v1/cost-centers` (or nested under projects module — recommend **flat REST** like Party/Customers).

### 19.1 Projects

| Method | Route | Feature | Permission |
|--------|-------|---------|------------|
| GET | `/projects` | `projects.projects` | read |
| GET | `/projects/:id` | `projects.projects` | read |
| POST | `/projects` | `projects.projects` | create |
| PATCH | `/projects/:id` | `projects.projects` | update |
| POST | `/projects/:id/archive` | `projects.projects` | archive |
| GET | `/projects/:id/cost-centers` | `projects.cost-centers` | read |

**List query params:** `page`, `limit`, `search`, `status`, `branchId`, `sort`

### 19.2 Cost Centers

| Method | Route | Feature | Permission |
|--------|-------|---------|------------|
| GET | `/cost-centers` | `projects.cost-centers` | read |
| GET | `/cost-centers/:id` | `projects.cost-centers` | read |
| POST | `/cost-centers` | `projects.cost-centers` | manage |
| PATCH | `/cost-centers/:id` | `projects.cost-centers` | manage |
| POST | `/cost-centers/:id/archive` | `projects.cost-centers` | manage |

**List query params:** `page`, `limit`, `search`, `projectId`, `parentId`, `isActive`, `branchId`

### 19.3 DTO Validation

- Pagination defaults: page=1, limit=20, max=100
- Deterministic ordering: `code ASC` or `name ASC`
- Status transition validation in service layer
- Thin controllers — business logic in services

---

## 20. Audit Events

Use existing `AuditService` — follow Party/Inventory naming.

| Action | Entity | When |
|--------|--------|------|
| `projects.project.created` | `project` | Create |
| `projects.project.updated` | `project` | Update / status change |
| `projects.project.archived` | `project` | Archive |
| `projects.cost_center.created` | `cost_center` | Create |
| `projects.cost_center.updated` | `cost_center` | Update / parent change / project assign |
| `projects.cost_center.archived` | `cost_center` | Archive |

Do not log sensitive financial data. Audit metadata only — not full duplicate of all fields.

---

## 21. Documents / Attachments

**Audit:** No reusable attachment/document management platform exists in the codebase.

**Phase 8 decision:** Document as future dependency. Do **not** build parallel file storage.

---

## 22. Desktop (Minimal — Phase 8.0)

| Screen | Scope |
|--------|-------|
| Projects list | Search, pagination, status filter |
| Project create/edit | Core fields + lifecycle actions |
| Project archive | Confirm + archive |
| Cost centers list | Search, active filter, optional tree |
| Cost center create/edit | Code, name, parent, project link |
| Cost center archive | Confirm |

**Navigation:** `LicensedRoute moduleKey="projects" featureKey="projects.projects"` (cost center screens also require `projects.cost-centers`).

**Do not build:** Gantt, Kanban, timesheets, resource planning, budget UI.

---

## 23. Database Migration Safety

| Rule | Implementation |
|------|----------------|
| Additive only | New tables + optional FK on existing columns |
| Uniqueness | `@@unique([tenantId, code])` on Project and CostCenter |
| Indexes | `[tenantId, status]`, `[tenantId, projectId]` on cost centers, `[tenantId, parentId]` |
| FK behavior | `onDelete: Restrict` for project ← cost center; `SetNull` for manager/party |
| Timestamps | `createdAt`, `updatedAt` on all masters |
| No nullable uniqueness traps | Codes required, never null |

---

## 24. Concurrency

| Concern | Mitigation |
|---------|------------|
| Duplicate project codes | DB unique constraint + deterministic conflict error |
| PRJ numbering | `DocumentNumberService` inside `$transaction` |
| Duplicate cost center codes | DB unique constraint |
| Concurrent create | Same as Party/Inventory — rely on DB uniqueness, not app-only checks |

---

## 25. Performance

- All list endpoints paginated
- Tenant-scoped queries with indexes
- Avoid N+1: use `include`/`select` batches for project ↔ cost center lists
- Search: `ILIKE` on code/name with tenant filter — acceptable for 8.0 scale

---

## 26. Integration Test Plan (Phase 8 Implementation)

File: `apps/api/test/projects.integration.spec.ts`

Minimum coverage per spec §25:

| # | Area | Test |
|---|------|------|
| 1–3 | Licensing | Unlicensed rejected; licensed accepted; feature disabled rejected |
| 4–11 | Project | CRUD, archive, search, pagination, duplicate code, tenant isolation |
| 12–17 | Cost Center | CRUD, archive, duplicate code, tenant isolation |
| 18–21 | Hierarchy | Parent/child, self-parent, cross-tenant parent, cycle |
| 22–23 | Association | Project ↔ cost center assign; cross-tenant rejected |
| 24–28 | Boundaries | No GL on create; no FPS; no inventory; no PMS; no Party mutation |
| 29–31 | RBAC + license | Authorized/unauthorized/unlicensed matrix |
| 32–41 | Regression | Full suite must remain green (200+ tests) |

---

## 27. Phase 8.0 Scope Summary

### In Scope

1. Prisma migration: `Project`, `CostCenter`
2. Optional FK: `journal_lines` → masters
3. `ProjectsModule` with services, controllers, DTOs
4. Licensing: module + `projects.projects` + `projects.cost-centers`
5. RBAC seed permissions
6. Audit on all mutations
7. Document numbering for projects (`PRJ`)
8. Minimal desktop UI
9. `projects.integration.spec.ts`
10. `PHASE_8_PROJECTS_COMPLETE.md`

### Out of Scope (Explicit Non-Goals)

- Construction vertical, BOQ, sites, progress claims, retention, variations
- Tasks, timesheets, Gantt, Kanban, resource planning
- Budgets, project cost/revenue subledger
- Sales/Purchasing/Inventory rewrites or required project fields
- `FinancialPostingService` / `AccountingEngineService` changes
- Finance REST dimension DTOs
- PMS changes, Patient → Party
- Manufacturing module
- Attachment/document platform
- Phase 9 / any follow-on vertical

---

## 28. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Sales/Purchasing on legacy GL — no dimension flow | **High** | Document; defer commercial integration to 8.1+ |
| Orphan UUIDs in `journal_lines` before FK | Medium | No writers today; add FK after tables |
| Phase numbering confusion (Platform doc Phase 5 vs this Phase 8) | Low | Clarify: **Phase 8 = Universal Projects**; Construction = later vertical |
| `construction` depends on `projects` | Low | Keep construction disabled until Projects ships |
| Over-scoping budgets/subledger | Medium | Strict 8.0 scope gate in implementation |
| Branch null numbering | Medium | Default branch resolution — never raw null |
| Shared vs project-dedicated cost centers | Medium | Document `projectId` nullable semantics |

---

## 29. Future Construction Integration

Construction (future vertical) will depend on:

```text
Projects (Business Core) ✅ Phase 8
+ Cost Centers ✅ Phase 8
+ Finance (dimension posting) ⏳ migration needed
+ Inventory (material allocation) ⏳ Phase 7+ integration
+ Party (client/subcontractor identity) ✅ exists
+ Construction module (BOQ, sites, certificates) ❌ not Phase 8
```

**This phase does not implement Construction.**

---

## 30. Phase 9 Recommendation

**Do not start Phase 9** without explicit product approval.

Likely candidates after Phase 8:

- **Phase 8.1:** Finance REST dimensions + `FinancialPostingService` validation
- **Phase 8.2:** Optional project/cost center on Sales/Purchasing (feature-flagged)
- **Phase 8.3:** Project cost subledger + profitability
- **Construction vertical:** Separate phase — depends on Projects + Inventory + Finance migration

---

## 31. Acceptance Criteria (Implementation Gate)

Do **not** declare Phase 8 complete unless:

- [ ] Universal Projects foundation exists (CRUD + lifecycle + archive)
- [ ] Cost Centers foundation exists (CRUD + hierarchy + archive)
- [ ] Commercially licensable with server-side enforcement
- [ ] RBAC enforced at API boundary
- [ ] Tenant isolation proven by integration tests
- [ ] Branch semantics documented and validated
- [ ] Project ↔ cost center associations safe
- [ ] No duplicate accounting system introduced
- [ ] No inventory mutations introduced
- [ ] No PMS changes introduced
- [ ] Creating a project does **not** create GL journals
- [ ] Full regression passes
- [ ] Typecheck passes

---

## 32. Key File References

| Area | Path |
|------|------|
| Server schema | `packages/database/prisma/schema.server.prisma` |
| Finance dimensions migration | `packages/database/prisma/migrations/20250907160000_universal_finance/` |
| Posting types | `apps/api/src/modules/finance/posting/posting.types.ts` |
| Financial posting | `apps/api/src/modules/finance/posting/financial-posting.service.ts` |
| Legacy accounting | `apps/api/src/common/services/accounting-engine.service.ts` |
| Document numbering | `apps/api/src/common/services/document-number.service.ts` |
| Module catalog | `apps/api/src/modules/license/catalog/module-catalog.ts` |
| Feature catalog | `apps/api/src/modules/license/catalog/feature-catalog.ts` |
| RBAC seed | `packages/database/prisma/seed.ts` |
| Party reference module | `apps/api/src/modules/parties/` |
| Inventory licensing pattern | `apps/api/src/modules/inventory/` |
| Desktop routes | `apps/desktop/src/App.tsx` |
| Platform architecture | `docs/PHASE_1_5_PLATFORM_ARCHITECTURE.md` §9 |

---

## COMPLETE

Phase 8.0 implemented. See [PHASE_8_PROJECTS_COMPLETE.md](./PHASE_8_PROJECTS_COMPLETE.md).
