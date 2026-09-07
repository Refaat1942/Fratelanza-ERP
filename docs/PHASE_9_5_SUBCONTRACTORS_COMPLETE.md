# PHASE 9.5 COMPLETE

Construction subcontractor profiles extend Party identity with trade metadata, project assignments, and optional contract linkage — without duplicate master data.

---

## Architecture

```text
Party + active subcontractor role (optional supplier role)
    ↓
ConstructionSubcontractorProfile (1:1 per party per tenant)
    ↓
ConstructionSubcontractorAssignment → Universal Project (+ optional ConstructionContract)
```

Identity stays in `Party` / `PartyRole`. Construction adds operational profile and assignment layers only.

## Entities

- `ConstructionSubcontractorProfile` — trade, specialty, compliance notes, status (`active` | `inactive` | `suspended`)
- `ConstructionSubcontractorAssignment` — links profile to project and optional subcontractor-direction contract

## Validation

- Profile create requires active `PartyRoleType.subcontractor`
- One profile per `(tenantId, partyId)`
- Assignment requires construction project profile on target project
- Contract assignment requires `direction=subcontractor`, same project, and matching contract party
- Project-only assignments are unique per `(tenantId, profileId, projectId)` via partial index

## Licensing

Feature: `construction.subcontractors`

## RBAC

- `construction:subcontractors:read`
- `construction:subcontractors:manage`

## API

- `GET/POST /api/v1/construction/subcontractors`
- `GET/PATCH /api/v1/construction/subcontractors/:id`
- `GET/POST /api/v1/construction/subcontractors/:id/assignments`
- `PATCH /api/v1/construction/subcontractors/assignments/:assignmentId`

## Tests

`apps/api/test/construction-subcontractors.integration.spec.ts`

## Finance Boundary

No JournalEntry, FinancialPostingService, or AccountingEngineService.

## Inventory Boundary

No inventory movement.

## Cost Subledger Boundary

No ConstructionCostEntry from subcontractor profile or assignment operations.

## Future

Phase 9.6+ may link assignments to progress certificates, retention, and purchasing workflows.
