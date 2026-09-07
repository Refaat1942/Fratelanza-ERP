# PHASE 4.5 COMPLETE

Commercial Licensing & Module Entitlements foundation for Fratelanza.

---

## Product Licensing Model

Fratelanza is a **commercial licensed product**. Customers receive compiled runtime + license, not source code. Each tenant holds one `TenantLicense` that governs:

- Edition (starter → enterprise)
- Module entitlements
- Feature entitlements
- Usage limits
- Activation / expiration / grace

RBAC remains separate: **licensed capability AND authorized user** are both required.

---

## Architecture Decision

Evolve `TenantModule` rather than replace it:

```text
TenantLicense (source of truth)
    ├── LicenseModuleEntitlement
    ├── LicenseFeatureEntitlement
    └── sync → tenant_modules (compatibility read model)
```

Validation order:

```text
JWT → EntitlementGuard → PermissionsGuard → Business logic
```

---

## Existing Licensing Audit

| Before | After |
|--------|-------|
| `TenantModule` flags in DB/seed only | Enforced server-side via `EntitlementGuard` |
| No license entity | `tenant_licenses` + entitlement tables |
| RBAC only | RBAC + licensing |
| Static desktop nav | Nav filtered by `GET /license/entitlements` |

`partyLegacyRoutingEnabled` remains a **deployment feature flag**, distinct from commercial entitlements.

---

## License Model

**Table:** `tenant_licenses`

- One license per tenant (Phase 4.5)
- Status: `pending | active | grace | expired | suspended | revoked`
- Limits: `maxUsers`, `maxBranches`, `maxDevices`, `maxStorageMb`
- `payloadDigest` for tamper detection (stub verifier today)
- Expired/suspended/revoked: licensed modules blocked; core admin remains available

---

## Edition Model

Catalog in `edition-catalog.ts`:

- `starter`, `professional`, `business`, `enterprise`
- Each edition defines default module bundle + limits
- Business logic resolves capabilities via `EntitlementService`, not hardcoded edition checks

---

## Module Catalog

Central catalog in `module-catalog.ts`:

- Core: `core`
- Business: `finance`, `party`, `sales`, `purchasing`, `inventory`, `products`, `accounting`, `pos`, `sync`, …
- Vertical: `pms`, `construction`, `retail`, … (future entries marked unavailable)

Stable machine keys; display names separated.

---

## Module Dependencies

Centralized in catalog (`dependencies[]`). Activation rejects invalid configs (e.g. `construction` without `projects`). Runtime `requireModule()` validates dependency chain.

---

## Feature Entitlements

Catalog in `feature-catalog.ts`:

- Examples: `finance.financial-posting`, `finance.fiscal-periods`, `sales.invoices`, `pms.patients`
- `@RequireFeature()` on sensitive endpoints (finance posting)
- Features require parent module

---

## Usage Limits

Enforced via `EntitlementService.assertLimit()`:

- `maxUsers` — on user create
- `maxBranches` — on branch create
- `maxDevices` — modeled; device registration hook ready for future wiring

Counts active/non-deleted records only.

---

## License Service

`LicenseService` (`apps/api/src/modules/license/license.service.ts`):

- Resolve effective status (expiration → grace → expired)
- Activate license (stub digest verification)
- Sync `TenantModule` compatibility flags
- Audit lifecycle events

---

## Entitlement Service

`EntitlementService` (`apps/api/src/modules/license/entitlement.service.ts`):

- `requireModule()`, `requireFeature()`, `assertLimit()`
- `getEntitlements()` — desktop-safe snapshot
- `getAdminLicenseView()` — tenant admin read-only

---

## Runtime Guard

Global `EntitlementGuard` with decorators:

- `@RequireModule('finance')`
- `@RequireFeature('finance.financial-posting')`
- `@LicenseExempt()` — core routes (auth, settings, users, license read)

Applied to all business module controllers.

---

## RBAC + Licensing

Both enforced:

- Licensed + unauthorized → 403 (PermissionsGuard)
- Unlicensed + authorized → 403 (EntitlementGuard)
- Licensed + authorized → proceed

---

## Activation Architecture

```text
Fratelanza Licensing Authority (future)
        ↓ signed payload
LicenseService.activate()
        ↓ StubLicenseVerifier (SHA-256 digest)
tenant_licenses + entitlements
        ↓
TenantModule sync
```

`SignedLicenseVerifier` placeholder for Ed25519 public-key verification. Private keys never ship to customers.

---

## Local Validation

LAN operation does not require continuous internet after activation. Status resolved locally from DB + expiration policy.

---

## Expiration / Grace

| Status | Licensed modules | Core admin |
|--------|------------------|------------|
| active | allowed | allowed |
| grace | allowed | allowed |
| expired | blocked | allowed |
| suspended/revoked | blocked | allowed |

Business data is never deleted on expiration.

---

## Desktop Integration

- `GET /api/v1/license/entitlements` consumed after login
- Nav items hidden when module not licensed
- `LicensedRoute` blocks deep links (server still authoritative)
- Settings page shows edition, status, modules, usage (admin view when permitted)

---

## Administration

| Endpoint | Access |
|----------|--------|
| `GET /license` | `core:license:read` |
| `GET /license/usage` | `core:license:read` |
| `GET /license/entitlements` | authenticated |
| `POST /license/activate` | `core:license:manage` |

Tenant admins cannot self-grant modules without valid activation payload.

---

## Audit

Events via `AuditService`:

- `license.activated`, `license.updated`, `license.suspended`, `license.revoked`
- `license.expired`, `license.grace_started`

Secrets never logged.

---

## Security

- Server-side enforcement on all licensed routes
- UI hiding is not a security boundary
- Tenant-scoped license lookups
- Admin responses omit `payloadDigest`
- Cross-tenant isolation tested

---

## Tenant Isolation

License and entitlement queries always scoped by `tenantId`. Integration tests verify separate tenants receive separate license keys.

---

## Database Changes

**Migration:** `20250907190000_commercial_licensing`

- `tenant_licenses`
- `license_module_entitlements`
- `license_feature_entitlements`

Additive only. PMS/finance posting tables unchanged.

---

## Tests

**New:** `apps/api/test/licensing.integration.spec.ts` (19 tests)

Covers: active/expired/grace/suspended/revoked, module/feature gates, limits, RBAC combination, entitlements API, tenant isolation, activation, secrets.

**Regression:** 123/123 PASS

---

## Typecheck

`npm run typecheck -w @fratelanza/api` — **PASS**

---

## Full Regression

`npm test -w @fratelanza/api` — **123/123 PASS**

Suites: licensing (19), party-legacy (15), parties (14), finance (19), pms-patients (17), pms-ledger (24), auth (5), concurrency (3), resilience (7).

---

## Risks

- Stub verifier is development-only; production requires signed licenses
- `TenantModule` sync is compatibility layer — long-term reads should migrate to entitlement service
- Device limit enforcement pending device registration hook
- Orphan test tenants from isolation tests may accumulate in dev DB

---

## Future Central Licensing Server

```text
Fratelanza Licensing Authority
    issue / activate / renew / suspend / revoke
              ↓
Customer Server (signed local license + public-key verify)
```

---

## Installer / Deployment Implications

Commercial installer will ship:

- Compiled API + desktop
- PostgreSQL/runtime setup
- Signed license file
- Public verification key only

No repository or Prisma source to customers.

---

## Phase 5 Recommendation

Phase 4.5 is complete. Phase 5 (Sales/Purchasing Party migration) should not begin until product approves. Licensing guards are in place for future module work.

**DO NOT START PHASE 5.**
