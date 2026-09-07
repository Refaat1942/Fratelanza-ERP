# Phase 8.2 — Finance Migration Bridge COMPLETE

**Status:** COMPLETE — 2026-09-07  
**Prerequisites:** Phase 8.1 Finance Dimensions ✅, Phase 6 Purchasing ✅

---

## Summary

Phase 8.2 delivers a **controlled migration bridge**: when `UNIVERSAL_FINANCE_PILOT_ENABLED=true`, **only** `PurchasingService.receiveOrder()` posts via **`FinancialPostingService`** with optional Project/Cost Center dimensions. All other GL events remain on legacy **`AccountingEngineService`**.

```text
UNIVERSAL_FINANCE_PILOT_ENABLED=false (default)
  receiveOrder → InventoryLedger → AccountingEngine → supplier balance

UNIVERSAL_FINANCE_PILOT_ENABLED=true
  receiveOrder → InventoryLedger → FinancialPostingService (rule) → supplier balance
```

**No double posting:** strict `if/else` — never both engines for the same receive event.

---

## Deliverables

| Item | Status |
|------|--------|
| `UNIVERSAL_FINANCE_PILOT_ENABLED` in `@fratelanza/config` (default `false`) | ✅ |
| `.env.example` documented | ✅ |
| `PurchasingService.receiveOrder` flag-gated FPS swap | ✅ |
| Optional `dimensions` on `POST /purchasing/orders/:id/receive` | ✅ |
| `PurchasingModule` imports `FinanceModule` | ✅ |
| Settings exposes `universalFinancePilotEnabled` | ✅ |
| Integration tests (4 new cases) | ✅ |
| Legacy regression (flag OFF unchanged) | ✅ |

---

## Pilot Posting Contract

When pilot ON, inside existing `$transaction`:

```typescript
FinancialPostingService.post({
  mode: 'rule',
  sourceModule: 'purchasing',
  sourceType: 'order',
  sourceId: order.id,
  sourceEvent: 'receive',
  amounts: { total: order.total },
  dimensions?: { projectId?, costCenterId? },
}, tx);
```

Uses seeded rule `purchasing/order/receive` (Dr Inventory / Cr AP) — semantically equivalent to legacy `1200`/`2000` when finance foundation is seeded.

---

## API

```http
POST /api/v1/purchasing/orders/:id/receive
Content-Type: application/json

{
  "dimensions": {
    "projectId": "optional-uuid",
    "costCenterId": "optional-uuid"
  }
}
```

Body is optional (empty POST still works for backward compatibility).

---

## Explicitly NOT Changed

- Sales, POS, customer payments
- PO create and other purchasing events
- `AccountingEngineService` implementation
- Inventory, Party, PMS modules
- Construction

---

## Verification

| Check | Result |
|-------|--------|
| `purchasing.integration.spec.ts` Phase 8.2 tests | **4/4 PASS** |
| Full purchasing suite | Run `npm test -- --testPathPattern=purchasing.integration` |
| Typecheck | Run `npm run typecheck` at repo root |

---

## Next Phase

**Phase 8.3:** Sales invoice post → FPS migration (COGS-aware), building on this bridge pattern.

---

## References

- [PHASE_8_2_FINANCE_MIGRATION_BRIDGE_DESIGN.md](./PHASE_8_2_FINANCE_MIGRATION_BRIDGE_DESIGN.md)
- [PHASE_8_1_FINANCE_DIMENSIONS_COMPLETE.md](./PHASE_8_1_FINANCE_DIMENSIONS_COMPLETE.md)
