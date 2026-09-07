# Phase 9 — Construction Vertical Design

**Status:** Audit + Architecture Design ONLY — 2026-09-07  
**Scope:** Design document only — **no implementation, no migrations, no schema changes, no code modifications**  
**Prerequisites:** Phases 2–8.3.1 complete ✅ (259/259 tests, typecheck PASS)

> **Hard STOP:** Do not implement Construction in this phase. Await explicit product approval and sub-phase breakdown before any code.

---

## Executive Summary

Fratelanza is a **commercial perpetual-license Business Platform**. Construction must ship as a **separately licensable vertical module** — not a second ERP, not a fork of Projects, and not a rewrite of Sales/Purchasing/Inventory/Finance.

**Repository verdict:** The platform foundation is **ready for Construction design approval**. Universal **Projects**, **Cost Centers**, **Finance dimensions**, **Party**, **Sales**, **Purchasing**, **Inventory**, and **FinancialPostingService** pilots exist. **Zero Construction vertical code** exists today — only catalog stubs and architecture planning.

Construction builds **on top of** Business Core:

```text
Platform Core
      ↓
Business Core
      ├── Party
      ├── Sales
      ├── Purchasing
      ├── Inventory
      ├── Finance (Universal GL + FinancialPostingService)
      ├── Projects
      └── Cost Centers
            ↓
      Construction Vertical
      ├── BOQ / Contract baseline
      ├── Sites & WBS
      ├── Progress & certificates
      ├── Variations & change orders
      ├── Retention
      ├── Subcontracts
      ├── Material issues to project
      └── Project cost subledger + profitability
```

**Key architectural bet (same as PMS):** Construction operational truth lives in a **vertical subledger** (project cost entries, progress state, retention balances). Universal GL receives **explicit FinancialPostingService events** with `projectId` / `costCenterId` dimensions — never silent double-entry from CRUD.

---

## 1. Repository Audit

### 1.1 Search methodology

Full-repository search performed for: construction, contractors, subcontractors, sites, jobs, work orders, contracts, BOQ, bill of quantities, progress claims, certificates, retention, advance payments, mobilization, variation orders, change orders, material issues/consumption, labor, equipment, site expenses, project cost, cost codes, budgets, commitments, profitability, forecasting, and related terms.

Also inspected: Prisma schema, all API modules, license catalogs, posting rules, RBAC seed, integration tests, desktop routes, and phase completion docs.

### 1.2 What EXISTS (Construction-relevant foundation)

| Area | State | Location / notes |
|------|-------|------------------|
| **Universal Project** | ✅ Implemented | `projects` table, `ProjectsService`, lifecycle, `PRJ` numbering |
| **Universal Cost Center** | ✅ Implemented | `cost_centers` table, hierarchy, optional `projectId` |
| **GL dimensions** | ✅ Implemented | `journal_lines.projectId`, `costCenterId`; FK migration Phase 8.1 |
| **PostingDimensionService** | ✅ Implemented | Validates project/cost center with `FOR UPDATE`; branch + project/cost-center consistency |
| **FinancialPostingService** | ✅ Implemented | Rule + line modes; idempotency; caller-owned transaction |
| **Sales invoice post → FPS** | ✅ Pilot | `UNIVERSAL_FINANCE_SALES_PILOT_ENABLED`; rule `sales/invoice/post`; optional dimensions on post body |
| **PO receive → FPS** | ✅ Pilot | `UNIVERSAL_FINANCE_PILOT_ENABLED`; rule `purchasing/order/receive`; optional dimensions on receive body |
| **Party registry** | ✅ Implemented | `Party`, roles (`customer`, `supplier`), contacts, legacy adapters |
| **Project client link** | ✅ Implemented | `Project.customerPartyId` → Party (not legacy Customer) |
| **Inventory ledger** | ✅ Implemented | Weighted average; movement types incl. `sale`, `purchase`, `adjustment` |
| **Commercial licensing** | ✅ Implemented | Perpetual + time-limited; Ed25519; module + feature entitlements |
| **Projects module license** | ✅ `available: true` | Feature keys `projects.projects`, `projects.cost-centers` |
| **Construction module stub** | ⚠️ Catalog only | `construction` key, `available: false`, depends on `core`, `projects` |
| **Document numbering** | ✅ Platform service | `PRJ`, `PO`, `INV`, `JE`, etc. — no construction types yet |
| **AuditService** | ✅ Platform pattern | Entity/action logging on Projects, Party, etc. |
| **Desktop Projects UI** | ✅ Minimal | `ProjectsPage`, `CostCentersPage`; Sales post has dimension selectors when sales pilot enabled |

### 1.3 What DOES NOT EXIST (Construction vertical)

| Area | Status |
|------|--------|
| `apps/api/src/modules/construction/` | ❌ Zero code |
| Construction schema (BOQ, sites, contracts, progress, retention, variations) | ❌ |
| `construction.*` feature catalog entries | ❌ |
| `construction:*` RBAC permissions | ❌ |
| Party roles `contractor`, `subcontractor` | ❌ Enum has `customer`, `supplier` only |
| Project budgets / budget lines | ❌ Deferred from Phase 8 |
| Project cost subledger | ❌ Architecture planned, not implemented |
| Commitments (reserved budget / open PO value) | ❌ |
| Construction posting rules | ❌ No rules under `sourceModule: construction` |
| Construction COA roles (WIP, retention, contract revenue) | ❌ Only generic roles in `ACCOUNT_ROLES` |
| `projectId` on commercial documents | ❌ Dimensions at GL post time only (not persisted on invoice/PO) |
| Inventory project allocation | ❌ `InventoryMovement` has no project/cost-center fields |
| Material issue to project/site | ❌ |
| Progress billing / certificates | ❌ |
| Retention hold/release | ❌ |
| Variation orders | ❌ |
| Subcontractor contracts / payments | ❌ |
| Project profitability / forecasting reports | ❌ |
| Attachments / document registry | ❌ Platform-wide gap |
| Construction desktop UI | ❌ |

### 1.4 Misleading references (not Construction)

| Reference | Meaning |
|-----------|---------|
| `construction` in `module-catalog.ts` | License placeholder — not implemented |
| `department` on `JournalLine` | Free-text dimension — not Cost Center master |
| `department` on PMS Service/Encounter | Clinical field — unrelated |
| Architecture doc §9 target models | Design intent from Phase 1.5 — partially superseded by Phase 8 delivery |
| Inventory `movementType: 'sale'` | Generic ERP — not site material issue |
| `Project` without `projectType` | Universal container — Construction does not get a second project table |

### 1.5 Current finance migration state (critical for Construction)

| Event | Default path | Dimension-aware path |
|-------|--------------|----------------------|
| Sales invoice post | `AccountingEngineService` (no dimensions) | FPS `sales/invoice/post` when `UNIVERSAL_FINANCE_SALES_PILOT_ENABLED=true` |
| PO receive | `AccountingEngineService` (no dimensions) | FPS `purchasing/order/receive` when `UNIVERSAL_FINANCE_PILOT_ENABLED=true` |
| Sales payment | `AccountingEngineService` always | Not migrated |
| POS | `AccountingEngineService` always | Not migrated |

**Construction implication:** Project costing via GL dimensions **requires FPS path** for migrated commercial events. Legacy `AccountingEngineService` cannot tag `projectId`/`costCenterId` on journal lines today.

**Pilot flags are deployment toggles**, not commercial entitlements. Construction customers still need Finance module + appropriate feature entitlements regardless of pilot flag state at implementation time.

---

## 2. Architectural Positioning

### 2.1 Construction is a vertical, not Business Core

| Layer | Owns | Does NOT own |
|-------|------|--------------|
| **Platform Core** | Auth, RBAC, tenants, branches, audit, numbering, licensing | Industry workflows |
| **Business Core** | Party, Sales, Purchasing, Inventory, Finance GL, **Project**, **Cost Center** | BOQ, sites, progress certificates, retention |
| **Construction Vertical** | BOQ, contracts, sites/WBS, progress, variations, retention, subcontracts, project cost subledger, construction reports | Duplicate project master, duplicate GL, duplicate inventory engine |

**Rule:** If two verticals would need it unchanged → Business Core. If construction-specific → Construction vertical.

### 2.2 Dependency graph (mandatory)

```text
Construction
  → requires: core, projects, finance, party
  → uses: sales, purchasing, inventory (commercial ops — not hard module deps in catalog today)
  ↛ must NOT import: pms
  ↛ must NOT import: other verticals

Finance
  ↛ must NOT import: construction entities

Sales / Purchasing / Inventory
  ↛ must NOT import: construction entities
  → may accept optional dimension/project context at integration boundaries (already proven on post/receive)
```

Vertical modules call **down** into Business Core via explicit service contracts — same pattern as PMS ledger → optional GL.

### 2.3 Subledger → GL pattern (PMS reference)

PMS established the approved pattern:

```text
Operational document (Charge, Progress Certificate, Material Issue, …)
  → Vertical subledger entry (append-only, project-scoped truth)
  → FinancialPostingService.post() (optional/configurable, same transaction)
       → JournalEntry + JournalLines with dimensions
```

| Question | Answer |
|----------|--------|
| Can project cost subledger coexist with GL? | **Yes** — operational project reports vs financial statements |
| What stays Construction-specific? | BOQ, sites, progress state, retention balances, variation history |
| What stays universal? | COA, JournalEntry, posting rules, fiscal periods |
| Double posting? | **Forbidden** — one GL event per business event; idempotency keys required |

---

## 3. Commercial Licensing Model

### 3.1 Perpetual / one-time license (immutable)

Fratelanza sells:

- Platform license (core)
- Business modules independently (finance, sales, purchasing, inventory, projects, …)
- Vertical modules independently (construction, pms, …)

**No mandatory SaaS subscription.** Construction is a **separately purchased vertical** with perpetual or time-limited module term — same as existing `LicenseModuleEntitlement.termType`.

### 3.2 Proposed module catalog (design)

```typescript
construction: {
  key: 'construction',
  tier: 'vertical',
  available: false,  // flip to true only when vertical ships
  dependencies: ['core', 'projects', 'finance', 'party'],
}
```

**Rationale for dependencies:**

| Module | Why required |
|--------|--------------|
| `core` | Platform |
| `projects` | Universal project + cost center master |
| `finance` | GL posting, dimensions, fiscal periods |
| `party` | Client, contractor, subcontractor identity |

**Soft dependencies (used, not necessarily catalog-hard):**

| Module | Usage |
|--------|-------|
| `purchasing` | Material procurement, subcontract POs |
| `inventory` | Stock, material issues |
| `sales` | Client billing / progress invoicing where applicable |

Do **not** require Inventory license merely because a transaction moves stock — follow Phase 8.3 licensing precedent (Sales post does not require Inventory module entitlement for COGS side effect). Apply same principle to Construction material flows.

### 3.3 Proposed feature catalog (design)

Granular features enable partial Construction SKUs:

| Feature key | Capability |
|-------------|------------|
| `construction.boq` | Bill of quantities + contract baseline |
| `construction.sites` | Sites, WBS hierarchy |
| `construction.progress` | Progress measurement + certificates |
| `construction.variations` | Variation / change orders |
| `construction.retention` | Retention hold, release, statements |
| `construction.subcontracts` | Subcontractor agreements + AP linkage |
| `construction.materials` | Material requisitions / issues to project |
| `construction.cost-ledger` | Project cost subledger + profitability |
| `construction.reports` | Construction operational reports |

Features gate API routes via `@RequireFeature()` — same as `projects.projects`, `finance.financial-posting`.

### 3.4 Licensing enforcement chain

```text
JWT
  → EntitlementGuard (@RequireModule('construction'), @RequireFeature('construction.*'))
  → PermissionsGuard (construction:* RBAC)
  → Business operation
```

License-exempt routes remain limited to core/settings/license admin — Construction routes are **never** license-exempt.

---

## 4. Domain Model Design

### 4.1 Universal vs Construction-specific split

| Concept | Owner | Phase |
|---------|-------|-------|
| Project master | Business Core (`projects`) | ✅ Exists |
| Cost Center master | Business Core (`projects`) | ✅ Exists |
| Party identity | Business Core (`party`) | ✅ Exists |
| Client on project | Business Core (`Project.customerPartyId`) | ✅ Exists |
| **Project Budget** (planned vs actual envelope) | Business Core extension **or** Construction | **Recommend Business Core** — other verticals need budgets |
| **BOQ** (bill of quantities) | Construction | Phase 9.x |
| **Construction Contract** (client contract value, terms) | Construction | Phase 9.x |
| **Site** | Construction | Phase 9.x |
| **WBS / Activity** | Construction | Phase 9.x |
| **Progress Certificate** | Construction | Phase 9.x |
| **Variation Order** | Construction | Phase 9.x |
| **Retention Schedule** | Construction | Phase 9.x |
| **Subcontract** | Construction | Phase 9.x |
| **Material Requisition / Issue** | Construction (+ Inventory movement) | Phase 9.x |
| **Project Cost Entry** (subledger) | Construction (or shared Projects subledger) | Phase 9.x |
| GL Journal | Finance | ✅ Exists |

### 4.2 Recommended Construction entities (conceptual — not schema)

#### 4.2.1 `ConstructionContract`

Links a universal **Project** to commercial terms.

| Field | Purpose |
|-------|---------|
| `tenantId`, `projectId` | Scope |
| `code` | `CON-YYYY-NNNNNN` |
| `clientPartyId` | FK → Party (may mirror `Project.customerPartyId`) |
| `contractType` | `lump_sum`, `unit_price`, `cost_plus`, … |
| `originalValue`, `revisedValue` | Decimal — revised includes approved variations |
| `currency` | Default tenant currency MVP |
| `startDate`, `endDate` | Contract period |
| `retentionPercent`, `retentionCap` | Default retention policy |
| `advancePaymentAmount`, `advanceRecovered` | Mobilization / advance recovery tracking |
| `status` | `draft`, `active`, `completed`, `closed`, `cancelled` |

**One primary contract per project** for MVP; multi-contract projects deferred.

#### 4.2.2 `BillOfQuantities` (BOQ)

| Field | Purpose |
|-------|---------|
| `tenantId`, `projectId`, `contractId` | Scope |
| `code` | `BOQ-YYYY-NNNNNN` |
| `version` | Integer — BOQ revisions |
| `status` | `draft`, `approved`, `superseded` |
| `lines[]` | See BOQ line |

**BOQ line:**

| Field | Purpose |
|-------|---------|
| `lineNumber`, `description` | |
| `unit`, `quantity`, `unitRate` | BOQ pricing |
| `costCenterId?` | Optional link to universal cost center |
| `wbsNodeId?` | Optional link to WBS |
| `amount` | `quantity × unitRate` (Decimal) |

BOQ is **vertical** — not a universal Projects feature. Budget vs actual compares BOQ to cost subledger + commitments.

#### 4.2.3 `ConstructionSite`

| Field | Purpose |
|-------|---------|
| `tenantId`, `projectId` | A project may have multiple sites |
| `code`, `name`, `address` | |
| `branchId?`, `warehouseId?` | Optional link to branch + site warehouse |
| `status` | `active`, `closed` |

Sites are **not** branches. A branch is org structure; a site is job location / yard.

#### 4.2.4 `WbsNode` (Work Breakdown Structure)

| Field | Purpose |
|-------|---------|
| `tenantId`, `projectId`, `siteId?` | Hierarchy scope |
| `parentId?` | Tree |
| `code`, `name` | |
| `costCenterId?` | Map WBS leaf to cost center |

#### 4.2.5 `ProgressCertificate` (Interim Payment Certificate)

| Field | Purpose |
|-------|---------|
| `tenantId`, `projectId`, `contractId` | |
| `code` | `IPC-YYYY-NNNNNN` |
| `certificateDate`, `periodFrom`, `periodTo` | |
| `grossAmount`, `previousCertified`, `thisPeriod`, `retentionHeld`, `netPayable` | Decimals |
| `status` | `draft`, `submitted`, `approved`, `posted`, `cancelled` |
| `lines[]` | BOQ line references + measured qty/value |

Posting event (design): `construction/progress_certificate/post` → DR AR / CR Contract Revenue (+ retention lines).

#### 4.2.6 `VariationOrder`

| Field | Purpose |
|-------|---------|
| `tenantId`, `projectId`, `contractId` | |
| `code` | `VAR-YYYY-NNNNNN` |
| `type` | `addition`, `omission`, `substitution`, `dayworks` |
| `amount`, `approvedAt` | |
| `status` | `draft`, `approved`, `rejected`, `cancelled` |

Approved variations update `ConstructionContract.revisedValue` and optionally BOQ revision.

#### 4.2.7 `RetentionEntry`

Append-only retention movements linked to certificates or manual adjustments:

| Field | Purpose |
|-------|---------|
| `tenantId`, `projectId`, `contractId` | |
| `sourceType`, `sourceId` | Certificate or payment |
| `direction` | `hold`, `release` |
| `amount` | Decimal |
| `balanceAfter` | Running retention balance (cached pattern like PMS) |

#### 4.2.8 `Subcontract`

| Field | Purpose |
|-------|---------|
| `tenantId`, `projectId` | |
| `subcontractorPartyId` | FK → Party (requires `subcontractor` role) |
| `code` | `SUB-YYYY-NNNNNN` |
| `scope`, `value`, `retentionPercent` | |
| `status` | `draft`, `active`, `completed`, `closed` |
| `purchaseOrderId?` | Optional link to Purchasing PO |

Subcontractor payments flow through **Purchasing/AP** — Construction owns contract state, not duplicate payment tables.

#### 4.2.9 `MaterialRequisition` / `MaterialIssue`

| Field | Purpose |
|-------|---------|
| `tenantId`, `projectId`, `siteId?`, `warehouseId` | |
| `lines[]` | `productId`, `quantity`, `costCenterId?` |
| `status` | `draft`, `issued`, `cancelled` |
| `inventoryMovementIds[]` | Links to `InventoryMovement` rows |

Issue calls existing `InventoryLedgerService.applyMovement()` with `movementType: 'adjustment'` or new `'project_issue'` type (design decision — prefer **new movement type** for traceability).

#### 4.2.10 `ProjectCostEntry` (subledger)

Append-only operational cost truth — **Construction vertical** (or future Business Core if shared):

| Field | Purpose |
|-------|---------|
| `tenantId`, `projectId`, `costCenterId?` | |
| `entryDate`, `amount`, `direction` | `cost`, `revenue`, `adjustment` |
| `category` | `materials`, `labor`, `subcontract`, `equipment`, `overhead`, … |
| `sourceModule`, `sourceType`, `sourceId` | Traceability |
| `description` | |
| `glJournalEntryId?` | Optional link after FPS post |

**Pattern:** Same invariants as PMS ledger — caller-owned transaction, append-only, idempotent source identity.

### 4.3 Party extensions (design)

Add to `PartyRoleType` enum (additive migration):

```prisma
enum PartyRoleType {
  customer
  supplier
  contractor      // general contractor (often client-facing org)
  subcontractor   // downstream trade contractor
}
```

**Rules:**

- Subcontractor Party may also have `supplier` role → links to legacy `Supplier` via existing adapter for PO/AP
- Do **not** merge Party with Customer/Supplier tables
- Construction documents reference **Party**, resolve to Supplier through adapter at Purchasing boundary

---

## 5. Integration with Business Core

### 5.1 Projects + Cost Centers

| Integration | Design |
|-------------|--------|
| Every Construction contract | Must reference existing `Project` in `draft|active|on_hold|completed` |
| BOQ lines | Optional `costCenterId` — validated via `PostingDimensionService` rules |
| WBS | Maps to cost centers — no duplicate cost code master |
| Project lifecycle | Construction contract activation may require `Project.status = active` |
| Archive | Cannot archive Project with open Construction contracts (validation in Construction service) |

**Do not add** `projectType: construction` to universal Project in MVP — Construction vertical presence implies construction context. Optional `projectType` enum is a Business Core enhancement deferred until a second vertical needs it.

### 5.2 Sales (client billing)

| Flow | Design |
|------|--------|
| Progress certificate → client invoice | Construction generates **Sales Invoice** via Business Core Sales API/service OR Construction posts AR directly via FPS |
| **Recommended MVP** | Progress certificate posts GL via FPS (`construction/progress_certificate/post`); optional Phase 9.x bridge creates Sales Invoice for AR aging compatibility |
| Dimensions | All certificate GL lines carry `projectId` + `costCenterId` |
| Pilot flag | Construction GL **must use FPS directly** — not legacy AccountingEngine |

Sales module entitlement required only if using Sales Invoice bridge — not for FPS-only certificate posting.

### 5.3 Purchasing (materials + subcontract)

| Flow | Design |
|------|--------|
| Material procurement | Standard PO → receive with `dimensions: { projectId, costCenterId }` on receive (FPS pilot) |
| Subcontract PO | PO linked to `Subcontract`; supplier resolved via Party → Supplier adapter |
| Commitments | Open PO unreceived value + approved subcontracts → commitment register (Construction) |
| GRN / receive | Existing `PurchasingService.receiveOrder()` — **do not fork receive logic** |

**Gap today:** PO header has no persisted `projectId`. Phase 9 should add **optional project/cost-center on PO** (Business Core extension) OR require dimensions at receive time only (current Phase 8.2 pattern). **Recommend:** persist on PO at creation for commitment accuracy.

### 5.4 Inventory (materials)

| Flow | Design |
|------|--------|
| Site warehouse | Optional `ConstructionSite.warehouseId` |
| Material issue | `InventoryLedgerService.applyMovement()` — negative qty from warehouse |
| Cost | Weighted average at issue time → `ProjectCostEntry` at unit cost |
| GL | Optional FPS rule `construction/material_issue/post` → DR Project WIP / CR Inventory |
| Stock insufficiency | Same rollback as Sales — transaction boundary |

**Do not** add project fields to `StockBalance` — project attribution lives on movements + cost entries.

### 5.5 Finance (Universal GL)

#### 5.5.1 New account roles (design)

Extend `ACCOUNT_ROLES` / tenant role mappings:

| Role | Purpose | Suggested default code |
|------|---------|------------------------|
| `contract_revenue` | Revenue from progress certificates | 4100 |
| `contract_receivable` | AR from certificates (may alias `accounts_receivable`) | 1100 |
| `retention_receivable` | Retention held from client | 1110 |
| `work_in_progress` | Capitalized project costs | 1300 |
| `retention_payable` | Retention owed to subcontractors | 2010 |
| `advance_payment_received` | Client mobilization / advance | 2300 |
| `advance_payment_recovery` | Offset against certificates | contra |

Roles are tenant-mapped — not hardcoded in vertical services.

#### 5.5.2 Proposed posting rules (design)

| sourceModule | sourceType | event | Semantics |
|--------------|------------|-------|-----------|
| `construction` | `progress_certificate` | `post` | DR AR / DR Retention Receivable / CR Contract Revenue |
| `construction` | `retention` | `release` | DR Retention Receivable / CR AR (or cash on payment) |
| `construction` | `material_issue` | `post` | DR WIP / CR Inventory |
| `construction` | `subcontract_accrual` | `post` | DR WIP / CR AP or Subcontract liability |
| `construction` | `variation` | `approve` | Adjustment to WIP / revenue per policy (TBD) |
| `purchasing` | `order` | `receive` | ✅ Exists — use with project dimensions |
| `sales` | `invoice` | `post` | ✅ Exists — use for client invoice bridge |

All Construction rules:

- Require `FinancialPostingService` (never AccountingEngineService)
- Accept `PostingDimensions` on every line
- Use idempotency: `sourceModule=construction`, `sourceType`, `sourceId`, `sourceEvent`

#### 5.5.3 Fiscal periods

Construction postings must respect existing fiscal period open/close guards in FPS — same as Sales/Purchasing pilots.

### 5.6 Party

| Role | Construction use |
|------|------------------|
| `customer` | Project client (via `Project.customerPartyId`) |
| `subcontractor` | Subcontract counterparty |
| `supplier` | Material vendor (via legacy Supplier link) |
| `contractor` | Optional — tenant's own contracting entity on multi-entity setups |

---

## 6. Transaction & Concurrency Design

### 6.1 Transaction boundaries (mandatory)

Each posting operation follows the proven pattern:

```text
BEGIN (single prisma.$transaction)
  1. Load + validate document state
  2. Validate dimensions (PostingDimensionService)
  3. Vertical subledger write (ProjectCostEntry, RetentionEntry, …)
  4. Inventory movement (if applicable)
  5. FinancialPostingService.post(…, tx)
  6. Update document status + cached balances
COMMIT
```

**No nested transactions. No outbox/async accounting in MVP.**

### 6.2 Idempotency

Use FPS built-in identity:

```typescript
sourceModule: 'construction'
sourceType: 'progress_certificate' | 'material_issue' | …
sourceId: document.id
sourceEvent: 'post' | 'approve' | 'release'
```

Duplicate post attempts must not create duplicate journals — same as Sales Phase 8.3.

### 6.3 Concurrency

- Document status guards (`draft` → `posted`) prevent double post
- PostgreSQL row locks on contract/certificate during post
- `FOR UPDATE` on project/cost center during dimension validation (existing)

---

## 7. RBAC Design

### 7.1 Permission namespace

Format: `construction:{feature}:{action}`

| Permission | Action |
|------------|--------|
| `construction:contracts:read` | List/get contracts |
| `construction:contracts:manage` | Create/update/activate |
| `construction:boq:read` | View BOQ |
| `construction:boq:manage` | Edit/approve BOQ |
| `construction:sites:read` | View sites/WBS |
| `construction:sites:manage` | Manage sites/WBS |
| `construction:progress:read` | View certificates |
| `construction:progress:post` | Approve/post certificates |
| `construction:variations:read` | View variations |
| `construction:variations:approve` | Approve variations |
| `construction:retention:read` | Retention statements |
| `construction:retention:release` | Release retention |
| `construction:subcontracts:read` | View subcontracts |
| `construction:subcontracts:manage` | Manage subcontracts |
| `construction:materials:read` | View requisitions/issues |
| `construction:materials:issue` | Post material issues |
| `construction:cost-ledger:read` | Project cost subledger |
| `construction:reports:read` | Construction reports |

Separate **read** vs **post/approve** for financial mutations — mirror `finance:posting:execute` separation.

### 7.2 Role templates (design)

| Role | Permissions |
|------|-------------|
| Site Engineer | materials read/issue, progress read, sites read |
| Project Manager | contracts, boq, variations approve, progress read |
| Quantity Surveyor | boq manage, variations manage, progress post |
| Construction Accountant | retention, cost-ledger, reports, progress post |
| Admin | all `construction:*` |

Seed templates in `seed.ts` — not hardcoded in services.

---

## 8. Document Numbering

Proposed new `documentType` entries for `DocumentNumberService`:

| documentType | Prefix | Entity |
|--------------|--------|--------|
| `CON` | CON | Construction contract |
| `BOQ` | BOQ | Bill of quantities |
| `SITE` | SITE | Site (optional — or use manual site codes) |
| `IPC` | IPC | Interim payment / progress certificate |
| `VAR` | VAR | Variation order |
| `SUB` | SUB | Subcontract |
| `MRI` | MRI | Material requisition/issue |

Numbering: `(tenantId, branchId, documentType, fiscalYear)` — use project default branch or contract branch; **never NULL branchId** on upsert (Phase 1c invariant).

Cost center codes remain **manual** (unchanged).

---

## 9. API Surface (Conceptual)

Base: `/api/v1/construction/*`

| Area | Routes (design) |
|------|-----------------|
| Contracts | `GET/POST /construction/contracts`, `GET/PATCH /construction/contracts/:id`, `POST …/activate` |
| BOQ | `GET/POST /construction/contracts/:id/boq`, `POST …/boq/:id/approve` |
| Sites | `GET/POST /construction/projects/:projectId/sites`, WBS under site |
| Progress | `GET/POST /construction/progress-certificates`, `POST …/:id/post` |
| Variations | `GET/POST /construction/variations`, `POST …/:id/approve` |
| Retention | `GET /construction/projects/:projectId/retention`, `POST …/release` |
| Subcontracts | `GET/POST /construction/subcontracts` |
| Materials | `GET/POST /construction/material-requisitions`, `POST …/:id/issue` |
| Cost ledger | `GET /construction/projects/:projectId/cost-entries` |
| Reports | `GET /construction/reports/project-profitability`, `…/boq-vs-actual`, `…/commitments` |

All routes:

- `@RequireModule('construction')`
- `@RequireFeature('construction.<area>')`
- `@RequirePermissions('construction:…')`
- `@TenantId()` scoping

---

## 10. Desktop UI (Conceptual)

Minimal MVP screens (Electron — same patterns as ProjectsPage):

| Screen | Gated by |
|--------|----------|
| Construction dashboard | `construction.reports` |
| Contract + BOQ editor | `construction.contracts`, `construction.boq` |
| Progress certificates | `construction.progress` |
| Material issue | `construction.materials` |
| Project profitability | `construction.cost-ledger`, `construction.reports` |

Use `LicensedRoute` + entitlement snapshot from settings — same as Projects/Sales.

**Do not redesign** existing Sales/Purchasing pages in Construction phase — optional dimension selectors remain on post/receive only.

---

## 11. Reporting Architecture

Three layers (from Phase 1.5 §17):

| Layer | Construction examples | Source |
|-------|----------------------|--------|
| **Operational** | BOQ vs actual, progress summary, retention statement, site material consumption | Construction tables + subledger |
| **Subledger** | Project cost breakdown by category/cost center | `ProjectCostEntry` |
| **Financial** | Project P&L from GL | `journal_lines` filtered by `projectId` |

**Rule:** Operational reports **never require GL**. Financial project P&L **never requires Construction entity joins** beyond dimension filter on GL.

---

## 12. Prerequisites Before Implementation

| Prerequisite | Status | Blocker? |
|--------------|--------|----------|
| Universal Projects + Cost Centers | ✅ Complete | No |
| Finance dimensions + validation | ✅ Complete | No |
| FinancialPostingService | ✅ Complete | No |
| Sales/PO FPS pilots | ✅ Complete (flags default OFF) | **Soft** — Construction must use FPS; recommend enabling pilots or completing full migration before Construction GL go-live |
| Project Budget (Business Core) | ❌ Missing | **Soft** — BOQ can serve as baseline without formal Budget entity in MVP |
| Party contractor/subcontractor roles | ❌ Missing | **Yes** for subcontract module |
| Construction module + features in catalog | ❌ Stub only | **Yes** |
| Project cost subledger | ❌ Missing | **Yes** for profitability |
| Persist project on PO (optional) | ❌ Missing | **Soft** — receive-time dimensions suffice for MVP |

**Recommendation:** Do not start Construction implementation until Phase 9 design is approved **and** FPS path is the agreed default for all project-cost GL events (either global pilot enablement or Construction-only FPS requirement enforced in code).

---

## 13. Recommended Implementation Sub-Phases

Design-only sequencing — **not approved for execution**:

| Sub-phase | Deliverable | Depends on |
|-----------|-------------|------------|
| **9.0 Foundation** | Module shell, licensing, RBAC seed, Party contractor roles, `construction` catalog `available: true` | Design approval |
| **9.1 Contracts + BOQ** | Contract + BOQ CRUD, link to Project, audit, numbering | 9.0 |
| **9.2 Sites + WBS** | Site master, WBS tree, warehouse link | 9.1 |
| **9.3 Project cost subledger** | Append-only cost entries, category taxonomy, read API | 9.1 |
| **9.4 Materials** | Requisition/issue, inventory integration, WIP posting rule | 9.2, 9.3, Inventory |
| **9.5 Progress + Revenue** | Progress certificates, FPS posting rules, retention hold | 9.1, Finance |
| **9.6 Variations** | Variation orders, contract revised value, BOQ revision | 9.1 |
| **9.7 Subcontracts** | Subcontract entity, Party subcontractor, PO link | 9.0 Party roles, Purchasing |
| **9.8 Retention release** | Retention statements, release posting | 9.5 |
| **9.9 Reports + Desktop** | Profitability, BOQ vs actual, commitments, minimal UI | 9.3–9.8 |
| **9.10 Hardening** | Integration tests, concurrency, licensing, full regression | All |

**Do not attempt single-big-bang Construction delivery.**

---

## 14. Non-Goals (Phase 9 design scope)

Do **not** include in Construction vertical design implementation:

- Rewriting `AccountingEngineService`
- Replacing Universal Projects with Construction-specific project tables
- Merging Party with Customer/Supplier/Patient
- Full Sales/Purchasing/Inventory rewrite
- Multi-currency contracts (design fields; implement later)
- Payroll / HR labor timesheets (separate vertical or Phase 10+)
- Equipment fleet management
- BIM / CAD integration
- Document attachments platform (unless Platform Core delivers first)
- SaaS subscription billing
- Offline SQLite Construction sync
- POS integration
- PMS integration

---

## 15. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| GL without dimensions on legacy path | **Critical** | Construction uses FPS only; block AccountingEngine in vertical |
| BOQ vs Budget duplication | **High** | BOQ = vertical; Budget = Business Core extension — clear ownership doc |
| PO without persisted project | **High** | Add optional `projectId` on PO in Business Core before commitments |
| Inventory movement without project trace | **High** | New movement type + reference to material issue |
| Retention accounting complexity | **High** | Separate account roles; append-only retention subledger |
| Scope creep (full ERP replacement) | **High** | Vertical boundary reviews; feature catalog gating |
| Pilot flag confusion | **Medium** | Construction docs state FPS requirement explicitly |
| Party role proliferation | **Medium** | Add only contractor/subcontractor; reuse supplier for AP |
| Performance on cost subledger | **Medium** | Index `(tenantId, projectId, entryDate)`; paginate reports |
| Licensing SKU complexity | **Low** | Feature catalog enables partial Construction packages |

---

## 16. Open Questions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| Q1 | Project Budget in Business Core vs Construction? | A) Business Core B) Construction-only | **A** — professional services also need budgets |
| Q2 | Progress certificate → Sales Invoice bridge? | A) FPS only B) Auto Sales Invoice C) Optional tenant setting | **C** — default FPS only; optional bridge |
| Q3 | Persist `projectId` on PO/Invoice headers? | A) Post-time only B) Header fields | **B** for commitments; post-time dimensions remain |
| Q4 | New inventory movement type `project_issue`? | A) Reuse `adjustment` B) New type | **B** — audit traceability |
| Q5 | Single vs multi contract per project? | MVP single | **Single** for MVP |
| Q6 | WIP capitalization vs expense projects? | Policy per contract type | Tenant setting on contract |
| Q7 | Enable finance pilots globally before Construction? | A) Yes B) Construction forces FPS internally | **B** internally; pilots for commercial ops |
| Q8 | Arabic / EN document labels | Both | Follow localization package pattern |

---

## 17. Explicit Statements

- **Phase 9 is audit + design only.** No code, migrations, or tables were created in this document.
- **Construction is a separately licensable vertical module** on perpetual/one-time license — not a SaaS subscription.
- **Construction is not a second ERP.** It uses Business Core Sales, Purchasing, Inventory, Finance, Projects, Party.
- **Universal Projects and Cost Centers are not replaced** — Construction links to them.
- **PMS, POS, and legacy unmigrated accounting paths are out of scope.**
- **FinancialPostingService is the mandatory GL path for Construction** — not AccountingEngineService.
- **Phase 8.3.1 regression triage cleared the platform for Construction evaluation** — implementation requires separate approval per sub-phase.

---

## 18. Audit Evidence Summary

| Search area | Files inspected | Finding |
|-------------|-----------------|---------|
| Construction code | `apps/api/src/modules/**` | No construction module |
| Schema | `packages/database/prisma/schema.server.prisma` | Project, CostCenter, JournalLine dimensions exist; no BOQ/sites/etc. |
| Posting rules | `posting-rule.service.ts` | sales, purchasing, pos, pms only |
| License catalog | `module-catalog.ts`, `feature-catalog.ts` | `construction` stub; no construction features |
| Party roles | `schema.server.prisma` | customer, supplier only |
| Integration tests | 15 suites, 259 tests | All PASS; projects, finance, sales migration covered |
| Architecture docs | `PHASE_1_5`, `PHASE_8_*`, `PHASE_8_3_1` | Construction explicitly deferred until now |

---

## 19. Approval Gate

**STOP — Phase 9 design complete.**

Before any Phase 9.0 implementation:

1. Product approval of vertical scope and sub-phase sequence (§13)
2. Decision on Q1–Q8 (§16)
3. Confirmation of FPS-only GL policy for Construction
4. SKU/pricing alignment for `construction` module + feature keys (§3.3)

**Do not write code until this design is approved.**

---

## Appendix A — Current vs Target Architecture

```text
TODAY (Phase 8.3.1)                 TARGET (Construction vertical)
─────────────────────                 ─────────────────────────────

Business Core                         Business Core (unchanged)
├── Projects ✅                       ├── Projects ✅
├── Cost Centers ✅                   ├── Cost Centers ✅
├── Party ✅                          ├── Party ✅ (+ contractor roles)
├── Sales ──► FPS pilot               ├── Sales ──► FPS
├── Purchasing ──► FPS pilot          ├── Purchasing ──► FPS + PO project
├── Inventory ✅                      ├── Inventory ✅ + project issue type
└── Finance/FPS ✅                    └── Finance/FPS ✅ + construction roles

Construction                            Construction (NEW)
└── (empty)                           ├── Contracts + BOQ
                                      ├── Sites + WBS
                                      ├── Progress + Retention
                                      ├── Variations + Subcontracts
                                      ├── Material issues
                                      ├── Project cost subledger
                                      └── Reports
                                            │
                                            ▼
                                   FinancialPostingService
                                   (dimensions: projectId, costCenterId)
```

---

## Appendix B — Key File References

| Area | Path |
|------|------|
| Project schema | `packages/database/prisma/schema.server.prisma` |
| Projects module | `apps/api/src/modules/projects/` |
| Financial posting | `apps/api/src/modules/finance/posting/` |
| Posting rules | `apps/api/src/modules/finance/posting/posting-rule.service.ts` |
| Account roles | `apps/api/src/modules/finance/posting/account-roles.constants.ts` |
| Dimension validation | `apps/api/src/modules/finance/posting/posting-dimension.service.ts` |
| Sales FPS pilot | `apps/api/src/modules/sales/sales.service.ts` |
| Purchasing FPS pilot | `apps/api/src/modules/purchasing/purchasing.service.ts` |
| Inventory ledger | `apps/api/src/common/services/inventory-ledger.service.ts` |
| License catalog | `apps/api/src/modules/license/catalog/module-catalog.ts` |
| Feature catalog | `apps/api/src/modules/license/catalog/feature-catalog.ts` |
| Platform architecture | `docs/PHASE_1_5_PLATFORM_ARCHITECTURE.md` |
| Projects design | `docs/PHASE_8_PROJECTS_DESIGN.md` |
| Finance dimensions | `docs/PHASE_8_1_FINANCE_DIMENSIONS_COMPLETE.md` |
| Regression triage | `docs/PHASE_8_3_1_REGRESSION_TRIAGE_COMPLETE.md` |
