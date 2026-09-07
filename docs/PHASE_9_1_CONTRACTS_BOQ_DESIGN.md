# Phase 9.1 — Construction Contracts + BOQ Design

**Status:** Audit + Architecture Design ONLY — 2026-09-07  
**Scope:** Design document only — **no implementation, no migrations, no schema changes, no code modifications**  
**Prerequisites:** Phase 9.0 Construction Foundation ✅ (270/270 tests, typecheck PASS)

> **Hard STOP:** Do not implement Contracts or BOQ until this design is approved.

---

## Executive Summary

Phase 9.1 adds **Construction commercial master data**: **Contracts** and **Bill of Quantities (BOQ)** — planning/contractual truth only. These build directly on Phase 9.0 (`ConstructionProjectProfile`, `ConstructionCostEntry`, Party roles, Projects, Cost Centers, licensing).

**Repository verdict:** No generic contract, BOQ, quotation, estimate, or project budget implementation exists. The platform has adequate **Party**, **Project**, **Product/UOM**, **Cost Center**, **DocumentNumberService**, and **Decimal** patterns to implement Phase 9.1 without rewriting Business Core.

**Recommended MVP:** Single unified `ConstructionContract` entity (customer + subcontractor via `partyRole` discriminator), BOQ header + sections + items, minimal revision model (integer revision + supersede), contract/BOQ metadata for retention/advance (fields only), optional Product and Cost Center links on BOQ items, item-level cost code string (no separate Cost Code master in 9.1).

**Verdict:** See [§28 VERDICT](#28-verdict).

---

## 1. Repository Audit

### 1.1 Search scope

Searched repository for: contracts, quotations, estimates, agreements, BOQ, bill of quantities, cost codes, construction cost categories, products, UOM, pricing, customer/supplier/subcontractor contracts, project budgets, project costing.

Also inspected: `Project`, `ConstructionProjectProfile`, `ConstructionCostEntry`, `Party`, `Customer`, `Supplier`, `Product`, `UnitOfMeasure`, `CostCenter`, Finance/FPS, Sales, Purchasing, Inventory, Licensing, RBAC, `AuditService`, `DocumentNumberService`.

### 1.2 What EXISTS (relevant to Phase 9.1)

| Area | State | Location / notes |
|------|-------|------------------|
| **Universal Project** | ✅ | `projects` — code, name, branch, `customerPartyId`, lifecycle |
| **ConstructionProjectProfile** | ✅ | 1:1 with Project; required gate for construction ops |
| **ConstructionCostEntry** | ✅ | Append-only actual cost subledger; categories enum |
| **Party + roles** | ✅ | `customer`, `supplier`, `contractor`, `subcontractor` |
| **Cost Center** | ✅ | Hierarchy (max depth 8), optional `projectId` |
| **Product catalog** | ✅ | `products`, `units_of_measure`, `product_categories` |
| **UnitOfMeasure** | ✅ | Tenant-scoped `code`, `name`, `symbol` |
| **DocumentNumberService** | ✅ | Atomic `PREFIX-YYYY-NNNNNN`; branch-aware upsert |
| **Decimal money pattern** | ✅ | `Prisma.Decimal(18,4)`; `money.util.ts` in PMS |
| **PostingDimensionService** | ✅ | Project/cost-center validation (for future GL, not 9.1) |
| **Construction module** | ✅ | `construction.foundation` feature; licensing enforced |
| **Project lifecycle** | ✅ | `project-lifecycle.ts` transition map |
| **AuditService** | ✅ | Entity/action logging pattern |
| **Sales quotations feature** | ⚠️ Catalog only | `sales.quotations` in feature catalog — **no API/schema** |
| **Construction cost categories** | ✅ | `material`, `labor`, `subcontract`, `equipment`, `other` on cost entries |

### 1.3 What DOES NOT EXIST

| Area | Status |
|------|--------|
| Generic commercial contract entity | ❌ |
| Construction contract / subcontract tables | ❌ |
| BOQ / BOQ section / BOQ item tables | ❌ |
| Sales quotation documents | ❌ (feature stub only) |
| Purchase quotation documents | ❌ |
| Project budget / budget lines | ❌ |
| Separate construction cost code master | ❌ |
| Contract numbering (`CNT`) | ❌ |
| BOQ numbering (`BOQ`) | ❌ |
| `construction.contracts` / `construction.boq` features | ❌ (not in catalog yet) |
| Contract/BOQ API or desktop UI | ❌ |
| Retention/advance accounting | ❌ |
| Variations, progress, material requirements | ❌ |

### 1.4 Misleading references

| Reference | Actual meaning |
|-----------|----------------|
| `sales.quotations` in feature catalog | Licensed feature placeholder — no implementation |
| `ConstructionCostCategory` | Analytical category on **actual** cost entries — not BOQ line type |
| `Project.customerPartyId` | Universal client link — not a contract |
| Phase 9 design doc `ConstructionContract` | Planning text — not implemented |
| `contract` in `posting.types.ts` comment | TypeScript interface comment — not commercial contract |

### 1.5 Phase 9.0 foundation readiness

| Prerequisite | Ready? |
|--------------|--------|
| Construction licensed vertical | ✅ |
| Project profile gate | ✅ |
| Party contractor/subcontractor roles | ✅ |
| Cost subledger (actual cost) | ✅ |
| Projects + Cost Centers | ✅ |
| Product + UOM for optional BOQ links | ✅ |
| No AccountingEngine in Construction | ✅ |

**No architectural blocker** prevents Phase 9.1 design approval.

---

## 2. Contract Architecture

### 2.1 Design decision: unified contract entity

**Do NOT create** separate `CustomerContract` and `SubcontractContract` tables.

Customer-facing and subcontractor-facing agreements share the same lifecycle, numbering, BOQ attachment, and status model. They differ only in **party role expectations** and **commercial direction**.

**Recommended entity:** `ConstructionContract`

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | PK |
| `tenantId` | UUID | Tenant scope |
| `projectId` | UUID | FK → `projects` (must have `ConstructionProjectProfile`) |
| `branchId` | UUID | Resolved from project or default branch — **never null** for numbering |
| `number` | String | `CNT-YYYY-NNNNNN` via `DocumentNumberService` |
| `title` | String | Required commercial title |
| `description` | String? | Optional scope summary |
| `direction` | Enum | `customer` \| `subcontractor` — commercial orientation |
| `partyId` | UUID | FK → `parties` — counterparty |
| `pricingModel` | Enum | `lump_sum` \| `unit_price` \| `cost_plus` \| `mixed` |
| `originalValue` | Decimal(18,4) | Contract baseline value |
| `revisedValue` | Decimal(18,4)? | Updated after variations (future); initially null or = original |
| `currency` | String | Default `EGP`; align with platform MVP |
| `startDate` | Date? | Contract period start |
| `endDate` | Date? | Contract period end |
| `retentionPercent` | Decimal(8,4)? | Metadata only in 9.1 — no calculations |
| `retentionCap` | Decimal(18,4)? | Optional cap metadata |
| `advanceAmount` | Decimal(18,4)? | Mobilization/advance metadata |
| `advancePercent` | Decimal(8,4)? | Alternative to fixed advance |
| `paymentTerms` | String? | Free text (Net 30, milestone, etc.) |
| `status` | Enum | See §4 |
| `createdById` | UUID? | Audit |
| `createdAt`, `updatedAt` | DateTime | Standard |

**Uniqueness:** `@@unique([tenantId, number])`

**Not in Phase 9.1:** revised value automation, retention ledger, advance recovery, subcontract PO link (Phase 9.7).

### 2.2 Relationship to Universal Project

```text
Universal Project (identity, code, name, branch, manager, customerPartyId)
        ↓
ConstructionProjectProfile (construction enablement — Phase 9.0)
        ↓
ConstructionContract(s) (commercial agreements — Phase 9.1)
        ↓
BOQ (quantities/pricing — Phase 9.1)
```

- Contract **must not** duplicate project code, name, branch, or manager.
- `Project.customerPartyId` may mirror customer contract party but contract maintains its own `partyId` for explicit commercial binding.
- Multiple contracts per project are **allowed** in data model; MVP UX may start with one primary customer contract + optional subcontract contracts.

### 2.3 Contract types (direction + pricing)

Instead of separate entity types, use two enums:

**`direction`**

| Value | Meaning | Expected party role |
|-------|---------|---------------------|
| `customer` | Client/revenue contract | `customer` role on Party (contractor role optional for hybrid orgs) |
| `subcontractor` | Downstream trade agreement | `subcontractor` role; may also have `supplier` for PO/AP |

**`pricingModel`**

| Value | BOQ relevance |
|-------|---------------|
| `lump_sum` | BOQ total should align with contract value |
| `unit_price` | BOQ item qty × rate is primary value driver |
| `cost_plus` | BOQ may be partial; contract value may exceed BOQ |
| `mixed` | Sections with different pricing semantics (document only in 9.1) |

---

## 3. Party Relationship

All contract counterparties use **Universal Party** — no duplicate identity.

```text
Construction Project
    ↓
Customer Contract (direction=customer)
    ↓
Party + active customer role

Construction Project
    ↓
Subcontractor Contract (direction=subcontractor)
    ↓
Party + active subcontractor role (+ supplier role for purchasing bridge)
```

### 3.1 Validation rules (design)

| Rule | Enforcement |
|------|-------------|
| `partyId` belongs to same `tenantId` | Service validation |
| Party is `active` (not archived) | `PartiesService.assertActiveParty` pattern |
| Customer contract | Party must have active `customer` role |
| Subcontractor contract | Party must have active `subcontractor` role |
| Legacy ERP bridge | Optional `Supplier`/`Customer` via `PartyLegacyAdapter` when direction requires AP/AR documents in future phases — **not required in 9.1** |

**Do NOT** create `ConstructionCustomer` or `ConstructionSupplier`.

### 3.2 Alignment with Project.client

- If `direction = customer` and `Project.customerPartyId` is set, service **may warn** on mismatch but should not hard-block (sub-contracts and multiple client agreements exist in real projects).
- MVP test: customer contract party should equal `Project.customerPartyId` when both are set (configurable strict mode deferred).

---

## 4. Contract Status Lifecycle

### 4.1 Status enum

| Status | Meaning |
|--------|---------|
| `draft` | Editable; no operational dependency |
| `active` | Commercially live; BOQ may be approved under it |
| `suspended` | Temporarily paused; no new BOQ approval |
| `completed` | Work commercially closed; read-only |
| `cancelled` | Voided before completion |
| `archived` | Terminal soft-delete state |

### 4.2 Allowed transitions

```text
draft       → active | cancelled | archived
active      → suspended | completed | cancelled | archived
suspended   → active | cancelled | archived
completed   → archived
cancelled   → archived
archived    → (terminal)
```

Implement via `construction-contract-lifecycle.ts` mirroring `project-lifecycle.ts`.

### 4.3 Edit rules by status

| Status | Edit header fields | Create/edit BOQ |
|--------|-------------------|-----------------|
| `draft` | ✅ | ✅ (draft BOQ only) |
| `active` | Limited (dates, payment terms, description) | New BOQ revision only |
| `suspended` | ❌ | ❌ |
| `completed` | ❌ | ❌ |
| `cancelled` | ❌ | ❌ |
| `archived` | ❌ | ❌ |

**Do not overbuild workflow** — no approval chains, no multi-step BPM in 9.1.

---

## 5. Contract Numbering

Use existing **`DocumentNumberService`**.

| Property | Value |
|----------|-------|
| `documentType` | `CNT` |
| Prefix | `CNT` |
| Format | `CNT-2026-000001` |
| Branch | Use `contract.branchId` — resolve from `project.branchId` or tenant default branch |
| **Never NULL branchId** | PostgreSQL upsert NULL uniqueness issue (Phase 1c invariant) |

Register `CNT` in seed/test `number_sequences` bootstrap alongside `PRJ`.

BOQ numbering (separate sequence):

| Property | Value |
|----------|-------|
| `documentType` | `BOQ` |
| Prefix | `BOQ` |
| Format | `BOQ-2026-000001` |

Revision suffix in display only: `BOQ-2026-000001-R2` — store `revisionNumber` integer on BOQ header; do not re-number document on revision.

---

## 6. BOQ Architecture

BOQ is **Construction-vertical only** — not a universal Business Core module.

```text
Universal Project
      ↓
ConstructionProjectProfile
      ↓
ConstructionContract
      ↓
ConstructionBoq (header)
      ├── ConstructionBoqSection (optional hierarchy)
      └── ConstructionBoqItem (leaf lines)
```

One contract may have **multiple BOQ revisions** over time; only one **active approved** BOQ per contract at a time (MVP rule).

---

## 7. BOQ Header

**Entity:** `ConstructionBoq`

| Field | Purpose |
|-------|---------|
| `id` | UUID |
| `tenantId` | Tenant scope |
| `projectId` | FK → projects (must match contract.projectId) |
| `contractId` | FK → construction_contracts |
| `number` | `BOQ-YYYY-NNNNNN` |
| `revisionNumber` | Integer, starts at 1 |
| `supersedesBoqId` | UUID? → previous revision (nullable for rev 1) |
| `status` | See §14 |
| `currency` | Align with contract currency |
| `totalOriginalAmount` | Decimal — **cached sum** of item original amounts |
| `notes` | String? |
| `approvedAt` | DateTime? |
| `approvedById` | UUID? |
| `createdById` | UUID? |
| `createdAt`, `updatedAt` | DateTime |

**Invariant:** `projectId` on BOQ must equal `contract.projectId`.

---

## 8. BOQ Sections

**Entity:** `ConstructionBoqSection`

| Field | Purpose |
|-------|---------|
| `id` | UUID |
| `tenantId` | UUID |
| `boqId` | FK → construction_boqs |
| `parentSectionId` | UUID? — optional one-level nesting for MVP |
| `code` | String — e.g. `01`, `01.01` |
| `name` | String — e.g. `Earthworks`, `Concrete` |
| `sequence` | Int — display order |
| `description` | String? |

**MVP depth:** Maximum **2 levels** (section → sub-section). No arbitrary deep WBS — full WBS is Phase 9.2+ (`ConstructionSite` / `WbsNode` from Phase 9 design).

Items may belong to a section or directly to BOQ header (sectionId nullable).

---

## 9. BOQ Item

**Entity:** `ConstructionBoqItem`

| Field | Purpose |
|-------|---------|
| `id` | UUID |
| `tenantId` | UUID |
| `boqId` | FK |
| `sectionId` | UUID? |
| `lineNumber` | Int or String — ordering within section |
| `itemCode` | String? — BOQ line code (not necessarily Product SKU) |
| `description` | String — required |
| `unitId` | UUID? — FK → `units_of_measure` (optional but preferred) |
| `unitCode` | String? — denormalized fallback if generic UOM text needed |
| `plannedQuantity` | Decimal(18,4) |
| `unitRate` | Decimal(18,4) |
| `originalAmount` | Decimal(18,4) — stored computed value |
| `costCode` | String? — construction work classification (see §11) |
| `costCenterId` | UUID? — optional universal cost center |
| `productId` | UUID? — **optional** Product reference |
| `category` | Enum? — reuse `ConstructionCostCategory` for analytical grouping |
| `notes` | String? |

### 9.1 BOQ item ≠ Product

A BOQ item represents **planned work** — material, labor, subcontract, equipment, or composite activity.

| Line type | productId | Example |
|-----------|-----------|---------|
| Material | Optional link | Cement bags → Product |
| Labor | null | Masonry man-hours |
| Subcontract | null | Electrical subcontract lump |
| Equipment | null | Crane hire days |

**Rule:** `productId` is never required. Validation: if `productId` set, Product must belong to same tenant and be active.

---

## 10. UOM Strategy

### 10.1 Audit finding

Universal **`UnitOfMeasure`** exists (`units_of_measure` table):

- Tenant-scoped `code`, `name`, `symbol`
- Linked from `Product.unitId`
- Managed via products module API

There is **no** separate generic UOM module outside Products — but the table is already universal within ERP catalog.

### 10.2 Recommendation

| Approach | Phase 9.1 |
|----------|-----------|
| **Primary:** `unitId` → `UnitOfMeasure` | ✅ Reuse when UOM exists |
| **Fallback:** `unitCode` string on item | ✅ For BOQ-only units (e.g. `LS`, `Sum`) without creating Product |
| **New UOM table** | ❌ Do not duplicate |
| **UOM conversion** | ❌ Out of scope |

**Do not require Products module license** merely to reference UOM rows — UOM read access via Construction API should validate tenant ownership of `unitId` directly against `units_of_measure`.

---

## 11. Cost Code vs Cost Center

### 11.1 Critical distinction

| Concept | Owner | Purpose | Example |
|---------|-------|---------|---------|
| **Cost Center** | Business Core (`cost_centers`) | Accounting/reporting dimension; GL posting; project allocation | Project A / Electrical |
| **Cost Code** | Construction commercial classification | BOQ/work breakdown labeling; estimating discipline | `ELE-001` Electrical works |
| **Cost Category** | Construction (`ConstructionCostCategory`) | Analytical class on **actual** cost entries | `material`, `labor`, … |

These are **not identical**.

### 11.2 Recommended Phase 9.1 approach

| Option | Decision |
|--------|----------|
| Separate `ConstructionCostCode` master table | **FUTURE** (Phase 9.1.1 or 9.2 if reporting requires normalization) |
| `costCode` string on BOQ item | **CRITICAL for MVP** — lightweight, extensible |
| `costCenterId` optional FK on BOQ item | **HIGH** — links planned work to accounting dimension |
| Replace Cost Center with Cost Code | ❌ Never |

**Relationship:**

```text
BOQ Item
  ├── costCode: "ELE-001"     (construction work classification — string MVP)
  ├── costCenterId: UUID?     (optional GL/reporting dimension)
  └── category: material|labor|…  (optional link to actual cost taxonomy)
```

When posting actual cost in future phases, `ConstructionCostEntry` may inherit `costCenterId` from BOQ item or contract defaults — **not in 9.1**.

---

## 12. BOQ Calculation

### 12.1 Formula

```text
originalAmount = plannedQuantity × unitRate
```

### 12.2 Decimal rules

| Rule | Implementation |
|------|----------------|
| Storage type | `Prisma.Decimal(18,4)` |
| Computation | `new Prisma.Decimal(qty).mul(rate)` — **never JS `number` arithmetic** |
| Rounding | Round product to **4 decimal places** (`DECIMAL(18,4)` scale) using banker's rounding or half-up — match existing ERP money fields |
| BOQ header total | Sum of item `originalAmount` values using Decimal accumulation |
| Zero quantity | Reject or allow with zero amount — **reject in MVP** (positive qty required) |
| Zero rate | Allow (free items) or reject — **allow zero rate, zero amount** |

Follow patterns from `apps/api/src/modules/pms/ledger/money.util.ts` and `ConstructionCostEntryService`.

### 12.3 Recalculation

- On item create/update: service recalculates `originalAmount` and rolls up `ConstructionBoq.totalOriginalAmount`.
- Approved BOQ: items **immutable** — revision required for changes (§15).

---

## 13. Contract Value vs BOQ Total

### 13.1 Design invariant (recommended)

| Phase | Rule |
|-------|------|
| Contract in `draft` | `originalValue` may be entered manually **or** left zero until BOQ approval |
| BOQ first approval | If contract `originalValue` is zero/null → set to BOQ `totalOriginalAmount` |
| BOQ first approval | If contract `originalValue` already set → **must equal** BOQ total within tolerance (0.01) OR require explicit override permission |
| `pricingModel = unit_price` | Contract value **should be driven by** BOQ total |
| `pricingModel = lump_sum` | Contract value may be agreed independently; BOQ is breakdown — warn if totals differ |
| `pricingModel = cost_plus` | Contract value may exceed BOQ (BOQ = estimated cost, not final price) |

### 13.2 MVP simplification

**Recommended MVP rule:**

> On first BOQ approval for a contract, set `contract.originalValue = boq.totalOriginalAmount` unless user explicitly locked contract value during draft.

Document override as future `construction:contracts:approve-value-override` permission — **not MVP**.

**Do not assume** contract value always equals BOQ — document both paths.

---

## 14. BOQ Status

| Status | Meaning | Editable? |
|--------|---------|-----------|
| `draft` | Work in progress | ✅ Full edit |
| `approved` | Baseline locked | ❌ Immutable |
| `superseded` | Replaced by newer revision | ❌ Read-only |
| `archived` | Terminal | ❌ Read-only |

### 14.1 Transitions

```text
draft     → approved | archived
approved  → superseded (when new revision approved) | archived
superseded → archived
archived  → (terminal)
```

Only **one** BOQ per contract in `approved` status at a time.

---

## 15. Revision Model

### 15.1 Minimal revision (Phase 9.1 MVP)

**Do NOT mutate** approved BOQ rows in place.

Revision flow:

```text
1. Contract has BOQ rev 1 (approved)
2. User creates BOQ rev 2 (draft) — copies structure from rev 1
3. User edits draft rev 2 items
4. On approve rev 2:
   - rev 1 → status superseded
   - rev 2 → status approved
   - rev 2.supersedesBoqId = rev 1.id
   - contract.revisedValue updated (future variations; MVP may update originalValue policy only on first approval)
```

| Field | Purpose |
|-------|---------|
| `revisionNumber` | 1, 2, 3… |
| `supersedesBoqId` | Linked list of revisions |
| `status = superseded` | Historical traceability |

**Not in 9.1:** diff engine, line-level change tracking, approval workflow chains.

### 15.2 Historical integrity

Approved BOQ items are **never updated or deleted**. Corrections require new revision.

---

## 16. Variation Compatibility (Future Boundary)

Variations are **out of scope** for Phase 9.1 but data model must not block them.

**Future model (design only):**

```text
ConstructionVariation
  ├── contractId
  ├── boqItemId? (optional target line)
  ├── variationType: addition | omission | rate_change | quantity_change
  ├── quantityDelta / rateDelta / lumpSumDelta
  └── status: draft | approved | rejected

Approved variation →
  Option A: new BOQ revision incorporating deltas
  Option B: variation register adjusting "current quantity/rate" shadow fields on items
```

**Phase 9.1 preparatory fields:**

- BOQ revision chain (`supersedesBoqId`, `revisionNumber`)
- Contract `revisedValue` column (nullable until variations exist)
- Immutable approved BOQ lines

**Do NOT** implement `ConstructionVariation` table in 9.1.

---

## 17. Finance Boundary

| Action | GL impact in Phase 9.1 |
|--------|-------------------------|
| Create/edit contract | **None** |
| Approve contract | **None** |
| Create/edit/approve BOQ | **None** |

**Do NOT call:**

- `AccountingEngineService`
- `FinancialPostingService`

Contract/BOQ are **planning and commercial master data** — not accounting events.

Future progress certificates (Phase 9.5+) will post via FPS with construction posting rules — separate phase.

---

## 18. Inventory Boundary

| Action | Stock impact |
|--------|--------------|
| BOQ item with optional `productId` | **None** — reference only |
| BOQ create/approve | **None** |
| Material consumption | **Future** — Material Requirement → Inventory issue |

BOQ quantities are **planned**, not issued.

---

## 19. Cost Subledger Boundary

| Data | Layer | Phase 9.1 |
|------|-------|-----------|
| BOQ `originalAmount` | Planned/contractual value | ✅ |
| `ConstructionCostEntry.amount` | Actual operational cost | ✅ (Phase 9.0) |

**Rules:**

- BOQ approval **must NOT** create `ConstructionCostEntry` rows.
- BOQ totals **must NOT** appear in cost subledger.
- Future phases may compare BOQ planned vs actual cost entries for variance reports — read-only analytics.

Clear vocabulary:

| Term | Meaning |
|------|---------|
| **Planned** | BOQ original amounts |
| **Actual** | Construction cost subledger entries |
| **Committed** | Future — open PO value (not 9.1) |
| **Earned** | Future — progress certificates (not 9.1) |

---

## 20. Licensing

Construction Contracts and BOQ remain under the **Construction vertical** perpetual license.

### 20.1 Proposed features (design only — not implemented in audit phase)

| Feature key | Scope |
|-------------|-------|
| `construction.foundation` | ✅ Exists — profile + cost subledger |
| `construction.contracts` | Contract CRUD + lifecycle |
| `construction.boq` | BOQ header/sections/items + revisions |

### 20.2 Dependency behavior

| License | Required for |
|---------|--------------|
| `construction` module | All construction routes |
| `core`, `projects`, `finance`, `party` | Module dependencies (unchanged) |
| `construction.foundation` | Prerequisite gate — profile must exist |
| `construction.contracts` | Contract endpoints |
| `construction.boq` | BOQ endpoints |
| `projects` module | Project/Cost Center reads |
| `finance` module | Module dependency only — **no GL in 9.1** |
| Products module | **Not required** for BOQ with generic UOM text; optional Product link validates product row if present |

**Do not** require Inventory or Sales licenses for BOQ.

Tenant admins **cannot** self-enable — signed license activation only (unchanged).

---

## 21. RBAC (Design Only)

Follow `construction:{feature}:{action}` convention.

### 21.1 Contract permissions

| Permission | Purpose |
|------------|---------|
| `construction:contracts:read` | List/get contracts |
| `construction:contracts:manage` | Create/update contract header |
| `construction:contracts:activate` | Status transitions to active/suspended/completed |
| `construction:contracts:archive` | Archive cancelled/completed contracts |

**MVP merge option:** combine activate into `manage` if permission proliferation is undesirable — design recommends **separate activate** for financial-grade separation; MVP may use single `manage` initially.

### 21.2 BOQ permissions

| Permission | Purpose |
|------------|---------|
| `construction:boq:read` | List/get BOQ, sections, items |
| `construction:boq:manage` | Edit draft BOQ structure |
| `construction:boq:approve` | Approve BOQ / create revisions |

---

## 22. Tenant / Branch Isolation

| Rule | Enforcement |
|------|-------------|
| Tenant isolation | All entities carry `tenantId`; JWT-scoped queries |
| Project/Contract/BOQ same tenant | FK + service validation |
| Branch | Contract inherits `branchId` from Project or default; used for numbering |
| Branch ≠ Site ≠ Warehouse ≠ Project | Do not conflate — sites are Phase 9.2+ |
| Cross-tenant party/project | Reject |

Cost Center validation on BOQ items uses same rules as Phase 9.0 (`PostingDimensionService` pattern) when `costCenterId` is set — project/cost-center consistency, active, not archived.

---

## 23. API Boundary (Design Only — Do Not Implement)

Base: `/api/v1/construction`

### 23.1 Contracts

| Method | Route | Feature | Permission |
|--------|-------|---------|------------|
| GET | `/contracts` | `construction.contracts` | `read` |
| POST | `/contracts` | `construction.contracts` | `manage` |
| GET | `/contracts/:id` | `construction.contracts` | `read` |
| PATCH | `/contracts/:id` | `construction.contracts` | `manage` |
| POST | `/contracts/:id/activate` | `construction.contracts` | `activate` or `manage` |
| POST | `/contracts/:id/suspend` | `construction.contracts` | `activate` or `manage` |
| POST | `/contracts/:id/complete` | `construction.contracts` | `activate` or `manage` |
| POST | `/contracts/:id/archive` | `construction.contracts` | `archive` or `manage` |

Create contract body includes `projectId`, `direction`, `partyId`, `pricingModel`, commercial fields.

**Alternative nesting:** `POST /projects/:projectId/contracts` — acceptable; pick one style in implementation (recommend top-level `/construction/contracts` with `projectId` in body for consistency with cost entries).

### 23.2 BOQ

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/contracts/:contractId/boq` | List BOQ revisions |
| POST | `/contracts/:contractId/boq` | Create draft BOQ (or new revision) |
| GET | `/boq/:id` | Get BOQ header + totals |
| PATCH | `/boq/:id` | Edit draft header |
| POST | `/boq/:id/approve` | Approve BOQ |
| POST | `/boq/:id/revisions` | Create next revision draft from approved |
| GET | `/boq/:id/sections` | List sections |
| POST | `/boq/:id/sections` | Create section |
| PATCH | `/boq/sections/:sectionId` | Edit draft section |
| GET | `/boq/:id/items` | List items (flat or tree) |
| POST | `/boq/:id/items` | Create item |
| PATCH | `/boq/items/:itemId` | Edit draft item |
| DELETE | `/boq/items/:itemId` | Delete draft item only |

**No DELETE** on approved BOQ entities — supersede via revision.

---

## 24. Desktop Boundary (Design Only)

Future navigation under licensed Construction module:

```text
Construction
  ├── Projects        → links to universal /projects (read-only context)
  ├── Contracts       → list/create contract per project
  └── BOQ Editor      → section/item grid for selected contract BOQ
```

- Do **not** replace universal Project or Cost Center screens.
- BOQ editor shows optional Product picker, UOM selector, Cost Center selector, cost code text field.
- No GL, inventory, or cost subledger panels in 9.1 desktop scope.

---

## 25. Test Strategy (Design Only)

Future file: `apps/api/test/construction-contracts-boq.integration.spec.ts`

| Category | Cases |
|----------|-------|
| **Licensing** | Without `construction.contracts` / `construction.boq` → 403 |
| **Profile gate** | Contract rejected if no `ConstructionProjectProfile` |
| **Contract CRUD** | Create customer + subcontractor contracts |
| **Party validation** | Wrong role rejected; cross-tenant party rejected |
| **Tenant isolation** | Cross-tenant project/party blocked |
| **Lifecycle** | Valid/invalid status transitions |
| **Numbering** | `CNT-*`, `BOQ-*` format; branch resolution |
| **BOQ CRUD** | Sections, items, hierarchy |
| **Calculation** | qty × rate; header total rollup; Decimal precision |
| **Product optional** | With/without productId |
| **Cost Center** | Valid/mismatched/archived cost center on item |
| **Project/Contract consistency** | BOQ projectId must match contract |
| **Revision** | Approve rev 1 → create rev 2 → supersede |
| **Immutability** | Approved BOQ item edit rejected |
| **Boundaries** | No `JournalEntry` create; no `InventoryMovement`; no `ConstructionCostEntry` auto-create |
| **Regression** | Existing construction.foundation tests remain green |

Target: **+25–35** new integration tests for Phase 9.1 implementation.

---

## 26. MVP Decision

### 26.1 Component ranking

| Component | Rank | Phase 9.1 MVP? |
|-----------|------|----------------|
| `ConstructionContract` entity + lifecycle | **CRITICAL** | ✅ Yes |
| Contract party role validation | **CRITICAL** | ✅ Yes |
| Contract numbering (`CNT`) | **CRITICAL** | ✅ Yes |
| `ConstructionBoq` header | **CRITICAL** | ✅ Yes |
| `ConstructionBoqSection` | **CRITICAL** | ✅ Yes |
| `ConstructionBoqItem` | **CRITICAL** | ✅ Yes |
| BOQ numbering (`BOQ`) | **CRITICAL** | ✅ Yes |
| Decimal-safe qty × rate calculation | **CRITICAL** | ✅ Yes |
| BOQ revision (minimal supersede chain) | **HIGH** | ✅ Yes |
| Retention metadata on contract | **HIGH** | ✅ Fields only |
| Advance metadata on contract | **HIGH** | ✅ Fields only |
| Payment terms (text) | **MEDIUM** | ✅ Yes |
| Optional `productId` on item | **MEDIUM** | ✅ Yes |
| Optional `costCenterId` on item | **MEDIUM** | ✅ Yes |
| Item-level `costCode` string | **MEDIUM** | ✅ Yes |
| Separate `ConstructionCostCode` master | **FUTURE** | ❌ No |
| Contract value override workflow | **FUTURE** | ❌ No |
| Multi-contract UX polish | **FUTURE** | ⚠️ Data model allows; UI may simplify |
| BOQ import/export | **FUTURE** | ❌ No |
| Variations | **FUTURE** | ❌ No |
| Progress/retention calculations | **FUTURE** | ❌ No |
| Desktop UI | **MEDIUM** | ⚠️ Minimal list/editor if time; API-first acceptable |

### 26.2 Recommended Phase 9.1 delivery scope

**Include:**

1. Unified `ConstructionContract` with customer/subcontractor direction
2. Full contract lifecycle (§4)
3. BOQ header + sections + items
4. Decimal calculation + header rollup
5. Minimal revision model (approve + supersede)
6. Retention/advance/payment terms as **metadata fields**
7. Optional Product, UOM, Cost Center, cost code string on items
8. Licensing features `construction.contracts`, `construction.boq`
9. RBAC permissions (read/manage/approve minimum)
10. Integration tests per §25

**Exclude:**

- Variations, progress, retention accounting, advances accounting
- GL/inventory/cost subledger side effects
- Separate cost code master table
- Construction sites / WBS
- Reports and dashboards

### 26.3 Suggested implementation sub-phases (for approval)

| Sub-phase | Deliverable |
|-----------|-------------|
| **9.1a** | Schema + contract CRUD + lifecycle + licensing/RBAC |
| **9.1b** | BOQ header/sections/items + calculations |
| **9.1c** | BOQ revision + approval immutability + integration tests |

Single Phase 9.1 release acceptable if preferred.

---

## 27. Non-Goals

Phase 9.1 design explicitly excludes:

- Implementation (this document only)
- Variations, progress certificates, retention calculations
- Advance recovery accounting
- Subcontract payments / PO linking
- Material issues / inventory consumption
- Construction GL posting (FPS rules)
- Reports, dashboards, profitability
- Modifications to Finance, Sales, Purchasing, Inventory, PMS
- Separate customer/subcontract contract entities
- Universal BOQ module
- Phase 9.2 (sites/WBS) start

---

## 28. VERDICT

### READY FOR PHASE 9.1 IMPLEMENTATION

**Rationale:**

1. Phase 9.0 Construction Foundation is complete and tested (profile gate, cost subledger, Party roles, licensing).
2. Universal Project, Party, Cost Center, Product/UOM, and DocumentNumberService provide adequate Business Core primitives.
3. No generic contract or BOQ exists — greenfield vertical design with clear boundaries.
4. Finance, Inventory, and cost subledger boundaries are well-defined and avoid double-counting planned vs actual.
5. Revision model is minimal but sufficient for future variations.
6. No architectural blocker identified.

**Conditions for implementation start:**

1. Approve unified `ConstructionContract` model (not split customer/subcontract tables).
2. Approve BOQ revision immutability approach (§15).
3. Approve contract value ↔ BOQ total rules (§13) — recommend BOQ drives value on first approval.
4. Approve MVP scope in §26.2 (cost code as string, no separate master in 9.1).
5. Approve licensing features `construction.contracts` and `construction.boq`.

**Do not implement until explicit product approval of this design.**

---

## Appendix A — Entity Relationship (Target)

```text
Tenant
  └── Project (universal)
        ├── ConstructionProjectProfile (1:1)
        ├── ConstructionContract (1:N)
        │     └── ConstructionBoq (1:N revisions)
        │           ├── ConstructionBoqSection (1:N, optional parent)
        │           └── ConstructionBoqItem (1:N)
        └── ConstructionCostEntry (actual — Phase 9.0, unchanged)

Party ──► ConstructionContract.partyId
Product ──► ConstructionBoqItem.productId (optional)
UnitOfMeasure ──► ConstructionBoqItem.unitId (optional)
CostCenter ──► ConstructionBoqItem.costCenterId (optional)
```

---

## Appendix B — Key File References (Current)

| Area | Path |
|------|------|
| Construction foundation | `apps/api/src/modules/construction/` |
| Phase 9.0 complete | `docs/PHASE_9_0_CONSTRUCTION_FOUNDATION_COMPLETE.md` |
| Phase 9 design | `docs/PHASE_9_CONSTRUCTION_DESIGN.md` |
| Project schema | `packages/database/prisma/schema.server.prisma` |
| Project lifecycle | `apps/api/src/modules/projects/project-lifecycle.ts` |
| Cost entry service | `apps/api/src/modules/construction/construction-cost-entry.service.ts` |
| Dimension validation | `apps/api/src/modules/finance/posting/posting-dimension.service.ts` |
| Document numbering | `apps/api/src/common/services/document-number.service.ts` |
| Decimal utilities | `apps/api/src/modules/pms/ledger/money.util.ts` |
| UOM / Product | `schema.server.prisma` — `UnitOfMeasure`, `Product` |
| License catalog | `apps/api/src/modules/license/catalog/` |
| Construction tests | `apps/api/test/construction.integration.spec.ts` |

---

**STOP — Phase 9.1 audit + design complete. No code changes made.**
