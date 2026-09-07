# Phase 4.5.1 — Commercial License Hardening Complete

**Status:** Complete  
**Date:** 2026-09-07  
**Prerequisite:** Phase 4.5 Commercial Licensing ✅

---

## Commercial Model

Fratelanza uses a **perpetual / one-time license** as the primary commercial model.

Customers purchase a license once and receive the right to use the licensed product, modules, and features according to the license agreement. There is **no monthly SaaS subscription**, **no recurring billing enforcement**, and **no requirement for monthly online activation**.

Optional future commercial layers (documented separately, not implemented as runtime enforcement):

- Annual support & maintenance
- Paid major-version upgrades
- Implementation services
- Additional module purchases

These future layers must not break perpetual-license LAN operation unless explicitly represented by a separate commercial policy.

---

## Perpetual License Semantics

**Enum:** `LicenseType.perpetual`

| Rule | Behavior |
|------|----------|
| `expiresAt` | Must be `NULL` |
| `graceEndsAt` | Must be `NULL` |
| Time expiration | Never applied — `resolveEffectiveStatus()` skips date checks |
| Grace period | Never started |
| LAN operation | Works offline after activation |
| Subscription checks | None |

A perpetual license remains valid after activation without renewal. Missing `expiresAt` alone does **not** imply perpetual — `licenseType` must be explicitly `perpetual`.

**Example A — ABC Construction**

- License: `PERPETUAL`
- Modules: Core, Finance, Sales, Purchasing, Inventory, Projects, Construction
- Limits: Users 25, Branches 5
- No monthly expiration

---

## Time-Limited License Semantics

**Enum:** `LicenseType.time_limited`

| Rule | Behavior |
|------|----------|
| `expiresAt` | Required |
| Grace | Optional `graceDays` (default 30 when not specified) |
| After expiry | Status → `expired`, licensed modules blocked |
| During grace | Status → `grace`, licensed modules remain operational |
| Data | Never deleted on expiration |

Used for evaluation licenses, term contracts, or future renewal products — **not** for monthly SaaS billing.

---

## Module Licensing

Each `LicenseModuleEntitlement` carries:

| Field | Purpose |
|-------|---------|
| `moduleKey` | Catalog key (`finance`, `pms`, etc.) |
| `termType` | `perpetual` or `time_limited` |
| `expiresAt` | Required when `termType = time_limited` |
| `isEnabled` | Commercial enable flag |

Module entitlements are independent of subscription billing. A perpetual base license may include perpetual module entitlements (e.g. Finance ✅ perpetual, PMS ❌ not licensed).

**Example B — ABC Medical Center**

- License: `PERPETUAL`
- Modules: Core, Finance, Sales, Inventory, PMS ✅; Construction ❌

**Example C — XYZ Accounting Firm**

- License: `PERPETUAL`
- Modules: Core, Finance, Party, Accounting Firm

---

## Feature Licensing

Features are sub-capabilities registered in `feature-catalog.ts` (e.g. `finance.financial-posting`). They are stored in `LicenseFeatureEntitlement` and covered by the signed license document.

Features require their parent module to be licensed and operational.

---

## License Signature

### Architecture

```text
Fratelanza Licensing Authority (FUTURE — external issuance)
        │
        │ Ed25519 private key (never shipped to customer)
        v
Signed License Payload (canonical JSON document)
        │
        v
Customer Server
        │
        v
Ed25519 public-key verification (LICENSE_VERIFICATION_PUBLIC_KEY)
```

### Implementation status

| Component | Status |
|-----------|--------|
| `SignedLicenseDocument` + canonical JSON | ✅ Implemented |
| `Ed25519LicenseVerifier` | ✅ Real Ed25519 verification |
| `signLicenseDocument()` | ✅ Implemented (test/dev signing only) |
| `StubLicenseVerifier` (SHA-256 digest) | ❌ Removed — not production-grade |
| External Licensing Authority issuance API | ⏸ Deferred |

The SHA-256 digest (`payloadDigest`) is retained as a **content fingerprint** for audit/debug only. It is **not** a digital signature and does not prevent forgery.

### Signed fields

The Ed25519 signature covers the canonical document including:

- `schemaVersion`, `licenseId`, `licenseKey`
- `tenantId`, `licenseType`, `edition`
- `issuedAt`, `expiresAt`, `graceDays`
- `installationId`
- `limits` (users, branches, devices, storage)
- `modules[]` (key, termType, expiresAt)
- `features[]`

### Runtime integrity

`LicenseService.assertLicenseIntegrity()` rebuilds the canonical document from `TenantLicense` + entitlements and verifies the stored signature on every licensed operation (`requireOperationalLicense`).

---

## Tenant Binding

The signed document includes `tenantId`. Activation rejects:

- Payload `tenantId` ≠ activating tenant route/context
- Signature copied from Tenant A applied to Tenant B

Binding is cryptographic (inside signed payload), not merely a customer-editable database field.

**Stable identity:** PostgreSQL `tenants.id` (UUID assigned at tenant creation).

---

## Installation Binding

**Field:** `TenantLicense.installationId` (nullable, included in signed document)

**Current capability:**

| Capability | Supported |
|------------|-----------|
| Single installation ID in signed license | ✅ Schema + signature field |
| Multiple installations per license | ⏸ Future policy |
| Transfer / rehost | ⏸ Future policy + authority re-issuance |

No hardware fingerprinting. Future binding uses a stable installation identity generated at activation and represented in the signed license.

---

## Offline Operation

After successful activation, the ERP operates on LAN without continuous internet:

```text
Customer Server
    ├── PostgreSQL (TenantLicense + entitlements)
    ├── Fratelanza API (local Ed25519 verification)
    └── Cached signed license state
```

Internet required only for:

- Initial activation
- Optional reactivation / replacement
- TIME_LIMITED renewal (when applicable)
- Updates and optional diagnostics

**PERPETUAL licenses do not require monthly internet contact.**

---

## License Revocation

| Action | Local behavior | Online authority (future) |
|--------|----------------|---------------------------|
| Suspension | `status = suspended` blocks licensed modules immediately | Authority pushes replacement signed payload |
| Revocation | `status = revoked` blocks licensed modules | Same |
| Replacement | `POST /license/activate` with new signed payload | Issued by authority |
| Renewal (time-limited) | New signed payload with updated `expiresAt` | Issued by authority |
| Reactivation | Signed payload restores `active` | Issued by authority |

**No always-online kill switch.** Offline customers retain last known signed state until a replacement payload is applied locally.

---

## TenantModule Compatibility

**Source of truth:** `TenantLicense` + `LicenseModuleEntitlement` + `LicenseFeatureEntitlement`

**Compatibility layer:** `tenant_modules`

```text
TenantLicense
    ↓ syncTenantModules()
tenant_modules (isEnabled flags for settings/legacy UI)
```

Runtime entitlement checks read **license tables only**. Stale `tenant_modules` flags cannot override `TenantLicense`. Verified by integration test.

---

## RBAC Interaction

| Licensed | Authorized (RBAC) | Result |
|----------|-------------------|--------|
| Yes | Yes | **ALLOW** |
| Yes | No | **DENY** |
| No | Yes | **DENY** |
| No | No | **DENY** |

Both mechanisms remain independent and enforced.

---

## Feature Flag Interaction

| Control | Purpose |
|---------|---------|
| Feature flag | Deployment / release control (`packages/config`) |
| License | Commercial entitlement |

Example: `partyLegacyRoutingEnabled = false` + Sales licensed → feature stays off (release flag).  
Example: `partyLegacyRoutingEnabled = true` + Sales not licensed → feature stays off (commercial).

---

## Security Tests

**Suite:** `apps/api/test/license-hardening.integration.spec.ts` (20 tests)  
**Regression:** `apps/api/test/licensing.integration.spec.ts` (19 tests)  
**Total:** 143/143 PASS

Coverage includes:

1. PERPETUAL remains active by time logic
2. PERPETUAL has no expiration enforcement
3. TIME_LIMITED expires correctly
4. TIME_LIMITED grace period works
5. Expired time-limited license blocks modules
6. Perpetual module remains active
7. Time-limited module expires correctly
8–12. Tamper rejection (edition, module, feature, limits, expiration, tenant)
13. Copied license to another tenant rejected
14–15. RBAC + license interaction (via licensing suite)
16. Offline/local validation without network
17. tenant_modules cannot override TenantLicense
18. No private keys exposed in API responses
19–21. Finance, PMS, party, party-legacy regressions (existing suites)

---

## Risks

| Risk | Mitigation |
|------|------------|
| External Licensing Authority not yet built | Local Ed25519 verification ready; issuance deferred to test signing key |
| Offline revocation delay | Documented policy; replacement payload applied locally |
| Limit tampering via direct DB edit | Runtime signature integrity check |
| Ambiguous perpetual inference | Explicit `licenseType` enum required |

---

## Future Licensing Authority

Central Fratelanza service will:

- Hold Ed25519 **private** signing key
- Issue signed activation payloads for customers
- Support replacement, renewal (time-limited), and revocation re-issuance
- Never ship private key to customer installations

Customer installations retain only `LICENSE_VERIFICATION_PUBLIC_KEY`.

---

## Future Support/Maintenance

Optional annual support & maintenance is a **separate commercial product**. It must not be implemented as subscription enforcement that disables a perpetual license. Future design may add informational fields or support-tier features without breaking base perpetual runtime.

---

## Future Upgrade Licensing

Major version upgrades may be sold separately. Implementation will use signed payload updates (new edition/modules/features) rather than recurring subscription checks.

---

## Phase 5 Readiness

| Acceptance criterion | Status |
|---------------------|--------|
| Perpetual license explicitly represented | ✅ |
| Perpetual licenses do not expire | ✅ |
| No monthly subscription enforcement | ✅ |
| Modules sold independently | ✅ |
| Server-side entitlement enforcement | ✅ |
| Local/offline validation | ✅ |
| Local license tampering rejected | ✅ |
| Tenant-bound license cannot cross tenants | ✅ |
| TenantLicense = source of truth | ✅ |
| RBAC remains separate | ✅ |
| 143 tests PASS | ✅ |
| Typecheck PASS | ✅ |

**Phase 5 may proceed.**

---

## Files Changed (Phase 4.5.1)

### Schema / migration

- `packages/database/prisma/schema.server.prisma` — `LicenseType`, `EntitlementTermType`, `schemaVersion`, `payloadSignature`
- `packages/database/prisma/migrations/20250907200000_license_hardening/migration.sql`

### API — licensing

- `apps/api/src/modules/license/license.service.ts` — perpetual semantics, integrity check, `prepareLicenseActivation`
- `apps/api/src/modules/license/entitlement.service.ts` — module term checks, `licenseType` in snapshot
- `apps/api/src/modules/license/verification/license-document.ts` — canonical document, semantics validation
- `apps/api/src/modules/license/verification/license-activation.util.ts` — shared activation builder
- `apps/api/src/modules/license/verification/ed25519-license-crypto.ts` — Ed25519 sign/verify
- `apps/api/src/modules/license/verification/ed25519-license-verifier.ts` — production verifier
- `apps/api/src/modules/license/verification/license-verifier.interface.ts` — activation types
- `apps/api/src/modules/license/verification/stub-license-verifier.ts` — **deleted**

### Config

- `packages/config/src/index.ts` — `license.verificationPublicKey`, `license.signingPrivateKey`, `license.allowUnsignedDev`
- `.env.example` — LICENSE env vars

### Tests

- `apps/api/test/license-hardening.integration.spec.ts` — **new**
- `apps/api/test/license-test.helpers.ts` — **new**
- `apps/api/test/licensing.integration.spec.ts` — updated for signed activation
- `apps/api/test/setup-env.ts` — test Ed25519 keypair generation

### Documentation

- `docs/PHASE_4_5_LICENSING_DESIGN.md` — updated for hardening
- `docs/PHASE_4_5_1_LICENSE_HARDENING_COMPLETE.md` — this document

---

## Exact Meaning of PERPETUAL in the Final System

A **PERPETUAL** license is a commercially purchased, one-time right to use the licensed edition, modules, features, and limits **without time-based expiration**. It is explicitly typed (`licenseType = perpetual`), cryptographically signed, tenant-bound, validated locally via Ed25519, and never subject to grace/expiry timers. Normal ERP operation on the customer LAN does not depend on internet connectivity or recurring activation checks.
