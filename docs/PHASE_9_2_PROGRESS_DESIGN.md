# PHASE 9.2 CONSTRUCTION PROGRESS DESIGN

**Status:** Audit + Architecture Design ONLY — 2026-09-07  
**Scope:** Design document only — **no implementation, no migrations, no schema changes, no code modifications**  
**Prerequisites:** Phase 9.0 Construction Foundation ✅ · Phase 9.1 Contracts + BOQ ✅ (312/312 tests, typecheck PASS, commit `bf019c3`)

> **Hard STOP:** Do not implement Progress until this design is approved.

---

## Executive Summary

Phase 9.2 introduces **Construction Progress** — operational measurement of executed work against an **approved BOQ revision**, with period-based quantities and decimal-safe valuation. Progress is **Construction-specific** commercial/operational truth. It is **not** a generic task/timesheet system, **not** billing, and **not** GL.

**Repository verdict:** Zero progress implementation exists in code. Phase 9.1 delivers the required upstream chain (Project → Profile → Contract → BOQ → Items) with immutable approved BOQ revisions, decimal utilities, licensing, RBAC, audit, and tenant isolation patterns ready to extend.

**Recommended MVP:** Two entities — `ConstructionProgress` (header) and `ConstructionProgressItem` (lines) — bound to a **specific BOQ revision** (`boqId`), with period dates, cumulative quantity math, rate snapshots from BOQ items, and a minimal lifecycle (`draft` → `submitted` → `approved` | `rejected` → `archived`). No certificates, no Sales, no FPS, no `ConstructionCostEntry` side effects.

**Phase sequencing note:** The original `PHASE_9_CONSTRUCTION_DESIGN.md` listed Sites/WBS as sub-phase 9.2. **This document redefines Phase 9.2 as Progress measurement only**, per product approval. Sites/WBS moves to a later sub-phase.

**Verdict:** See [VERDICT](#verdict).

---

## Repository Audit

### Search methodology

Full-repository search performed for: progress, percentage complete, quantities completed, work completion, work certificates, interim payment certificates, IPC, progress certificates, valuation, earned value, completed quantity, cumulative quantity, previous quantity, current quantity, executed quantity, BOQ progress, customer billing, invoices, sales invoice, retention, advances, variations, project costing, timesheet, worklog, work order, task master.

Inspected: Prisma schema, `apps/api/src/modules/construction/*`, Finance/FPS, Sales, Purchasing, Inventory, PMS ledger, licensing catalogs, RBAC seed, integration tests, desktop routes, Phase 9.0/9.1 completion docs.

### What EXISTS (relevant to Phase 9.2)

| Area | State | Location / notes |
|------|-------|------------------|
| **Universal Project** | ✅ | `projects` — identity, branch, lifecycle |
| **ConstructionProjectProfile** | ✅ | 1:1 gate on project |
| **ConstructionContract** | ✅ | Unified customer/subcontractor; `CNT-YYYY-NNNNNN`; lifecycle; retention/advance metadata (fields only) |
| **ConstructionBoq** | ✅ | `BOQ-YYYY-NNNNNN` + `revisionNumber`; `supersedesBoqId` chain; partial unique index: one `approved` BOQ per contract |
| **ConstructionBoqSection / Item** | ✅ | Planned qty × unit rate → `originalAmount`; optional Product/UOM/Cost Center; `costCode` string |
| **BOQ immutability** | ✅ | Approved BOQ/items never mutated; revisions via new BOQ row |
| **Decimal money utilities** | ✅ | `construction-money.util.ts` — `Prisma.Decimal(18,4)`, no JS float |
| **ConstructionCostEntry** | ✅ | Append-only **actual cost** subledger; idempotent on `(tenantId, sourceModule, sourceType, sourceId, sourceEvent)` |
| **PostingDimensionService** | ✅ | Project/cost-center validation (for optional BOQ item refs; not used by progress in 9.2) |
| **DocumentNumberService** | ✅ | Atomic `PREFIX-YYYY-NNNNNN`; branch-aware |
| **AuditService** | ✅ | Entity/action logging |
| **Commercial licensing** | ✅ | `construction` module; features `construction.foundation`, `construction.contracts`, `construction.boq` |
| **RBAC seed pattern** | ✅ | `construction:{feature}:{action}` in `seed.ts` / `test-app.ts` |
| **Integration test patterns** | ✅ | `construction-contracts-boq.integration.spec.ts` (42 tests); boundary tests for no GL/inventory/cost entry |
| **PMS LedgerPostingService** | ✅ | Reference pattern: append-only entries, reversal support, caller-owned transaction |
| **FinancialPostingService** | ✅ | Idempotency key pattern: `{module}:{type}:{id}:{event}` |
| **Sales invoices** | ✅ | Separate commercial billing; optional FPS pilot — **not linked to Construction** |

### What DOES NOT EXIST

| Area | Status |
|------|--------|
| `ConstructionProgress` / progress items tables | ❌ |
| Progress measurement API or services | ❌ |
| Progress certificates / IPC documents | ❌ |
| Executed quantity / cumulative quantity tracking | ❌ |
| Earned value / progress % calculations (persisted) | ❌ |
| `construction.progress` feature | ❌ |
| `construction:progress:*` RBAC permissions | ❌ |
| Construction progress desktop UI | ❌ |
| Progress → Sales / FPS integration | ❌ |
| Progress → ConstructionCostEntry automation | ❌ |
| Variations / variation-adjusted BOQ quantities | ❌ |
| Sites / WBS (deferred from old 9.2 plan) | ❌ |
| Generic task / timesheet / worklog modules | ❌ |
| `ProgressCertificate` entity (Phase 9 master design only) | ❌ Not implemented |

### Misleading references

| Reference | Actual meaning |
|-----------|----------------|
| `ConstructionBoqStatus` includes planning states only | No progress states on BOQ |
| `EncounterStatus.in_progress` in schema | PMS clinical status — unrelated to Construction |
| Phase 9 design `ProgressCertificate` / `IPC` | Future billing phase — **out of 9.2 scope** |
| Contract `retentionPercent`, `advanceAmount` | Metadata only since 9.1 — no calculations |
| BOQ `originalAmount` | **Planned/contractual** value — not executed or billed |
| `ConstructionCostEntry.amount` | **Actual cost** — not progress value |
| `sales.quotations` feature catalog entry | Stub — no implementation |

### Phase 9.1 foundation readiness

| Prerequisite | Ready? |
|--------------|--------|
| Approved BOQ revision model with immutability | ✅ |
| BOQ item planned quantity + unit rate | ✅ |
| Contract ↔ BOQ ↔ Project invariants enforced in services | ✅ |
| Decimal calculation utilities | ✅ |
| Tenant isolation + integration tests | ✅ |
| Licensing + RBAC extensibility | ✅ |
| No GL/inventory/cost-entry side effects on BOQ (proven by tests) | ✅ |

**No architectural blocker** prevents Phase 9.2 design approval.

---

## Existing Reusable Foundations

Reuse without modification:

| Pattern | Reuse for Progress |
|---------|-------------------|
| `construction-money.util.ts` | Extend or mirror for progress qty × rate valuation |
| `construction-contract-lifecycle.ts` style | New `construction-progress-lifecycle.ts` transition map |
| BOQ approve immutability | Mirror for approved progress immutability |
| `DocumentNumberService` | `PRG-YYYY-NNNNNN` progress document numbers |
| `AuditService.log()` | Header lifecycle events only |
| `PostingDimensionService` | Validate cost center if denormalized from BOQ item (optional) |
| Entitlement + `PermissionsGuard` | `construction.progress` + RBAC |
| Integration test helpers | Extend `construction-test.helpers.ts` |
| Partial unique DB indexes | One open progress draft per period; concurrency safety |

Do **not** reuse:

- Generic Project task fields (none exist)
- Sales Invoice as progress container
- `FinancialPostingService` for progress CRUD
- `ConstructionCostEntry` for progress valuation

---

## Progress Domain

Progress is the **Construction vertical record of executed work** measured against a **fixed BOQ revision baseline**.

### Four-quantity model (do not merge)

| Concept | Owner | Phase 9.2 |
|---------|-------|-----------|
| **Planned quantity** | BOQ item (`plannedQuantity`) | Read-only reference |
| **Executed / measured quantity** | Progress item (`currentPeriodQuantity`, `cumulativeQuantity`) | ✅ Persist |
| **Valued quantity amount** | Progress item (`currentPeriodAmount`, `cumulativeAmount`) | ✅ Derived + stored |
| **Billed quantity / amount** | Future certificate / Sales | ❌ Not in 9.2 |

```text
BOQ Item (planned baseline — immutable when BOQ approved)
    │
    ├── plannedQuantity
    ├── unitRate
    └── originalAmount (planned value)

Progress Item (executed measurement — per period)
    │
    ├── currentPeriodQuantity
    ├── previousCumulativeQuantity
    ├── cumulativeQuantity
    ├── unitRateSnapshot (from BOQ at progress creation)
    ├── currentPeriodAmount
    └── cumulativeAmount
```

Progress measures **physical/commercial completion**, not cost accrual and not customer billing.

---

## Progress Header

**Recommended entity:** `ConstructionProgress`

| Field | Purpose |
|-------|---------|
| `id` | UUID PK |
| `tenantId` | Tenant scope |
| `projectId` | FK → `projects` (must match contract/BOQ) |
| `branchId` | FK → `branches` — from contract; **never null** for numbering |
| `contractId` | FK → `construction_contracts` |
| `boqId` | FK → `construction_boqs` — **specific revision being measured** |
| `number` | `PRG-YYYY-NNNNNN` via `DocumentNumberService` |
| `periodFrom` | Date — measurement period start |
| `periodTo` | Date — measurement period end |
| `status` | See Lifecycle |
| `currency` | Align with contract/BOQ |
| `totalCurrentAmount` | Cached sum of line `currentPeriodAmount` |
| `totalCumulativeAmount` | Cached sum of line `cumulativeAmount` (header-level rollup) |
| `notes` | String? |
| `submittedAt`, `submittedById` | DateTime? / UUID? |
| `approvedAt`, `approvedById` | DateTime? / UUID? |
| `rejectedAt`, `rejectedById`, `rejectionReason` | Optional audit trail |
| `createdById` | UUID? |
| `createdAt`, `updatedAt` | Standard |

**Uniqueness (recommended):**

```text
@@unique([tenantId, contractId, boqId, periodFrom, periodTo])
```

Prevents duplicate progress certificates for the same BOQ revision and period. Rejected records may transition back to `draft` on the **same row** rather than creating duplicates.

**Optional future field (MEDIUM — not required for 9.2 MVP):**

- `certificateNumber` — defer to billing phase; use `number` (`PRG-…`) for progress document identity in 9.2

---

## Progress Items

**Recommended entity:** `ConstructionProgressItem`

| Field | Purpose |
|-------|---------|
| `id` | UUID PK |
| `tenantId` | Tenant scope |
| `progressId` | FK → `construction_progress` |
| `boqItemId` | FK → `construction_boq_items` — **must belong to header `boqId`** |
| `lineNumber` | Display order (may mirror BOQ `lineNumber`) |
| `currentPeriodQuantity` | Decimal(18,4) — work executed this period |
| `previousCumulativeQuantity` | Decimal(18,4) — snapshot from last **approved** progress on same `boqId` + `boqItemId` |
| `cumulativeQuantity` | Decimal(18,4) — `previous + current` (stored, validated) |
| `unitRateSnapshot` | Decimal(18,4) — copied from BOQ item at progress line create |
| `currentPeriodAmount` | Decimal(18,4) — `currentPeriodQuantity × unitRateSnapshot` |
| `cumulativeAmount` | Decimal(18,4) — `cumulativeQuantity × unitRateSnapshot` |
| `costCenterId` | UUID? — optional denormalized copy from BOQ item for reporting |
| `costCode` | String? — optional denormalized copy from BOQ item |
| `notes` | String? |

**Design rules:**

- Not every BOQ line must appear on every progress — include only lines with measurement this period (or allow zero-current lines for explicit "no progress" — **MVP: omit zero-current lines**).
- `unitRateSnapshot` is frozen on the progress line; BOQ rate changes in a **future BOQ revision** do not rewrite historical progress.
- Do **not** add `productId` mutation semantics — product on BOQ item remains informational.

---

## BOQ Revision Relationship

This is the **critical architectural invariant** for Phase 9.2.

### Binding rule

Every `ConstructionProgress` row references exactly one `boqId` (one BOQ revision). Progress items reference `boqItemId` rows that belong to that same `boqId`.

```text
Contract C1
  ├── BOQ Rev 1 (approved) ──► Progress P1, P2, P3  (historical — frozen)
  └── BOQ Rev 2 (approved, supersedes Rev 1)
         └── Progress P4, P5…  (new measurements only on Rev 2)
```

### When BOQ revision changes

| Event | Progress behavior |
|-------|-------------------|
| Rev 1 approved → progress recorded | Progress tied to Rev 1 `boqId` forever |
| Rev 2 created (draft) | No progress on draft BOQ |
| Rev 2 approved; Rev 1 → `superseded` | **New** progress must use Rev 2 `boqId` |
| Historical Rev 1 progress | **Readable, immutable**, never rewritten to Rev 2 |
| Reporting "total executed on contract" | Future cross-revision aggregation (reporting phase) — not 9.2 |

### Variations (future boundary)

Variations may eventually:

- Trigger new BOQ revision with adjusted planned quantities/rates
- Leave historical progress on prior revision intact
- Require explicit "effective planned quantity" per revision for cap validation

**Phase 9.2 MVP cap:** `cumulativeQuantity ≤ boqItem.plannedQuantity` on the **same BOQ revision**. Variation-adjusted caps are **FUTURE** (Phase 9.6+).

Do **not** implement variations in 9.2.

---

## Quantity Rules

### Period math (deterministic)

```text
cumulativeQuantity = previousCumulativeQuantity + currentPeriodQuantity
```

Example (BOQ planned = 100 m²):

| Period | Previous cumulative | Current period | New cumulative |
|--------|--------------------:|---------------:|-------------:|
| 1 | 0 | 20 | 20 |
| 2 | 20 | 30 | 50 |
| 3 | 50 | 50 | 100 |

### Validation rules (MVP)

| Rule | Enforcement |
|------|-------------|
| `currentPeriodQuantity > 0` when line included | Service validation |
| `currentPeriodQuantity = 0` | Reject line (omit line instead) |
| `previousCumulativeQuantity` | Service derives from last **approved** progress for `(boqId, boqItemId)`; user cannot arbitrary override |
| `cumulativeQuantity ≤ plannedQuantity` | Reject over-execution in MVP |
| Negative quantities | **Reject** in 9.2 |
| Non-sequential periods | Allowed (gaps in calendar) but cumulative chain must remain consistent |

### Previous cumulative derivation

On line create/update (draft only):

```text
previousCumulativeQuantity =
  MAX(cumulativeQuantity) from approved ConstructionProgressItem
  WHERE boqItemId = X AND progress.boqId = Y
  ORDER BY progress.periodTo DESC
  DEFAULT 0
```

On approve, re-validate entire chain for all lines on the same `boqId`.

### Over-execution policy

**MVP: reject** when `cumulativeQuantity > boqItem.plannedQuantity`.

**FUTURE:** tenant/contract flag to allow over-execution with explicit override permission (`construction:progress:over-execute`) after variations exist.

---

## Valuation Rules

Use `Prisma.Decimal(18,4)` exclusively — extend `construction-money.util.ts` or add `construction-progress.util.ts`.

```text
currentPeriodAmount   = currentPeriodQuantity × unitRateSnapshot
cumulativeAmount      = cumulativeQuantity × unitRateSnapshot
```

| Rule | Implementation |
|------|----------------|
| Storage | `Decimal(18,4)` |
| Computation | `new Prisma.Decimal(qty).mul(rate).toDecimalPlaces(4)` |
| Rate source | BOQ item `unitRate` at progress line creation — **snapshot** |
| BOQ `originalAmount` | Unchanged — planned value only |
| Header totals | Sum line amounts with Decimal accumulation (`sumBoqAmounts` pattern) |
| Currency | Must match contract/BOQ header currency |

**Do not** modify BOQ item rates or amounts when progress is recorded.

Historical progress preserves valuation semantics even if a later BOQ revision changes rates for the "same" commercial work.

---

## Lifecycle

### Status enum (minimal)

| Status | Meaning | Editable? |
|--------|---------|-----------|
| `draft` | Entry in progress | ✅ Lines + header metadata |
| `submitted` | Awaiting approval | ❌ Quantities frozen |
| `approved` | Measurement accepted | ❌ Immutable |
| `rejected` | Sent back for correction | ❌ Until returned to draft |
| `archived` | Terminal soft-close | ❌ Read-only |

### Allowed transitions

```text
draft     → submitted | archived
submitted → approved | rejected | archived
approved  → archived
rejected  → draft | archived
archived  → (terminal)
```

Implement via `construction-progress-lifecycle.ts` (mirror `construction-contract-lifecycle.ts`).

### Approval effects

On `approved`:

- Freeze all quantities and amounts on header/lines
- Stamp `approvedAt`, `approvedById`
- Progress becomes the new baseline for `previousCumulativeQuantity` on **later periods** for the same `(boqId, boqItemId)`

### Correction strategy (no silent mutation)

| Scenario | MVP approach |
|----------|--------------|
| Error while `draft` | Edit freely |
| Error while `submitted` | Reject → `draft` → fix → resubmit |
| Error after `approved` | **Do not PATCH**. Options: (A) archive erroneous progress + create corrected progress in a **new period** with adjusted current qty to reach true cumulative; (B) **FUTURE** `ConstructionProgressReversal` linked to original |
| Phase 9.2 recommendation | **A** for MVP — document operational procedure; reversal entity in Phase 9.2.1 or 9.3 |

No generic workflow engine. No multi-step BPM.

### Eligibility gates

| Gate | Rule |
|------|------|
| Contract status | `active` required for submit/approve (`draft` contract may allow draft progress prep — **MVP: require `active` before submit**) |
| BOQ status | Header `boqId` must be `approved` at submit time |
| BOQ superseded | No **new** progress on superseded BOQ; existing approved progress remains valid history |
| Contract suspended | Block submit/approve |
| Project / profile | Construction profile must exist |

---

## Contract Validation

Service-layer checks (every create/update/submit):

| Check | Failure |
|-------|---------|
| `progress.tenantId` = contract.tenantId = boq.tenantId = project.tenantId | 400 |
| `progress.projectId` = contract.projectId = boq.projectId | 400 |
| `boq.contractId` = progress.contractId | 400 |
| `boqItem.boqId` = progress.boqId | 400 |
| BOQ revision eligible (`approved`; not `superseded` for new work) | 400 |
| Cross-tenant FK references | 400 / 404 |

Follow existing Construction service patterns from `construction-boq.service.ts` and `construction-contract.service.ts`.

---

## Cost Center

### Where it lives

| Layer | Cost Center |
|-------|-------------|
| BOQ item | Optional `costCenterId` (Phase 9.1) — **source of truth for planning dimension** |
| Progress item | Optional denormalized `costCenterId` + `costCode` copied at line create |

**Recommendation:** Copy from BOQ item on progress line creation. Do **not** require separate cost center entry on progress UI in MVP. Do **not** allow progress line to point to a different cost center than its BOQ item in MVP (prevents drift).

If BOQ item has no cost center, progress line leaves it null.

Validation when present: reuse `PostingDimensionService.assertCostEntryDimensions()` pattern (tenant, branch, project compatibility).

Do **not** modify Universal Cost Center schema.

---

## Product / Material Boundary

| Action | Inventory impact |
|--------|------------------|
| BOQ item optional `productId` | Reference only |
| Progress item creation | **None** |
| Progress approval | **None** |
| Material issue / consumption | **Future** — separate module |

Progress measures work executed, not materials issued.

---

## Finance Boundary

Phase 9.2 progress CRUD and approval **must NOT**:

| Prohibited side effect |
|------------------------|
| Create `JournalEntry` / `JournalLine` |
| Call `FinancialPostingService` |
| Call `AccountingEngineService` |
| Create or update Sales Invoice |
| Change customer/supplier balances |
| Calculate or hold retention |
| Recover or apply advance payments |
| Post contract revenue |

Progress valuation is **operational/planning measurement data** only.

### Future chain (design only — not 9.2)

```text
Progress (approved measurement)
    ↓
Progress Certificate / IPC (Phase 9.x billing)
    ↓
Sales Invoice (optional bridge)
    ↓
FinancialPostingService (construction posting rules)
```

---

## Construction Cost Subledger Boundary

**Do NOT** create `ConstructionCostEntry` from:

- Progress create/update
- Progress submit
- Progress approve

| Value type | Subledger | Phase 9.2 |
|------------|-----------|-----------|
| Progress `cumulativeAmount` | Earned/measured **work value** | ✅ Progress tables |
| `ConstructionCostEntry.amount` | **Actual cost** incurred | Separate (9.0) |

Do not confuse progress value with actual cost. Profitability (earned vs actual) is **future reporting**, not 9.2.

---

## Licensing

Use existing commercial perpetual architecture:

| Layer | Phase 9.2 design |
|-------|------------------|
| Module | `construction` (already required) |
| Feature (new) | `construction.progress` |
| Dependency chain | `construction` module → requires `construction.boq` (or all three: foundation + contracts + boq) |

**Rule:** Projects module license alone does **not** grant Progress. Tenant must have Construction module + `construction.progress` feature entitlement.

Do **not** implement catalog/seed changes in this audit-only phase. Document intended entries:

```text
FEATURE_CATALOG['construction.progress']
CONSTRUCTION_PERMISSIONS += progress read | manage | submit | approve
```

---

## RBAC

Follow `construction:{feature}:{action}` convention.

| Permission | Purpose |
|------------|---------|
| `construction:progress:read` | List/get progress headers and lines |
| `construction:progress:manage` | Create/edit draft progress lines |
| `construction:progress:submit` | Submit for approval |
| `construction:progress:approve` | Approve or reject submitted progress |

Optional **FUTURE:** `construction:progress:over-execute` — override planned quantity cap.

Authorization chain: License → Entitlement → RBAC (same as 9.1).

---

## Tenant / Branch

| Entity | Tenant | Branch |
|--------|--------|--------|
| Progress header | Required `tenantId` | Required `branchId` from contract |
| Progress items | Required `tenantId` | Inherited via header (no separate branch) |

Branch semantics follow Contract/Project design — **no Construction-specific branch model**.

Cross-tenant references must fail safely (integration tests required in implementation phase).

---

## Concurrency

Design for safe concurrent operations:

| Scenario | Mitigation |
|----------|------------|
| Two users create progress for same period | `@@unique([tenantId, contractId, boqId, periodFrom, periodTo])` |
| Concurrent submit on same draft | Optimistic locking via `updatedAt` check or status conditional update |
| Concurrent approval | Transaction + status guard (`WHERE status = submitted`) |
| Duplicate approve requests | Idempotent approve response when already approved |
| Concurrent line cumulative updates | Approve validates full chain inside transaction |

Use database constraints — not application-only checks.

---

## Idempotency

Align with existing Construction/Finance patterns.

### Business identity

Recommended unique progress identity:

```text
(tenantId, contractId, boqId, periodFrom, periodTo)
```

### Optional API idempotency

For `POST /construction/progress`, accept optional client `idempotencyKey` stored on header (unique per tenant) — mirrors FPS `idempotencyKey` pattern.

### Approve/submit idempotency

Repeating `POST …/approve` on already-approved progress returns existing approved record (200) without error — same spirit as `ConstructionCostEntry` duplicate post handling.

Do **not** invent unrelated idempotency philosophy.

---

## API Design

**Design only — do not implement.**

Base path: `/api/v1/construction/progress`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/construction/progress` | List (filters: projectId, contractId, boqId, status, period) |
| POST | `/construction/progress` | Create header (+ optional initial lines) |
| GET | `/construction/progress/:id` | Get header with lines |
| PATCH | `/construction/progress/:id` | Update draft header metadata |
| POST | `/construction/progress/:id/submit` | Submit |
| POST | `/construction/progress/:id/approve` | Approve |
| POST | `/construction/progress/:id/reject` | Reject (body: reason) |
| POST | `/construction/progress/:id/archive` | Archive |
| POST | `/construction/progress/:id/items` | Add draft line |
| PATCH | `/construction/progress-items/:id` | Update draft line |
| DELETE | `/construction/progress-items/:id` | Remove draft line (optional MVP) |

Nested convenience:

| GET | `/construction/contracts/:contractId/progress` | List by contract |
| GET | `/construction/boqs/:boqId/progress` | List by BOQ revision |

Guards: `@RequireModule('construction')` + `@RequireFeature('construction.progress')` + `@RequirePermissions(...)`.

---

## Desktop Design

**Design only — do not implement.**

Navigation (future):

```text
Construction
  ├── Contracts (9.1 ✅)
  └── Progress (9.2)
```

Workflow:

```text
Select Project
  ↓
Select Contract
  ↓
Select BOQ Revision (default: current approved)
  ↓
Select / create Period
  ↓
Enter current period quantities (BOQ lines)
  ↓
Review valuation rollup
  ↓
Submit → Approve
```

Gate: Construction module + `construction.progress` feature + RBAC.

No dashboards, Gantt, or profitability charts in 9.2.

---

## Audit

Use `AuditService` at header lifecycle granularity:

| Action | When |
|--------|------|
| `construction.progress.created` | Header created |
| `construction.progress.updated` | Draft header/line edits (single action; no per-line flood) |
| `construction.progress.submitted` | Status → submitted |
| `construction.progress.approved` | Status → approved |
| `construction.progress.rejected` | Status → rejected |
| `construction.progress.archived` | Status → archived |

Include `{ progressId, contractId, boqId, periodFrom, periodTo, status }` in metadata — not full line payloads.

---

## Reporting Boundary

**Do NOT build reporting in Phase 9.2.**

Document future derivations only:

| Metric | Formula (future) |
|--------|------------------|
| Remaining quantity | `plannedQuantity − cumulativeQuantity` (same BOQ revision) |
| Progress % | `cumulativeQuantity / plannedQuantity` (line or weighted rollup) |
| Current valuation | Sum of `currentPeriodAmount` |
| Cumulative valuation | Sum of `cumulativeAmount` |
| Billed vs earned | Requires certificate/billing phase |

No dashboards. Read APIs may expose computed fields on GET for UI convenience (implementation choice).

---

## MVP Scope

Priority ranking for Phase 9.2 implementation approval:

| Capability | Priority | Include in 9.2 MVP? |
|------------|----------|---------------------|
| Progress header | **CRITICAL** | ✅ Yes |
| Progress items | **CRITICAL** | ✅ Yes |
| Current + cumulative quantities | **CRITICAL** | ✅ Yes |
| Valuation (Decimal) | **CRITICAL** | ✅ Yes |
| BOQ revision binding | **CRITICAL** | ✅ Yes |
| Submit / approve lifecycle | **CRITICAL** | ✅ Yes |
| Contract/BOQ validation | **CRITICAL** | ✅ Yes |
| Tenant isolation + tests | **CRITICAL** | ✅ Yes |
| Licensing + RBAC | **CRITICAL** | ✅ Yes |
| Period validation (from ≤ to) | **HIGH** | ✅ Yes |
| Rate snapshot on lines | **HIGH** | ✅ Yes |
| Cumulative chain from prior approved | **HIGH** | ✅ Yes |
| Over-execution rejection | **HIGH** | ✅ Yes |
| `PRG-YYYY-NNNNNN` numbering | **HIGH** | ✅ Yes |
| Concurrency unique constraints | **HIGH** | ✅ Yes |
| Audit lifecycle events | **HIGH** | ✅ Yes |
| Cost center denormalization from BOQ | **MEDIUM** | ✅ Yes (copy-only) |
| Minimal desktop UI | **MEDIUM** | ⚠️ If time — API-first acceptable |
| Progress reversal entity | **MEDIUM** | ❌ Defer to 9.2.1 |
| Certificate numbering (`IPC`) | **FUTURE** | ❌ No — billing phase |
| Cross-revision contract rollup reports | **FUTURE** | ❌ No |
| Variation-adjusted quantity caps | **FUTURE** | ❌ No |
| Sites / WBS linkage | **FUTURE** | ❌ No |
| Billing / Sales / FPS | **FUTURE** | ❌ No |
| Retention / advance accounting | **FUTURE** | ❌ No |
| ConstructionCostEntry integration | **FUTURE** | ❌ No |
| Dashboards / profitability | **FUTURE** | ❌ No |

### Recommended 9.2 delivery scope

**Include:**

1. `ConstructionProgress` + `ConstructionProgressItem` schema + migration
2. Quantity + valuation rules with `Prisma.Decimal`
3. BOQ revision binding + superseded BOQ rules
4. Lifecycle: draft → submitted → approved/rejected → archived
5. Approved progress immutability
6. Feature `construction.progress` + RBAC
7. API under `/api/v1/construction/progress`
8. Integration tests (licensing, validation, quantities, boundaries, concurrency)
9. Minimal desktop Progress workflow (optional but recommended)
10. `docs/PHASE_9_2_PROGRESS_COMPLETE.md` on completion

**Exclude:**

- Certificates, IPC, billing, Sales, FPS, retention, advances
- Variations, inventory, cost subledger side effects
- Reporting dashboards, sites/WBS, generic task/timesheet system

---

## Future Extensions

| Extension | Depends on | Notes |
|-----------|------------|-------|
| **Progress Certificate / IPC** | 9.2 progress approved | Adds billed amount, retention held, net payable |
| **Sales Invoice bridge** | Certificate | Optional AR aging compatibility |
| **FPS posting rules** | Certificate post | `construction/progress_certificate/post` |
| **Variations** | 9.6 | Adjust effective planned qty; new BOQ revisions |
| **Progress reversal** | 9.2 stable | Formal correction of approved progress |
| **Sites / WBS** | Later sub-phase | Allocate progress by site/WBS node |
| **Material consumption** | Inventory + sites | Separate from progress measurement |
| **Earned vs actual reporting** | Progress + CostEntry | Profitability analytics |
| **Subcontractor progress** | Same model | `direction=subcontractor` contracts |

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| BOQ revision change mid-project splits measurement history | **High** | Immutable `boqId` on progress; document cross-revision reporting as future |
| Users confuse progress value with billing | **High** | Clear UI labels; no invoice actions in 9.2 |
| Users confuse progress value with actual cost | **High** | Keep `ConstructionCostEntry` separate; docs + tests |
| Cumulative chain errors across periods | **High** | Derive `previousCumulative` from last approved; validate on approve |
| Over-execution without variations | **Medium** | Hard cap at planned qty in MVP |
| Concurrent period duplicate entry | **Medium** | DB unique constraint on period identity |
| Post-approval correction complexity | **Medium** | Document operational workaround; reversal entity later |
| Scope creep into certificates/billing | **High** | Strict MVP gate; feature catalog separation |
| Re-sequencing vs Phase 9 master doc | **Low** | Update master roadmap when 9.2 ships |

---

## Dependencies

| Dependency | Status | Required for 9.2? |
|------------|--------|-------------------|
| Phase 9.0 foundation | ✅ Complete | Yes |
| Phase 9.1 contracts + BOQ | ✅ Complete | Yes |
| Approved BOQ revision model | ✅ Complete | Yes |
| Universal Project + profile | ✅ Complete | Yes |
| Party roles | ✅ Complete | Yes (contract validation) |
| Cost Center (optional on BOQ) | ✅ Complete | Soft |
| Product/UOM (optional on BOQ) | ✅ Complete | No direct progress need |
| Finance FPS | ✅ Exists | **Not used** in 9.2 |
| Sales | ✅ Exists | **Not used** in 9.2 |
| Variations | ❌ Not implemented | Not required |
| Sites/WBS | ❌ Not implemented | Not required |

---

## Implementation Phases

Design-only sequencing — **await explicit approval before coding**:

| Step | Deliverable |
|------|-------------|
| **9.2.0 Schema** | `ConstructionProgress`, `ConstructionProgressItem`, enums, indexes, `PRG` number sequence |
| **9.2.1 Services** | Progress service, lifecycle, quantity/valuation utils, validation |
| **9.2.2 API + licensing** | Controller, DTOs, `construction.progress` feature, RBAC seed |
| **9.2.3 Tests** | `construction-progress.integration.spec.ts` — licensing, quantities, BOQ revision, boundaries, concurrency |
| **9.2.4 Desktop** | Minimal Progress page (project → contract → BOQ → period → quantities) |
| **9.2.5 Docs + regression** | Completion doc, full 312+ test regression, typecheck |

**Post-9.2 (not started):**

- 9.3 Progress certificates + billing boundary
- 9.4 Sites / WBS (formerly master doc 9.2)
- 9.5 Variations
- 9.6 Retention accounting

---

## VERDICT

### `READY FOR PHASE 9.2 IMPLEMENTATION`

Phase 9.1 provides a complete, tested BOQ revision baseline with immutable approved lines, decimal-safe calculations, tenant isolation, licensing, and proven finance/inventory/cost-subledger boundaries. No repository code implements progress measurement today — greenfield vertical extension with clear upstream dependencies and no blocking schema conflicts.

**Conditions for implementation start:**

1. Explicit product approval of this design (especially BOQ-revision binding and no-billing boundary).
2. Confirm Phase 9.2 scope excludes certificates/billing (Progress measurement only).
3. Additive migration only; do not modify BOQ/Contract architecture unless a blocking flaw is discovered during implementation — **none identified in audit**.

**Do NOT implement until approval is granted.**
