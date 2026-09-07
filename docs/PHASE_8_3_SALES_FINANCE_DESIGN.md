# Phase 8.3 — Sales to Universal Finance Design

**Status:** Design complete — **Phase 8.3 implemented** — see [PHASE_8_3_SALES_FINANCE_COMPLETE.md](./PHASE_8_3_SALES_FINANCE_COMPLETE.md)  
**Date:** 2026-09-07  
**Prerequisites:** Phase 8.2 Finance Migration Bridge ✅, Phase 8.1 Finance Dimensions ✅, Phase 5 Sales ✅, Phase 7 Inventory ✅

---

## 1. Executive Summary

Phase 8.3 should migrate **exactly one** Sales accounting event to `FinancialPostingService` (FPS), mirroring the Phase 8.2 purchasing bridge pattern.

**Audit conclusion:** The correct pilot is **`SalesService.postInvoice()`** (`POST /sales/invoices/:id/post`).

| Assessment | Result |
|--------------|--------|
| Method exists as assumed | ✅ `postInvoice(tenantId, id)` |
| Single `$transaction` boundary | ✅ inventory + GL + customer balance + status |
| FPS seeded rule matches legacy semantics | ✅ `sales/invoice/post` with conditional COGS skip |
| Missing FPS rule capability | ❌ None for current legacy behavior |
| Complexity vs PO receive | **Higher** — COGS computation, 2 vs 4 GL lines, warehouse gate |
| Safe to implement | ✅ **Yes**, with documented precision and flag decisions |

**Do not migrate** `recordPayment`, POS, or other Sales events in Phase 8.3.

**Do not modify PMS** (including the unrelated flaky patient search test).

---

## 2. Phase 8.2 Baseline (Context)

| Item | State |
|------|-------|
| Pilot transaction | `PurchasingService.receiveOrder()` only |
| Flag | `UNIVERSAL_FINANCE_PILOT_ENABLED` (default `false`) |
| Sales | Still **100%** `AccountingEngineService` |
| Dimensions | Optional on PO receive → FPS → `journal_lines` |

Phase 8.3 must **not** silently expand Phase 8.2 flag scope without an explicit design decision (see §10).

---

## 3. Complete Sales Invoice Post Flow (Traced)

### 3.1 HTTP entry

**Route:** `POST /api/v1/sales/invoices/:id/post`  
**File:** `apps/api/src/modules/sales/sales.controller.ts` (L124–129)

| Gate | Value |
|------|-------|
| Auth | JWT → `@TenantId()` tenantId |
| Module | `@RequireModule('sales')` |
| Feature | `@RequireFeature('sales.invoices')` |
| Permission | `@RequirePermissions('sales:invoices:post')` |
| Body | **None today** |

### 3.2 Service method

**File:** `apps/api/src/modules/sales/sales.service.ts` — `postInvoice()` (L231–311)

#### Step-by-step (current order)

| # | Step | Code | Notes |
|---|------|------|-------|
| 1 | Load invoice | `findById(tenantId, id)` L232 | Tenant-scoped; includes lines + product + payments |
| 2 | Status guard | `status === 'draft'` L233–235 | Blocks re-post (`posted` invoices rejected) |
| 3 | Warehouse guard | `warehouseId` required L236–238 | **Required even for non-stock lines** |
| 4 | Amount prep | `totalNum = Number(invoice.total)` L240 | JS number conversion |
| 5 | COGS accumulator | `cogsTotal = 0` L241 | JS number sum |
| 6 | **Transaction start** | `prisma.$transaction(async (tx) => {` L243 | Caller-owned boundary |
| 7 | Per-line inventory loop | L244–277 | See §5 |
| 8 | Legacy GL | `accounting.createEntry(...)` L279–296 | See §4 |
| 9 | Customer balance | `customer.balance += invoice.total` if `customerId` L298–303 | Subledger field, not GL |
| 10 | Invoice status | `status='posted'`, `postedAt=now()` L305–309 | |
| 11 | **Transaction end** | return updated invoice | |

#### Not in `postInvoice`

| Concern | Where it lives |
|---------|----------------|
| Party → Customer resolution | `createInvoiceFromParty` only (create time) |
| Payment / cash | `recordPayment` — **separate** transaction + GL |
| Audit | **No** audit on post; audit only on `createInvoiceFromParty` / `recordPaymentFromParty` |
| Invoice total recalculation | Done at **create** (`calcLine`); post uses stored `invoice.total` |
| Tax as separate GL line | **Not implemented** — tax rolls into `total` / Revenue |
| Discount as separate GL line | **Not implemented** — discount reduces line gross at create |

---

## 4. Accounting Today — Legacy Journal

### 4.1 Engine

**File:** `apps/api/src/common/services/accounting-engine.service.ts`

- Resolves accounts by **hardcoded COA code** strings
- Balance check: JS `number` sum, tolerance `0.0001`
- Creates `JournalEntry` with `referenceType` / `referenceId` only
- **Does not set:** `sourceModule`, `sourceType`, `sourceEvent`, `fiscalPeriodId`, dimensions
- **Does not check** fiscal periods

### 4.2 Journal construction in `postInvoice`

**File:** `sales.service.ts` L279–296

#### Case A — Invoice with inventory COGS (`cogsTotal > 0`)

Typical tracked-product invoice (integration tests use this path):

| # | Side | Account code | Role name (seed) | Amount | Description |
|---|------|--------------|------------------|--------|-------------|
| 1 | Dr | `1100` | Accounts Receivable | `Number(invoice.total)` | AR |
| 2 | Cr | `4000` | Sales Revenue | `Number(invoice.total)` | Revenue |
| 3 | Dr | `5000` | Cost of Goods Sold | `cogsTotal` | COGS |
| 4 | Cr | `1200` | Inventory | `cogsTotal` | Inventory |

**4 journal lines.** AR/Revenue use **invoice total** (includes tax). COGS/Inventory use **computed `cogsTotal`** (excludes tax — cost based on qty × unit cost only).

#### Case B — No COGS (`cogsTotal === 0`)

When **all** lines are skipped in inventory loop (see §5.3), legacy **omits** COGS lines via conditional spread:

| # | Side | Account code | Amount |
|---|------|--------------|--------|
| 1 | Dr | `1100` | `Number(invoice.total)` |
| 2 | Cr | `4000` | `Number(invoice.total)` |

**2 journal lines.**

#### Case C — Tax and discount behavior

**At invoice create** (`calcLine`, L56–64):

```text
gross     = qty × unitPrice − discount
taxAmount = gross × taxRate / 100
lineTotal = gross + taxAmount
invoice.total = Σ gross + Σ taxAmount   // stored on SalesInvoice
```

**At post:**

- **Revenue** credited for **`invoice.total`** (gross + tax combined)
- **No** separate tax payable / VAT line
- **No** separate discount line
- **COGS** unaffected by tax/discount (based on quantity × unit cost)

#### Case D — Payment / cash

**Not part of post.** Cash receipt is `recordPayment()`:

- Dr `1000` Cash / Cr `1100` AR
- Separate `referenceType: customer_payment`

#### Case E — Customer optional

- GL **always** posts Dr AR / Cr Revenue for full total
- `customer.balance` incremented **only if** `invoice.customerId` is set
- Walk-in invoice without customer still creates AR journal

### 4.3 Legacy identity fields

| Field | Value on post |
|-------|---------------|
| `referenceType` | `'sales_invoice'` |
| `referenceId` | `invoice.id` |
| `sourceModule` | `NULL` |
| `fiscalPeriodId` | `NULL` |

**Verified by:** `apps/api/test/sales.integration.spec.ts` — `uses legacy AccountingEngineService path on post`

---

## 5. COGS / Inventory Audit — Critical

### 5.1 Valuation method

**Weighted average cost** on inbound movements only.

**File:** `apps/api/src/common/services/inventory-ledger.service.ts` (L48–76)

- `stock_balances.avgCost` updated when `quantity > 0` AND `unitCost <> 0`
- **Outbound (`sale`) does not recalculate `avgCost`** — prior average retained

Documented in `docs/PHASE_7_INVENTORY_DESIGN.md` §4.

### 5.2 Sales post → inventory path

**File:** `sales.service.ts` L244–277

For each `invoice.lines` entry:

| Condition | Action |
|-----------|--------|
| `!line.productId` | **Skip** — no movement, no COGS for line |
| `!product.trackInventory` | **Skip** |
| Otherwise | Deduct stock + accumulate COGS |

Per qualifying line:

1. **Read** `stockBalance` for `(tenantId, warehouseId, productId)` **before** movement
2. **Unit cost:** `balance.avgCost` if balance exists, else `product.costPrice` (L259–260)
3. **COGS add:** `cogsTotal += unitCost * Number(line.quantity)` (L261) — **JS number arithmetic**
4. **Movement:** `applyMovement({ movementType: 'sale', quantity: -qty, unitCost, referenceType: 'sales_invoice', referenceId: invoice.id })` (L263–276)

**Order matters:** COGS uses **pre-deduction** average cost (correct for WA at sale time).

### 5.3 When COGS is zero

| Scenario | COGS |
|----------|------|
| Service / text-only lines (`productId` null) | 0 |
| Product with `trackInventory = false` | 0 |
| `unitCost = 0` (zero avgCost and zero costPrice) | 0 (still moves stock if tracked) |
| All lines skipped | 0 → 2-line GL only |

### 5.4 Stock behavior

| Behavior | Implementation |
|----------|----------------|
| Insufficient stock | `applyMovement` throws `BadRequestException('Insufficient stock for this movement')` L79–80 |
| Negative stock | **Blocked** — transaction rolls back; **no GL** |
| Zero quantity movement | Rejected before balance update |
| Concurrent sales | Same `$transaction` serializes per request; balance update uses atomic SQL upsert |
| Warehouse | **Required** on invoice (`warehouseId` guard) even if no tracked products |
| Branch on movement | `invoice.branchId` passed to movement |

### 5.5 Precision / rounding

| Layer | Type | Risk |
|-------|------|------|
| Invoice amounts | `Decimal(18,4)` in DB | Low |
| `totalNum` / `cogsTotal` at post | JS `number` | **Micro-drift vs FPS Decimal** on migration |
| Legacy GL balance check | JS number ±0.0001 | Legacy only |
| FPS posting | `Prisma.Decimal` | Phase 8.3 must pass **same computed COGS** as string/Decimal |

**Implementation note:** Phase 8.3 should compute `cogsTotal` with `Prisma.Decimal` (or round to 4dp) before FPS `amounts.cogs` to avoid legacy/FPS divergence.

### 5.6 Integration test evidence

**File:** `apps/api/test/sales.integration.spec.ts`

- `posts Party-aware invoice with atomic stock update` — verifies qty −2 on post
- Products created with `trackInventory: true` in test helpers
- **No test** today asserts 4-line COGS journal vs 2-line service invoice

---

## 6. FinancialPostingService Audit

### 6.1 Seeded rule: `sales/invoice/post`

**File:** `apps/api/src/modules/finance/posting/posting-rule.service.ts` (L10–20)

| Seq | Account role | Side | amountSource | Description |
|-----|--------------|------|--------------|-------------|
| 1 | `accounts_receivable` | debit | `total` | AR |
| 2 | `revenue` | credit | `total` | Revenue |
| 3 | `cost_of_goods_sold` | debit | `cogs` | COGS |
| 4 | `inventory` | credit | `cogs` | Inventory |

**Role → COA** (`account-roles.constants.ts`): AR=`1100`, Revenue=`4000`, COGS=`5000`, Inventory=`1200` — **matches legacy codes** when finance foundation is seeded.

### 6.2 Zero-amount line handling

**File:** `financial-posting.service.ts` — `resolveRuleLines()` (L192–196)

```typescript
if (!rawAmount || rawAmount.isZero()) {
  continue;  // skip line
}
```

When `amounts.cogs = 0` (or omitted/zero):

- Lines 3–4 **skipped**
- Lines 1–2 produce **2-line journal** — **matches legacy Case B**

When `amounts.cogs > 0`:

- **4-line journal** — **matches legacy Case A**

Requires `resolved.length >= 2` (L214–216) — satisfied in both cases.

### 6.3 Missing capabilities?

| Legacy behavior | FPS rule support |
|-----------------|------------------|
| AR + Revenue at invoice.total | ✅ `amountSource: total` |
| Optional COGS pair | ✅ `cogs` skipped when zero |
| Separate tax line | N/A — legacy doesn't have it |
| Separate discount line | N/A — legacy doesn't have it |
| Per-line COGS accounts | ❌ Not in legacy — not required |
| Cash on same event | ❌ Not in legacy — payment is separate |

**Conclusion:** Existing seeded rule **can express current Sales post semantics**. No rule redesign required for Phase 8.3.

### 6.4 Proposed FPS call (implementation reference)

```typescript
await financialPosting.post({
  mode: 'rule',
  tenantId,
  branchId: invoice.branchId,
  postingDate: new Date(), // or invoice.invoiceDate — decide in implementation
  description: `Sales invoice ${invoice.number}`,
  sourceModule: 'sales',
  sourceType: 'invoice',
  sourceId: invoice.id,
  sourceEvent: 'post',
  amounts: {
    total: invoice.total.toString(),
    cogs: cogsTotalDecimal.toString(), // computed in same loop
  },
  dimensions, // optional Phase 8.1
}, tx);
```

### 6.5 FPS extras (behavior change when pilot ON)

| Feature | Legacy | FPS pilot |
|---------|--------|-----------|
| Fiscal period check | ❌ | ✅ open period required |
| `sourceModule/sourceEvent` | ❌ | ✅ `sales/invoice/{id}/post` |
| Idempotency DB unique | ❌ | ✅ on source tuple |
| Dimension validation | ❌ | ✅ Phase 8.1 |
| Decimal precision | JS number | Decimal |

---

## 7. Dimensions

### 7.1 Entry point (proposed)

Mirror Phase 8.2 PO receive:

```http
POST /api/v1/sales/invoices/:id/post
Content-Type: application/json

{
  "dimensions": {
    "projectId": "optional-uuid",
    "costCenterId": "optional-uuid"
  }
}
```

Body optional — backward compatible empty POST.

### 7.2 Flow

```text
Sales invoice post (pilot ON)
    ↓
optional dimensions on HTTP body
    ↓
SalesService.postInvoice(tenantId, id, dimensions?)
    ↓
[inventory loop — unchanged]
    ↓
FinancialPostingService.post({ ..., dimensions }, tx)
    ↓
PostingDimensionService validation (Phase 8.1)
    ↓
journal_lines.projectId / costCenterId
```

### 7.3 Scope decisions

| Decision | Recommendation |
|----------|----------------|
| Store dimensions on `sales_invoices` table | ❌ Defer — post-time input only (same as 8.2) |
| Per-line dimensions | ❌ Out of scope — entry-level only |
| Require Projects license | ❌ No — Phase 8.1 rule (validate existence only) |
| Department dimension | ❌ Not in Sales API for 8.3 |

### 7.4 Branch compatibility

Dimensions validated against **`invoice.branchId`** (posting branch) per Phase 8.1 rules.

---

## 8. Transaction Boundary & Idempotency

### 8.1 Current transaction (preserve exactly)

```text
prisma.$transaction(tx):
  1. Inventory movements (may throw insufficient stock)
  2. GL post (legacy OR FPS — one path)
  3. Customer balance increment (if customerId)
  4. Invoice status → posted
```

Inventory failure **must** roll back GL — already true.

### 8.2 Idempotency / retry

| Mechanism | Legacy | FPS pilot |
|-----------|--------|-----------|
| Re-post same invoice | Blocked: `status !== 'draft'` | Same business guard |
| Duplicate HTTP retry on draft | Theoretically double post if concurrent | FPS unique `(tenantId, sales, invoice, id, post)` prevents duplicate GL |
| Concurrent double post race | **Pre-existing risk** on status check | FPS adds DB-level idempotency |

Phase 8.3 should **not weaken** status guard; FPS idempotency is additive protection.

### 8.3 Audit

`postInvoice` has **no** `AuditService.log` today. Phase 8.3: optional audit after commit — **not required** unless product asks (consistent with PO receive).

---

## 9. No Double Posting — Design Rule

Same strict pattern as Phase 8.2:

```typescript
if (useSalesFinancePilot) {
  await financialPosting.post(..., tx);
} else {
  await accounting.createEntry(..., tx);
}
```

**Never both** for the same `postInvoice` execution.

### Required regression tests (implementation)

| # | Test |
|---|------|
| 1 | Flag OFF → legacy journal (`referenceType=sales_invoice`, `sourceModule IS NULL`) |
| 2 | Flag OFF → no FPS `sourceModule=sales` journal |
| 3 | Flag ON → exactly one FPS journal (`sourceEvent=post`) |
| 4 | Flag ON → no legacy duplicate; journal count = 1 |
| 5 | Flag ON + tracked product → 4 GL lines, COGS = qty × unit cost |
| 6 | Flag ON + service-only invoice → 2 GL lines (cogs=0) |
| 7 | Flag ON + dimensions → persisted on all journal lines |
| 8 | Stock + customer balance unchanged vs flag OFF |
| 9 | Insufficient stock → no journal (either path) |

---

## 10. Feature Flag Strategy

### 10.1 Problem

Phase 8.2 flag `UNIVERSAL_FINANCE_PILOT_ENABLED` currently means **PO receive only**. Reusing it for Sales would change deployment semantics for existing adopters.

### 10.2 Recommended approach

Add a **separate** deployment flag:

| Env variable | Default | Scope |
|--------------|---------|-------|
| `UNIVERSAL_FINANCE_PILOT_ENABLED` | `false` | PO receive (Phase 8.2 — unchanged) |
| `UNIVERSAL_FINANCE_SALES_PILOT_ENABLED` | `false` | Sales invoice post (Phase 8.3 — new) |

Both are `AppConfig` booleans (not commercial entitlements), following `partyLegacyRoutingEnabled` pattern.

**Alternative (not recommended):** Single flag enables both — simpler but breaks Phase 8.2 deployment contract.

### 10.3 Settings exposure

Add `universalFinanceSalesPilotEnabled` to `GET /settings` deployment flags (mirror Phase 8.2).

---

## 11. Commercial Licensing & RBAC

### 11.1 Sales post (unchanged gates)

| Gate | Requirement |
|------|-------------|
| Module | `sales` |
| Feature | `sales.invoices` |
| Permission | `sales:invoices:post` |

### 11.2 Finance when pilot ON

Internal FPS call — **do not** add `@RequireFeature('finance.financial-posting')` to Sales route.

**Operational prerequisite:** Finance foundation seeded (COA role mappings, posting rules, open fiscal period) — same as Phase 8.2.

Pilot ON without finance setup → runtime error (400/404 from FPS) — document clearly.

### 11.3 Dimensions licensing

Per Phase 8.1: **no** Projects module license required to pass dimension IDs; FPS validates master data only.

---

## 12. Module Dependencies (Implementation)

```text
SalesModule
  imports: [FinanceModule]   // NEW
  providers: [SalesService, ...]

SalesService
  inject: FinancialPostingService
  read: getAppConfig().universalFinanceSalesPilotEnabled
```

No circular imports (FinanceModule does not import SalesModule).

---

## 13. Pilot Selection Confirmation

| Candidate | Verdict |
|-----------|---------|
| **`SalesService.postInvoice()`** | ✅ **Selected** — single post event, FPS rule ready, tests exist |
| `recordPayment()` | ❌ Second lifecycle event — defer to 8.4+ |
| `createInvoice()` | ❌ No GL |
| POS `createSale()` | ❌ Out of scope; known COGS gap vs Sales |

### Why postInvoice over alternatives

1. Natural next step after PO receive bridge  
2. Seeded FPS rule matches legacy 2/4-line behavior including COGS skip  
3. Inventory COGS logic already co-located in same method  
4. Existing integration tests for stock + legacy GL path  
5. Payment remains on legacy — clean separation AR vs cash  

---

## 14. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| JS number COGS vs Decimal FPS | Medium | Compute COGS as Decimal in 8.3; test equality with legacy cases |
| Fiscal period rejection (pilot ON) | High | Document finance seed requirement; clear error message |
| Warehouse required for service invoices | Low | Preserve existing guard — do not relax in 8.3 |
| Tax in revenue not broken out | Low | No change — same semantic in FPS |
| Flag scope confusion | Medium | Separate `UNIVERSAL_FINANCE_SALES_PILOT_ENABLED` |
| Concurrent draft post race | Low | Pre-existing; FPS idempotency helps pilot path |
| PMS flaky test (240/241) | N/A | **Do not touch PMS in 8.3** |

---

## 15. Phase 8.3 Implementation Scope (When Approved)

### In scope ✅

1. `UNIVERSAL_FINANCE_SALES_PILOT_ENABLED` config + `.env.example`  
2. Flag-gated FPS swap in `SalesService.postInvoice` only  
3. Optional `dimensions` on post endpoint  
4. `SalesModule` → `FinanceModule` import  
5. Decimal-safe COGS computation for FPS amounts  
6. Integration tests (§9)  
7. `docs/PHASE_8_3_SALES_FINANCE_COMPLETE.md`  

### Out of scope ❌

- `recordPayment`, POS, Purchasing (already has separate flag)  
- Sales invoice schema columns for dimensions  
- Tax / discount GL breakout  
- PMS changes or flaky test fix  
- Construction, Phase 9  
- Removing legacy `AccountingEngineService` path  

---

## 16. STOP Conditions

Do **not** start implementation until this design is approved.

Do **not** declare Phase 8.3 complete unless:

- [ ] Only `postInvoice` migrated under sales pilot flag  
- [ ] No double posting (strict if/else)  
- [ ] COGS zero and non-zero cases match legacy line counts  
- [ ] Inventory + customer balance parity with flag OFF  
- [ ] Dimension optional path tested  
- [ ] PMS untouched  
- [ ] Typecheck + integration suite pass  

---

## 17. Key Code References

| Topic | Path |
|-------|------|
| Sales post | `apps/api/src/modules/sales/sales.service.ts` L231–311 |
| Sales controller | `apps/api/src/modules/sales/sales.controller.ts` L124–129 |
| Legacy GL engine | `apps/api/src/common/services/accounting-engine.service.ts` |
| Inventory ledger | `apps/api/src/common/services/inventory-ledger.service.ts` |
| FPS posting | `apps/api/src/modules/finance/posting/financial-posting.service.ts` |
| Sales FPS rule | `apps/api/src/modules/finance/posting/posting-rule.service.ts` L10–20 |
| Account roles | `apps/api/src/modules/finance/posting/account-roles.constants.ts` |
| Dimension validation | `apps/api/src/modules/finance/posting/posting-dimension.service.ts` |
| PO receive bridge (pattern) | `apps/api/src/modules/purchasing/purchasing.service.ts` L180–250 |
| Sales tests | `apps/api/test/sales.integration.spec.ts` |
| Phase 8.2 bridge | `docs/PHASE_8_2_FINANCE_MIGRATION_BRIDGE_COMPLETE.md` |
| Inventory COGS design | `docs/PHASE_7_INVENTORY_DESIGN.md` §4–5 |

---

## 18. Summary

**`SalesService.postInvoice()`** is the approved Phase 8.3 pilot:

```text
Sales Invoice (draft)
    ↓
Validation (status, warehouse)
    ↓
Inventory deduction + COGS computation (unchanged)
    ↓
[pilot OFF] AccountingEngineService  |  [pilot ON] FinancialPostingService (rule)
    ↓
Customer balance + status posted
    ↓
JournalLines with optional Project / Cost Center (pilot ON + dimensions)
```

The existing **`sales/invoice/post`** FPS rule **supports** current legacy semantics including optional COGS. The main implementation work is the **controlled flag**, **no-double-post guard**, **Decimal-safe COGS handoff**, **dimensions on post**, and **regression tests** — not new accounting logic.

Await approval before coding.
