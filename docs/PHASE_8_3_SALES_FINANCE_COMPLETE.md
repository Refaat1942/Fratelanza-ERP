# PHASE 8.3 COMPLETE

**Status:** COMPLETE — 2026-09-07  
**Prerequisites:** Phase 8.2 Finance Migration Bridge ✅, Phase 8.1 Finance Dimensions ✅

---

## Pilot Event

**`SalesService.postInvoice()`** — `POST /api/v1/sales/invoices/:id/post`

Phase 8.3 migrates **only Sales Invoice Post** to `FinancialPostingService` when the dedicated pilot flag is enabled.

All non-pilot Sales accounting events remain on `AccountingEngineService`.

Phase 8.3 does **not** migrate payments, returns, or POS.

Phase 8.3 does **not** implement Construction.

---

## Audit Findings

- Legacy post produces 2 lines (no COGS) or 4 lines (with COGS) via hardcoded COA codes
- COGS = Σ(`unitCost × qty`) where `unitCost = stockBalance.avgCost` if balance exists, else `product.costPrice`
- Tax/discount embedded in `invoice.total` → Revenue; no separate tax GL lines
- Seeded FPS rule `sales/invoice/post` matches legacy semantics (zero `cogs` skips COGS/Inventory lines)
- Single `$transaction` boundary: inventory → GL → customer balance → invoice status

See [PHASE_8_3_SALES_FINANCE_DESIGN.md](./PHASE_8_3_SALES_FINANCE_DESIGN.md).

---

## Feature Flag

| Flag | Default | Scope |
|------|---------|-------|
| `UNIVERSAL_FINANCE_SALES_PILOT_ENABLED` | `false` | Sales invoice post → FPS |
| `UNIVERSAL_FINANCE_PILOT_ENABLED` | `false` | PO receive only (Phase 8.2 — unchanged) |

Flags are **separate** deployment toggles in `@fratelanza/config` and `GET /settings` deployment flags.

---

## Accounting Semantics

### With COGS (`cogsTotal > 0`)

| Line | Amount |
|------|--------|
| Dr AR (`accounts_receivable`) | `invoice.total` |
| Cr Revenue (`revenue`) | `invoice.total` |
| Dr COGS (`cost_of_goods_sold`) | `cogsTotal` |
| Cr Inventory (`inventory`) | `cogsTotal` |

### Without COGS

| Line | Amount |
|------|--------|
| Dr AR | `invoice.total` |
| Cr Revenue | `invoice.total` |

Tax included in Revenue via `invoice.total`. Payments are a **separate** event.

---

## COGS

- Weighted-average semantics **unchanged** (read `avgCost` before outbound movement)
- Accumulation uses `Prisma.Decimal` before FPS handoff
- Legacy path still uses `Number(cogsTotal)` for `AccountingEngineService` (flag OFF parity)
- FPS receives `amounts: { total, cogs }` as decimal strings

---

## Inventory Interaction

`InventoryLedgerService.applyMovement()` unchanged — runs **before** GL in the same transaction.

Insufficient stock → exception → full rollback (no GL, no posted status).

---

## FinancialPostingService

When sales pilot ON:

```typescript
FinancialPostingService.post({
  mode: 'rule',
  sourceModule: 'sales',
  sourceType: 'invoice',
  sourceId: invoice.id,
  sourceEvent: 'post',
  amounts: { total: invoice.total.toString(), cogs: cogsTotal.toString() },
  dimensions,
}, tx);
```

Uses existing seeded rule — **no hardcoded account IDs in Sales**.

---

## Dimensions

Optional on post body:

```json
{ "dimensions": { "projectId": "...", "costCenterId": "..." } }
```

Applied at **entry level** to all rule-generated lines (AR, Revenue, COGS, Inventory) via FPS merge rules.

Validated by `PostingDimensionService` — not duplicated in Sales.

**Not stored** on `sales_invoices` schema.

---

## Transaction Boundary

```text
BEGIN
  1. Load + validate invoice
  2. Inventory loop + COGS (Decimal)
  3. GL: FPS (pilot ON) OR AccountingEngine (pilot OFF) — exactly one
  4. Customer balance (if customerId)
  5. status → posted
COMMIT
```

No nested `$transaction`. No outbox.

---

## Idempotency

- Business: `status === 'draft'` guard
- FPS: unique `(tenantId, sales, invoice, invoiceId, post)`

---

## Concurrency

Concurrent post requests: one succeeds, one fails; one journal, one stock deduction (integration tested).

---

## Rollback

Verified: insufficient stock, invalid dimensions, FPS failure (spy) all roll back stock and leave invoice draft.

---

## Licensing

- Sales module + `sales.invoices` feature + RBAC unchanged
- **No** Inventory or Projects license required for posting/dimensions
- Finance foundation required operationally when pilot ON

---

## RBAC

`POST /sales/invoices/:id/post` — `@RequirePermissions('sales:invoices:post')` unchanged.

---

## Party Boundary

Party-aware create unchanged. Post uses resolved invoice/customer context only.

---

## Payment Boundary

`recordPayment` / `recordPaymentFromParty` remain on `AccountingEngineService` (verified in migration tests).

---

## Returns Boundary

No Sales returns API — unchanged.

---

## POS Boundary

Unchanged — legacy `AccountingEngineService`.

---

## Legacy Compatibility

| Flag | Sales post GL |
|------|---------------|
| `UNIVERSAL_FINANCE_SALES_PILOT_ENABLED=false` | `AccountingEngineService` (unchanged) |
| `UNIVERSAL_FINANCE_SALES_PILOT_ENABLED=true` | `FinancialPostingService` only |

Phase 8.2 Purchasing pilot unaffected.

---

## API

`POST /api/v1/sales/invoices/:id/post` — optional `{ dimensions?: { projectId?, costCenterId? } }`

Backward compatible empty body.

---

## Desktop

`SalesPage.tsx` — optional Project/Cost Center selectors visible when `universalFinanceSalesPilotEnabled` in settings; passed to `postSalesInvoice`.

---

## Tests

**New file:** `apps/api/test/finance-sales-migration.integration.spec.ts` — **17 tests**

Covers: pilot flag ON/OFF, no double posting, 2/4 line semantics, dimensions, idempotency, concurrency, rollback, payment boundary.

**Fixed:** `finance.integration.spec.ts` legacy regression scopes lines to created entry (cross-suite isolation).

**Full suite regression (items 41–52):** run `npm test -w @fratelanza/api`

---

## Typecheck

`npm run typecheck` — PASS across workspaces (after `@fratelanza/config` rebuild).

---

## Full Regression

| Metric | Value |
|--------|-------|
| Previous total (pre-8.3) | 241 |
| New migration tests | +17 |
| Total (2026-09-07) | **258** |
| Passed | **255** |
| Failed | **3** (unrelated to Phase 8.3) |

**Phase 8.3–related suites (all PASS):**

- `finance-sales-migration.integration.spec.ts` — 17/17
- `finance.integration.spec.ts` — 29/29
- `sales.integration.spec.ts` — PASS
- `purchasing.integration.spec.ts` — 24/24

**Unrelated failures (full suite, same run):**

1. `projects.integration.spec.ts` — search/pagination does not return newly created project by code
2. `licensing.integration.spec.ts` — `accepts usage below user limit` returns 403 instead of 201
3. `pms-patients.integration.spec.ts` — name search does not return created patient

Full suite is **not** green; do not claim full PASS until these are triaged separately.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Fiscal period required when pilot ON | Finance seed prerequisite |
| `avgCost=0` stock → zero COGS (legacy behavior) | Documented; not changed |
| Flag proliferation | Separate sales flag documented |

---

## Future Sales Migration

- Phase 8.4+ candidate: `recordPayment` → FPS
- Sales returns when implemented
- Optional `projectId` on invoice schema (not 8.3)

---

## Construction Readiness

Phase 8.3 does **not** implement Construction.

With PO receive + Sales invoice post on Universal Finance (both pilots), evaluate Construction GL integration in a **separate** phase after full regression sign-off.

---

## Phase 9 Recommendation

Do **not** start Phase 9 until:

1. Both finance pilots validated in staging with finance foundation seeded
2. Unrelated flaky tests triaged separately
3. Explicit Phase 9 scope approved

---

## Key Files

| Path | Change |
|------|--------|
| `packages/config/src/index.ts` | `universalFinanceSalesPilotEnabled` |
| `apps/api/src/modules/sales/sales.service.ts` | Flag-gated FPS swap + Decimal COGS |
| `apps/api/src/modules/sales/sales.controller.ts` | Optional dimensions DTO |
| `apps/api/src/modules/sales/sales.module.ts` | Imports `FinanceModule` |
| `apps/api/test/finance-sales-migration.integration.spec.ts` | **New** |
| `apps/desktop/src/pages/SalesPage.tsx` | Optional dimension selectors |
| `apps/desktop/src/lib/api.ts` | `postSalesInvoice(id, dimensions?)` |

---

## Explicit Statements

- Phase 8.3 migrates **only Sales Invoice Post** to `FinancialPostingService` when `UNIVERSAL_FINANCE_SALES_PILOT_ENABLED=true`.
- All non-pilot Sales accounting events remain on `AccountingEngineService`.
- Phase 8.3 does **not** migrate payments, returns, or POS.
- Phase 8.3 does **not** implement Construction.
