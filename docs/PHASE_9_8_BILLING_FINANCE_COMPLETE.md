# PHASE 9.8 COMPLETE

Construction billing bridges approved progress certificates to Universal Sales invoices and `FinancialPostingService` GL posting — with retention/advance metadata on the billing record and no duplicate construction invoice engine.

---

## Architecture

```text
Approved Progress
    → Billing Candidate / ConstructionBilling (draft → approved)
    → Sales Invoice (service lines, net billable amount)
    → FinancialPostingService (sales/invoice/post) with project + cost center dimensions
```

Retention holds remain on progress approval (Phase 9.4). Advance recovery is recorded in the advance subledger when billing is posted. GL uses the existing sales posting rule only — no `AccountingEngineService`, no construction-specific invoice GL engine.

## Feature

`construction.billing`

## RBAC

| Permission | Actions |
|------------|---------|
| `construction:billing:read` | List billings, candidates, get by id |
| `construction:billing:create` | Create draft billing from approved progress |
| `construction:billing:manage` | Approve, post, cancel |

## API

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/v1/construction/billing` | List billings (filters: project, contract, progress, status) |
| `GET` | `/api/v1/construction/billing/candidates` | Approved progress with unbilled items |
| `POST` | `/api/v1/construction/billing` | Create draft billing from approved progress |
| `GET` | `/api/v1/construction/billing/:id` | Get billing with lines and references |
| `POST` | `/api/v1/construction/billing/:id/approve` | Approve draft billing |
| `POST` | `/api/v1/construction/billing/:id/post` | Create + post sales invoice via FPS |
| `POST` | `/api/v1/construction/billing/:id/cancel` | Cancel draft/approved billing |

### Create body

- `progressId` (required) — must be `approved`
- `progressItemIds` (optional) — partial billing subset; omit to bill all unbilled items
- `idempotencyKey` (optional)
- `notes` (optional)

### Post body

- `dimensions.projectId` (optional, defaults to billing project)
- `dimensions.costCenterId` (optional, defaults to first line cost center)

## Schema

### `ConstructionBilling`

| Field | Purpose |
|-------|---------|
| `status` | `draft` \| `approved` \| `posted` \| `cancelled` |
| `progressId`, `contractId`, `boqId` | Source references |
| `salesInvoiceId` | Linked Universal Sales invoice |
| `grossAmount`, `retentionAmount`, `advanceRecoveryAmount`, `netBillableAmount` | Operational billing amounts |
| `sourceModule`, `sourceType`, `sourceId`, `sourceEvent` | Idempotency identity |
| `retentionPercent`, `advanceRecoveryPercent` | Contract snapshot metadata |

### `ConstructionBillingLine`

Optional lines linking `progressItemId`, `boqItemId`, `variationId`, `costCenterId` with per-line amount breakdown.

## Amount logic

| Amount | Calculation |
|--------|-------------|
| `grossAmount` | Sum of selected progress item `currentPeriodAmount` |
| `retentionAmount` | `ConstructionRetentionService.calculateHoldAmount` (metadata; hold already on progress approve) |
| `advanceRecoveryAmount` | `ConstructionAdvanceService.calculateRecoverableFromProgress` |
| `netBillableAmount` | `gross − retention − advance recovery` → sales invoice total |

## Guards

- Only **customer** contracts (sales AR path)
- Progress must be **approved** (not draft/submitted/rejected)
- Post requires `UNIVERSAL_FINANCE_SALES_PILOT_ENABLED=true` (FPS only)
- Duplicate item billing blocked across non-cancelled billings
- Idempotent create via `sourceModule/sourceType/sourceId/sourceEvent` unique constraint
- Concurrent post: `salesInvoiceId` claim + status guard
- FPS failure: clears `salesInvoiceId` claim, billing stays `approved`

## Dependencies

- `construction` (progress, contracts, BOQ, retention, advances)
- `projects` (project + cost center dimensions)
- `finance` (`FinancialPostingService` via sales post)
- `party` (`PartyLegacyAdapterService` → customer)
- `sales` (`SalesService.createInvoice` + `postInvoice`)

## Tests

`apps/api/test/construction-billing.integration.spec.ts`

Covers candidates, create, partial billing, retention/advance metadata, approve/post flow, FPS dimensions, pilot flag, idempotency, duplicate prevention, concurrency, rollback, advance recovery, licensing, RBAC, cross-tenant isolation, cancel/rebill.

## Files

| File | Purpose |
|------|---------|
| `construction-billing.service.ts` | Billing lifecycle + sales bridge |
| `construction-billing.controller.ts` | HTTP routes |
| `dto/construction-billing.dto.ts` | Request DTOs |
| `schema.server.prisma` | `ConstructionBilling` + lines |
| `migrations/20250907280000_construction_billing/` | DDL |
| `feature-catalog.ts` | `construction.billing` |
| `seed.ts` / `test-app.ts` | RBAC seed |
| `construction-test.helpers.ts` | License feature list |
