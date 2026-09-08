# PHASE 9.10 COMPLETE

Final Construction vertical hardening and UAT preparation — cross-cutting architecture review, tenant-safety fixes, DTO validation, performance indexes, and integration regression for Phases 9.0–9.9.

**Context:** Phase 9.9 (Construction Reports) is included in regression; hardening validates cross-cutting invariants across the full delivered construction vertical through 9.9 reporting + 9.8 billing.

---

## Architecture review summary

| Area | Finding | Resolution |
|------|---------|------------|
| Billing GL path | Must use FPS only, never `AccountingEngineService` | Verified: `ConstructionBillingService` → `SalesService` + `FinancialPostingService`; no accounting engine import |
| Material inventory | Must use `InventoryLedgerService` only | Verified: `ConstructionMaterialIssueService.issue` calls `inventoryLedger.applyMovement` with `project_issue` |
| Tenant-scoped writes | `cancel`/`post` final updates used `where: { id }` only | Hardened to `updateMany` with `tenantId` + status guards |
| Posting dimensions | Cross-tenant or mismatched `projectId` could be supplied | `resolvePostingDimensions` validates tenant project + matches billing project |
| Concurrent billing post | Race could double-claim invoices | Session `pg_advisory_lock` serializes post per billing id; idempotent second response |
| FPS duplicate journal | P2002 recovery failed inside aborted transaction | Savepoint rollback before idempotent re-fetch |
| DTO validation | Billing status filter, material quantities, pagination | Added `@IsEnum`, `@IsNumberString`, `@IsInt`/`@Min`/`@Max`, `@MaxLength` |
| Indexes | Idempotency key and material source lookups | Added `(tenantId, idempotencyKey)` and source composite index |
| Authorization | All construction controllers | Confirmed `@UseGuards(PermissionsGuard)` + `@RequireFeature` + `@RequirePermissions` on every route |
| Tenant reads | Service `findById` / `findFirst` patterns | Confirmed `tenantId` in where clauses across module |

## Fixes applied

### Services

- `construction-billing.service.ts` — tenant-scoped `cancel`/`post`, project dimension validation, advisory lock on post
- `construction-material-issue.service.ts` — tenant-scoped `cancel`
- `financial-posting.service.ts` — savepoint-safe P2002 journal recovery (billing FPS path)

### DTOs

- `construction-billing.dto.ts` — `@IsEnum` on status filter; `@MaxLength` on notes/idempotencyKey
- `construction-material-issue.dto.ts` — `@IsNumberString` quantity; pagination validators; `@MaxLength` on text/source fields

### Schema / migration

- `20250907290000_construction_hardening_indexes` — billing idempotency + material issue source lookup indexes

## Cross-cutting invariants (tests)

`apps/api/test/construction-hardening.integration.spec.ts`

| Test group | Coverage |
|------------|----------|
| Finance path | Billing post calls FPS, never `AccountingEngineService.createEntry` |
| Inventory path | Material issue calls `InventoryLedgerService.applyMovement` with `project_issue` |
| Tenant isolation | Cross-tenant cancel blocked; cross-tenant / mismatched post `projectId` rejected |
| DTO validation | Invalid billing status filter; non-numeric material quantity |
| Historical integrity | BOQ rate/qty unchanged after progress + billing; BOQ stays `approved` after billing draft |

Existing per-phase integration suites remain the primary regression layer (9.0–9.8).

## Backup and recovery readiness (UAT)

### Scope

Construction data spans: project profiles, cost entries, contracts, BOQs, progress, variations, retention/advance subledgers, subcontractors, material issues, billing, and linked sales invoices / inventory movements.

### Pre-UAT backup checklist

1. **Database** — Full PostgreSQL snapshot before UAT cycle (`pg_dump` or managed backup). Include `construction_*` tables and related `sales_invoices`, `inventory_movements`, `journal_entries` from billing/material flows.
2. **License state** — Export `tenant_licenses` / activation payload for construction feature flags (`construction.*`).
3. **RBAC** — Document seeded construction permissions and any UAT role assignments.
4. **Environment** — Record `UNIVERSAL_FINANCE_SALES_PILOT_ENABLED` (required `true` for billing post UAT).

### Recovery procedures

| Scenario | Recovery action |
|----------|-----------------|
| Failed billing post mid-transaction | Billing remains `approved`; `salesInvoiceId` claim cleared on FPS failure (re-post safe) |
| Duplicate billing attempt | Idempotency via `sourceModule/sourceType/sourceId/sourceEvent` + optional `idempotencyKey` |
| Erroneous material issue (draft) | Cancel draft issue — no inventory movement |
| Posted billing / issued materials | **Do not delete rows** — use compensating documents (credit note / inventory adjustment) per finance policy |
| Full tenant rollback | Restore DB snapshot; re-run migrations if schema drift; re-activate license |

### UAT data hygiene

- Use dedicated UAT tenant or isolated branch
- Seed minimal chain: project profile → contract → approved BOQ → progress → billing
- Verify FPS pilot ON before billing post scenarios
- Keep audit log (`construction_billing`, `construction_material_issue` entities) for traceability

### RPO / RTO guidance (operational)

- **RPO:** Match production backup schedule (recommend ≤ 24h for UAT, ≤ 1h for pre-go-live rehearsal)
- **RTO:** Restore + migration deploy + smoke test (construction foundation + one billing post) ≤ 4h target for single-tenant desktop deployments

## Regression commands

```bash
npm run db:generate
npm run test -w @fratelanza/api -- --testPathPattern=construction
npm run typecheck -w @fratelanza/api
```

## Files

| File | Purpose |
|------|---------|
| `construction-billing.service.ts` | Tenant-scoped lifecycle writes + dimension validation |
| `construction-material-issue.service.ts` | Tenant-scoped cancel |
| `dto/construction-billing.dto.ts` | Validation hardening |
| `dto/construction-material-issue.dto.ts` | Validation hardening |
| `schema.server.prisma` | Hardening indexes |
| `migrations/20250907290000_construction_hardening_indexes/` | DDL |
| `construction-hardening.integration.spec.ts` | Cross-cutting invariant tests |
