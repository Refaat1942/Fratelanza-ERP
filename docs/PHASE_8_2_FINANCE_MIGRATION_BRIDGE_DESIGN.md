# Phase 8.2 — Finance Migration Bridge Design

**Status:** Design complete — **Phase 8.2 implemented** — see [PHASE_8_2_FINANCE_MIGRATION_BRIDGE_COMPLETE.md](./PHASE_8_2_FINANCE_MIGRATION_BRIDGE_COMPLETE.md)  
**Date:** 2026-09-07  
**Prerequisites:** Phase 8.1 Finance Dimensions ✅, Phase 6 Purchasing ✅, Phase 5 Sales ✅, Phase 2 Finance ✅

---

## 1. Executive Summary

Phase 8.2 introduces a **controlled migration bridge**: one real business transaction will optionally post through **`FinancialPostingService` (FPS)** with validated **Project / Cost Center dimensions**, while all other commercial GL events remain on legacy **`AccountingEngineService`**.

This is a **foundation / pilot phase**, not a full Sales/Purchasing ERP accounting migration.

**Audit conclusion:** The safest first pilot is **`PurchasingService.receiveOrder()`** — purchase order receive (Dr Inventory / Cr AP). Sales invoice post is a valid second candidate but is materially more complex (COGS variability, warehouse requirements, up to four GL lines).

**Do not implement both pilots in Phase 8.2** unless scope is explicitly expanded later.

---

## 2. Commercial Model (Unchanged)

Fratelanza is **perpetual / one-time license**. Modules are independently licensable.

| Concern | Mechanism |
|---------|-----------|
| Module access | `TenantLicense` + `@RequireModule` |
| Feature access | `@RequireFeature` + `EntitlementService` |
| Action access | RBAC `@RequirePermissions` |
| Deployment toggles | `AppConfig` env flags (not commercial entitlements) |

Phase 8.2 adds a **deployment feature flag** only. It does **not** introduce a new licensing product or cross-module commercial coupling.

---

## 3. End-to-End Audit — Current Accounting Touchpoints

### 3.1 Summary Matrix

| Business event | Service method | HTTP route | Inventory | GL engine | GL lines | Source identity (legacy) | FPS rule seeded? |
|----------------|----------------|------------|-----------|-----------|----------|--------------------------|------------------|
| PO create | `createOrder` | `POST /purchasing/orders` | ❌ | ❌ | — | — | ❌ |
| PO receive | `receiveOrder` | `POST /purchasing/orders/:id/receive` | ✅ purchase in | **AccountingEngine** | 2 fixed | `referenceType=purchase_order`, `referenceId=order.id` | ✅ `purchasing/order/receive` |
| Sales invoice create | `createInvoice` | `POST /sales/invoices` | ❌ | ❌ | — | — | ❌ |
| Sales invoice post | `postInvoice` | `POST /sales/invoices/:id/post` | ✅ sale out | **AccountingEngine** | 2 or 4 | `referenceType=sales_invoice`, `referenceId=invoice.id` | ✅ `sales/invoice/post` |
| Customer payment | `recordPayment` | `POST /sales/payments` | ❌ | **AccountingEngine** | 2 fixed | `referenceType=customer_payment`, `referenceId=payment.id` | ✅ `sales/payment/post` |
| POS sale | `createSale` | `POST /pos/sales` | optional out | **AccountingEngine** | 2 fixed | legacy reference only | ✅ `pos/sale/post` |

**Universal Finance manual posting:** `POST /finance/postings/*` — already on FPS with dimensions (Phase 8.1).

---

## 4. Traced Flow — Purchase Order Receive (Preferred Pilot)

### 4.1 Sequence (current production code)

**File:** `apps/api/src/modules/purchasing/purchasing.service.ts` — `receiveOrder()`

```text
POST /api/v1/purchasing/orders/:id/receive
  @RequireModule('purchasing')
  @RequireFeature('purchasing.orders')
  @RequirePermissions('purchasing:orders:receive')
  tenantId ← JWT (@TenantId)
        ↓
findById(tenantId, id)          // 404 if cross-tenant
guard: status !== 'received'    // 400 if already received
        ↓
prisma.$transaction(tx) {
  FOR each PO line with remaining qty:
    InventoryLedgerService.applyMovement({
      movementType: 'purchase',
      quantity: +remaining,
      referenceType: 'purchase_order',
      referenceId: order.id,
      branchId: order.branchId,
      warehouseId: order.warehouseId,
    }, tx)
    UPDATE purchaseOrderLine.receivedQty

  AccountingEngineService.createEntry(
    tenantId, order.branchId,
    Dr 1200 / Cr 2000 for order.total,
    referenceType: 'purchase_order',
    referenceId: order.id,
    tx
  )

  UPDATE supplier.balance += order.total
  UPDATE purchaseOrder status='received', receivedAt=now()
}
```

### 4.2 Transaction boundary

| Step | Inside `$transaction` | Rollback if GL fails |
|------|----------------------|----------------------|
| Stock movements | ✅ | ✅ |
| Line receivedQty | ✅ | ✅ |
| GL journal | ✅ | ✅ |
| Supplier balance | ✅ | ✅ |
| PO status | ✅ | ✅ |

**Single atomic boundary** — ideal for pilot. Inventory and GL already share one caller-owned transaction (matches FPS requirement: no nested `$transaction`).

### 4.3 Branch semantics

- `branchId` set on PO at create (required in `CreatePoDto`)
- Passed to `InventoryLedgerService.applyMovement` and `AccountingEngineService.createEntry`
- FPS pilot will use `order.branchId` as posting branch (same as today)

### 4.4 Party / Supplier resolution

- Party → Supplier resolution happens at **`createOrderFromParty`** only (`PartyLegacyAdapterService.resolveLinkedSupplierForPurchasing`)
- **`receiveOrder` does not touch Party** — uses `order.supplierId` already stored on PO
- Pilot does not require Party routing flag changes

### 4.5 Source / idempotency conventions

| Field | Legacy (`AccountingEngineService`) | FPS (seeded rule — not wired) |
|-------|-----------------------------------|-------------------------------|
| Entry identity | `referenceType` + `referenceId` | `sourceModule` + `sourceType` + `sourceId` + `sourceEvent` |
| Legacy receive | `purchase_order` + `order.id` | — |
| FPS receive (proposed) | mirror via `referenceType/Id` | `purchasing` + `order` + `order.id` + `receive` |
| Idempotency | **None** — relies on PO `status !== received` guard | Unique `(tenantId, sourceModule, sourceType, sourceId, sourceEvent)` |
| Fiscal period | **Not checked** (legacy) | **Checked** via `FiscalPeriodService` when FPS used |

**Behavior change when pilot ON:** receive will reject posting if no open fiscal period covers receive date (today). Finance foundation seed (`FinanceSetupService`) must be applied for pilot tenants.

### 4.6 Accounting amounts

```typescript
// Legacy hardcoded (purchasing.service.ts L210-217)
Dr 1200 Inventory  = Number(order.total)
Cr 2000 AP         = Number(order.total)
```

**FPS seeded rule** (`posting-rule.service.ts`):

```text
sourceModule: purchasing, sourceType: order, event: receive
Dr inventory (role)     amountSource: total
Cr accounts_payable     amountSource: total
```

**Role → COA mapping** (`account-roles.constants.ts`): inventory=`1200`, AP=`2000` — **matches legacy codes** when default finance seed is applied.

### 4.7 Audit

- `receiveOrder` has **no** `AuditService.log` today
- Only `createOrderFromParty` logs `purchasing.order.created_from_party`
- Phase 8.2 may add optional audit on pilot receive (after transaction commit — Phase 7 concurrency lesson)

### 4.8 Existing integration tests

**File:** `apps/api/test/purchasing.integration.spec.ts`

| Test | Asserts |
|------|---------|
| `receives Party-aware order with stock increase` | Receive succeeds, stock up |
| `does not duplicate receive when order already received` | Second receive → 400 |
| `does not create journals on draft Party-aware order` | Create ≠ GL |
| `uses legacy AccountingEngineService path on receive` | `referenceType=purchase_order`, `sourceModule IS NULL`, no FPS journal |

---

## 5. Traced Flow — Sales Invoice Post (Alternative Pilot)

### 5.1 Sequence

**File:** `apps/api/src/modules/sales/sales.service.ts` — `postInvoice()`

```text
POST /api/v1/sales/invoices/:id/post
        ↓
guard: status === 'draft'
guard: warehouseId required
        ↓
prisma.$transaction(tx) {
  FOR each invoice line with productId + trackInventory:
    compute unitCost from stock balance avgCost or product.costPrice
    InventoryLedgerService.applyMovement(sale, qty negative, ...)
    accumulate cogsTotal

  AccountingEngineService.createEntry(
    Dr 1100 AR     = invoice.total
    Cr 4000 Revenue = invoice.total
    [optional if cogsTotal > 0:]
    Dr 5000 COGS
    Cr 1200 Inventory
    referenceType: sales_invoice, referenceId: invoice.id
  )

  IF customerId: customer.balance += invoice.total
  UPDATE invoice status='posted'
}
```

### 5.2 Why Sales is second choice

| Factor | Purchase receive | Sales invoice post |
|--------|------------------|-------------------|
| GL line count | Always 2 | 2 or 4 (COGS conditional) |
| Amount sources | Single `total` | `total` + `cogs` (computed) |
| Preconditions | PO exists | Warehouse required |
| Inventory coupling | Always receives all remaining lines | Per-product trackInventory skip |
| FPS rule zero-line handling | N/A | COGS lines skipped when zero |
| Customer subledger | Supplier balance only | Customer balance + optional paidAmount on payments |
| Existing tests | Receive idempotency via status | Post idempotency via draft status |

Sales remains documented as **Phase 8.3+ candidate** if purchasing pilot succeeds.

### 5.3 Sales payment (not recommended as first pilot)

`recordPayment()` — simpler 2-line GL (Dr Cash / Cr AR) but is a **second** accounting event in the sales lifecycle, often after invoice post. Better as follow-on after invoice pilot.

---

## 6. Traced Flow — Other Modules (Out of Scope)

### 6.1 POS (`pos.service.ts`)

- Single transaction: sale + optional stock + `AccountingEngineService` (Dr Cash / Cr Revenue)
- No Party adapter, no dimensions
- **Frozen for Phase 8.2**

### 6.2 Inventory (`InventoryLedgerService`)

- Stock mutations only — **no GL**
- Called from Sales post, PO receive, POS, inventory adjust API
- Phase 8.2: **no changes** to inventory service

### 6.3 Legacy `AccountingEngineService`

**File:** `apps/api/src/common/services/accounting-engine.service.ts`

Creates `JournalEntry` with:

- `tenantId`, `branchId`, `number`, `description`, `referenceType`, `referenceId`
- Lines: `accountId`, `debit`, `credit`, `description` only
- **No:** `fiscalPeriodId`, `sourceModule/sourceType/sourceId/sourceEvent`, dimensions
- Balance check via JavaScript `number` tolerance (legacy)
- **No idempotency** — duplicate prevention is business-layer status guards

### 6.4 `FinancialPostingService` (Phase 8.1)

- Caller-owned transaction required
- Validates branch, fiscal period, dimensions, balanced lines
- Idempotent on source tuple + idempotencyKey
- Writes `projectId` / `costCenterId` on `journal_lines` with FK + validation

---

## 7. Pilot Selection — Decision

### 7.1 Selected pilot

**`PurchasingService.receiveOrder()`** — Purchase Order Receive

### 7.2 Rationale (evidence-based)

1. **Simplest GL shape** — always Dr Inventory / Cr AP for `order.total`; 1:1 match with seeded FPS posting rule.
2. **Single accounting event per document** — status guard + FPS idempotency double protection against duplicate journals.
3. **Existing FPS rule** — `purchasing/order/receive` already seeded; no new rule design needed.
4. **COA alignment** — default role mappings resolve to same codes legacy uses (`1200`, `2000`).
5. **One transaction boundary** — inventory + GL + supplier balance already atomic; FPS drops in as swap for `createEntry` only.
6. **Party isolation** — receive does not depend on Party routing flags.
7. **Dimension-friendly** — optional `dimensions` on receive body; entry-level dimensions apply to both GL lines (Phase 8.1 merge rules).
8. **Test baseline** — purchasing integration tests already assert legacy path and absence of FPS journals; easy to add flag-on/off regression.

### 7.3 Why not Sales invoice post (Phase 8.2)

- Variable COGS lines require passing `amounts: { total, cogs }` to FPS rule mode with computed COGS inside same transaction.
- Warehouse and `trackInventory` conditionals increase pilot failure surface.
- Higher regression risk for stock + multi-line GL coupling.

**Defer Sales to Phase 8.3** after purchasing pilot is proven in production.

---

## 8. Target Architecture (Phase 8.2)

### 8.1 Conceptual flow (pilot ON)

```text
POST /purchasing/orders/:id/receive
  body?: { dimensions?: { projectId?, costCenterId? } }
        ↓
License: purchasing module + purchasing.orders feature
RBAC: purchasing:orders:receive
tenantId ← JWT (never from body)
        ↓
Existing receive validation + inventory movements (unchanged)
        ↓
IF UNIVERSAL_FINANCE_PILOT_ENABLED === false:
    AccountingEngineService.createEntry(...)     // legacy — unchanged
ELSE:
    FinancialPostingService.post({
      mode: 'rule',
      sourceModule: 'purchasing',
      sourceType: 'order',
      sourceId: order.id,
      sourceEvent: 'receive',
      branchId: order.branchId,
      postingDate: order.receivedAt ?? now,
      amounts: { total: order.total },
      dimensions: { projectId, costCenterId },   // optional, Phase 8.1 validated
    }, tx)
        ↓
Supplier balance + PO status update (unchanged)
        ↓
JournalEntry / JournalLines
  ├── Account (via roles)
  ├── Debit/Credit
  ├── projectId (optional)
  └── costCenterId (optional)
```

### 8.2 Legacy flows (pilot OFF or other modules)

```text
Sales post / Sales payment / POS / PO receive (flag OFF)
    → AccountingEngineService (unchanged)
```

---

## 9. No Double Posting — Critical Design

### 9.1 Rule

For the **same receive event**, exactly **one** accounting path executes:

```typescript
if (config.universalFinancePilotEnabled) {
  await financialPosting.post(..., tx);
} else {
  await accounting.createEntry(..., tx);
}
```

**Never** call both in the same code path, branch, or retry handler.

### 9.2 Duplicate journal prevention layers

| Layer | Legacy (flag OFF) | Pilot (flag ON) |
|-------|-------------------|-----------------|
| Business | PO status `received` blocks re-receive | Same |
| GL | No DB uniqueness on reference | FPS unique on `(tenantId, purchasing, order, orderId, receive)` |
| Retry | Manual | FPS idempotent re-fetch on conflict |

### 9.3 Regression tests (required in implementation)

| # | Test |
|---|------|
| 1 | Flag OFF: receive creates legacy journal (`sourceModule IS NULL`, `referenceType=purchase_order`) |
| 2 | Flag OFF: no FPS journal for same order |
| 3 | Flag ON: receive creates exactly **one** journal via FPS (`sourceModule=purchasing`, `sourceEvent=receive`) |
| 4 | Flag ON: **no** legacy-style duplicate (count journals for order = 1) |
| 5 | Flag ON + dimensions: `journal_lines` carry validated `projectId`/`costCenterId` |
| 6 | Flag ON: second receive attempt still blocked at business layer (no second journal) |
| 7 | Inventory + supplier balance behavior identical flag ON vs OFF |

---

## 10. Feature Flag

### 10.1 Recommended name

Follow existing `AppConfig` env-flag pattern (`partyLegacyRoutingEnabled`, `purchasingPartyRoutingEnabled`):

| Env variable | Default | Config property |
|--------------|---------|-----------------|
| `UNIVERSAL_FINANCE_PILOT_ENABLED` | `false` | `universalFinancePilotEnabled: boolean` |

**Location:** `packages/config/src/index.ts` → consumed via `getAppConfig()` in `PurchasingService`.

### 10.2 Semantics

| Flag | PO receive accounting | All other GL events |
|------|----------------------|---------------------|
| `false` | Legacy `AccountingEngineService` | Legacy (unchanged) |
| `true` | **FPS rule posting only** | Legacy (unchanged) |

This is a **deployment** toggle, not a tenant license field. Per-tenant rollout can be added later via settings; Phase 8.2 uses global env only (matches Party routing pattern).

### 10.3 `.env.example` addition (implementation)

```env
# Universal Finance migration pilot (Phase 8.2 — PO receive only when true)
UNIVERSAL_FINANCE_PILOT_ENABLED=false
```

---

## 11. Commercial Licensing & RBAC

### 11.1 Pilot receive — required entitlements

| Gate | Requirement |
|------|-------------|
| Module | `purchasing` (`@RequireModule`) |
| Feature | `purchasing.orders` (`@RequireFeature` on receive route) |
| Permission | `purchasing:orders:receive` |
| Finance (pilot ON only) | Tenant must have `finance` module + seeded account roles + open fiscal period |
| Finance feature on route | **Do not** add `@RequireFeature('finance.financial-posting')` to purchasing route — pilot is internal service call |

**Finance module license when pilot ON:** Posting will fail at runtime if finance foundation not seeded (missing roles/period). Document as operational prerequisite; optional pre-check with clear 400 message in implementation.

### 11.2 Project / Cost Center dimensions

Per Phase 8.1 architecture:

- **Do NOT require** `projects` module license merely because optional dimensions are supplied.
- FPS validates dimension IDs against tenant master data (existence, lifecycle, branch compatibility).
- Invalid dimension IDs → 400/404; receive rolls back (transaction).

No new cross-module commercial coupling.

### 11.3 Party / legacy identity

Unchanged. Party routing flags (`PURCHASING_PARTY_ROUTING_ENABLED`) affect order **create** only.

---

## 12. Project / Cost Center Input

### 12.1 API shape (proposed)

Extend receive endpoint with optional body (backward compatible — empty body OK):

```typescript
class ReceivePurchaseOrderDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => PostingDimensionsDto)
  dimensions?: {
    projectId?: string;      // @IsUUID()
    costCenterId?: string;   // @IsUUID()
  };
}

POST /purchasing/orders/:id/receive
Body (optional): { dimensions?: { projectId?, costCenterId? } }
```

Reuse `PostingDimensionsDto` pattern from `finance.controller.ts` (Phase 8.1) — **do not duplicate** validation logic; pass through to FPS `dimensions` and let `PostingDimensionService` enforce rules.

### 12.2 Validation chain

```text
Client dimensions (optional)
  → DTO UUID format check
  → FPS PostingDimensionService (tenant, lifecycle, branch, project↔CC)
  → journal_lines persistence
```

### 12.3 Storage on business document

**Phase 8.2 recommendation:** Do **not** add `projectId`/`costCenterId` columns to `purchase_orders` table in this phase.

- Dimensions supplied at **receive time** only (operational choice at posting event).
- Persisted on **`journal_lines`** only (already Phase 8.1).
- Avoids schema migration on commercial documents until Phase 8.3+.

If product requires audit trail of requested dimensions on PO, defer to explicit Phase 8.3 document fields scope.

---

## 13. Module Dependencies (Implementation Plan)

```text
PurchasingModule
  imports: [FinanceModule]   // NEW — for FinancialPostingService injection
  providers: [PurchasingService, ...]

PurchasingService
  inject: FinancialPostingService, getAppConfig()
```

**Circular dependency check:** FinanceModule does not import PurchasingModule today — safe.

---

## 14. Transaction / Concurrency (Preserve Phase 2.1 Guarantees)

| Guarantee | Phase 8.2 handling |
|-----------|-------------------|
| Caller-owned `$transaction` | `receiveOrder` keeps outer transaction; FPS `post(input, tx)` |
| No nested `$transaction` in FPS | Unchanged |
| Fiscal period locking | Applies when pilot ON |
| FPS idempotency | `purchasing:order:{id}:receive` |
| Balanced lines | FPS `assertBalancedLines` |
| Dimension row locks | Phase 8.1 `FOR UPDATE` on project/CC masters |
| Inventory rollback on GL failure | Unchanged — same transaction |

**Ordering inside transaction (recommended):**

1. Inventory movements  
2. Update receivedQty  
3. GL post (legacy **or** FPS — one path)  
4. Supplier balance  
5. PO status  

If GL fails, inventory rolls back — same as today.

---

## 15. FPS Posting Contract (Pilot)

```typescript
await financialPosting.post({
  mode: 'rule',
  tenantId,
  branchId: order.branchId,
  postingDate: new Date(), // or order.orderDate — document in implementation
  description: `Purchase order ${order.number}`,
  sourceModule: 'purchasing',
  sourceType: 'order',
  sourceId: order.id,
  sourceEvent: 'receive',
  amounts: { total: order.total.toString() }, // Decimal-safe string
  dimensions: input.dimensions, // optional
}, tx);
```

**Legacy mirror (FPS sets automatically):** `referenceType` / `referenceId` populated from sourceType/sourceId in FPS.

---

## 16. Explicit Phase 8.2 Boundaries

### 16.1 In scope (implementation phase)

| # | Deliverable |
|---|-------------|
| 1 | `UNIVERSAL_FINANCE_PILOT_ENABLED` in `@fratelanza/config` + `.env.example` |
| 2 | `PurchasingService.receiveOrder` — flag-gated FPS swap |
| 3 | Optional `dimensions` on receive endpoint |
| 4 | `PurchasingModule` imports `FinanceModule` |
| 5 | Integration tests: flag OFF legacy regression + flag ON FPS + no double post + dimensions |
| 6 | Test helper to toggle pilot flag (mirror `withPurchasingPartyRoutingAsync`) |
| 7 | `docs/PHASE_8_2_FINANCE_MIGRATION_BRIDGE_COMPLETE.md` |

### 16.2 Out of scope — DO NOT implement

| Item | Reason |
|------|--------|
| Sales → FPS migration | Deferred Phase 8.3 |
| Sales payment → FPS | Deferred |
| POS → FPS | Frozen |
| `projectId`/`costCenterId` on PO/Sales schemas | Phase 8.3+ |
| Dimension profitability reports | Reporting phase |
| Trial balance by dimension | Reporting phase |
| New finance journal read APIs | Not requested |
| Construction / BOQ / budgets / subledgers | Hard STOP |
| Inventory module changes | Phase 7 complete |
| PMS / Party schema changes | Unrelated |
| `AccountingEngineService` rewrite | Legacy frozen |
| Remove legacy path | Pilot must keep flag OFF path identical |

---

## 17. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Fiscal period rejection when pilot ON | **High** | Document finance seed prerequisite; clear 400 message |
| Finance roles not seeded → FPS NotFound | Medium | Test-app finance foundation; ops checklist |
| Behavior delta legacy vs FPS journals | Medium | Tests assert both paths; trial balance may differ by period filter |
| Accidental double post in code | **Critical** | Strict if/else; regression test journal count = 1 |
| Pilot ON without finance license | Medium | Runtime error; optional explicit check before FPS call |
| Dimension on receive but no projects master | Low | FPS validation rejects invalid IDs |

---

## 18. STOP Conditions

Do **not** declare Phase 8.2 complete unless:

- [ ] Audit-approved pilot only (PO receive) — no scope creep to Sales
- [ ] Flag OFF → byte-for-byte behavioral parity with pre-8.2 legacy receive GL
- [ ] Flag ON → exactly one FPS journal per receive; zero legacy duplicate
- [ ] Optional dimensions validated and persisted on lines when supplied
- [ ] No Construction code
- [ ] Full integration suite passes
- [ ] Typecheck passes all workspaces

Do **not** start implementation until this design is approved.

---

## 19. Key File References

| Area | Path |
|------|------|
| PO receive (pilot site) | `apps/api/src/modules/purchasing/purchasing.service.ts` |
| Purchasing controller | `apps/api/src/modules/purchasing/purchasing.controller.ts` |
| Sales post (deferred) | `apps/api/src/modules/sales/sales.service.ts` |
| Legacy GL | `apps/api/src/common/services/accounting-engine.service.ts` |
| Universal GL | `apps/api/src/modules/finance/posting/financial-posting.service.ts` |
| Dimension validation | `apps/api/src/modules/finance/posting/posting-dimension.service.ts` |
| Posting rules | `apps/api/src/modules/finance/posting/posting-rule.service.ts` |
| Account roles | `apps/api/src/modules/finance/posting/account-roles.constants.ts` |
| Inventory | `apps/api/src/common/services/inventory-ledger.service.ts` |
| App config / flags | `packages/config/src/index.ts` |
| Purchasing tests | `apps/api/test/purchasing.integration.spec.ts` |
| Sales GL tests | `apps/api/test/sales.integration.spec.ts` |
| Phase 8.1 dimensions | `docs/PHASE_8_1_FINANCE_DIMENSIONS_COMPLETE.md` |
| Phase 6 purchasing | `docs/PHASE_6_PURCHASING_COMPLETE.md` |

---

## 20. Summary

Phase 8.2 is a **single-transaction migration bridge**:

- **Pilot:** Purchase Order Receive (`receiveOrder`)
- **Why:** Simplest GL, existing FPS rule, atomic inventory+GL boundary, strongest test baseline
- **Flag:** `UNIVERSAL_FINANCE_PILOT_ENABLED=false` by default
- **No double posting:** Strict if/else between legacy and FPS
- **Dimensions:** Optional on receive body → FPS → `journal_lines`
- **Everything else:** Stays on `AccountingEngineService`

Await design approval before implementation.
