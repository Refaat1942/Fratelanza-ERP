# PHASE 9.4 COMPLETE

Operational retention and advance subledgers track contract-level holds, releases, mobilization receipts, and recoveries without GL, inventory, or cost-entry side effects.

---

## Architecture

```text
Contract (retentionPercent, retentionCap, advanceAmount, advancePercent)
    ↓
Approved Progress → ConstructionRetentionEntry (hold, idempotent)
Manual API        → ConstructionRetentionEntry (release)
Manual API        → ConstructionAdvanceEntry (received / recovered)
```

Append-only entries maintain `balanceAfter` per `(contractId, partyType)`.

## Entities

- `ConstructionRetentionEntry` — hold/release with progress or manual source
- `ConstructionAdvanceEntry` — received/recovered/adjustment mobilization tracking

## Retention Formula

`hold = gross × retentionPercent / 100`, capped by `retentionCap − currentHeldBalance`.

On progress approval, `grossBaseAmount = totalCurrentAmount` from the approved certificate.

## Advance Recoverable Formula

When `advancePercent` is set: `min(currentBalance, gross × advancePercent / 100)`.

Otherwise: `min(currentBalance, advanceAmount)`.

## Progress Integration

`ConstructionProgressService.approve()` calls `recordHoldFromProgress` automatically for the contract's party direction.

## Licensing

Feature: `construction.retention`

## RBAC

- `construction:retention:read`
- `construction:retention:manage`
- `construction:retention:release`

## API

- `/api/v1/construction/retention` — list, balance, release, hold-from-progress
- `/api/v1/construction/advances` — list, balance, received, recovered, recoverable

## Tests

`apps/api/test/construction-retention-advances.integration.spec.ts`

## Finance Boundary

No JournalEntry, FinancialPostingService, or AccountingEngineService.

## Inventory Boundary

No inventory movement.

## Cost Subledger Boundary

No ConstructionCostEntry from retention or advances.

## Future

Phase 9.5+ may link recoveries to progress certificates and payment applications.
