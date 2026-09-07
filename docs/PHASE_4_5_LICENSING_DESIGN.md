# Phase 4.5 — Commercial Licensing & Module Entitlements Design

**Status:** Implemented (Phase 4.5 + 4.5.1 hardening)  
**Date:** 2026-09-07  
**Prerequisite:** Phase 4 Party ↔ Legacy ERP Adapter ✅

> **Phase 4.5.1 addendum:** See [PHASE_4_5_1_LICENSE_HARDENING_COMPLETE.md](./PHASE_4_5_1_LICENSE_HARDENING_COMPLETE.md) for perpetual license semantics, Ed25519 signing, tamper resistance, and security tests.

---

## 1. Existing Licensing Audit

### What exists today

| Component | Location | Current behavior |
|-----------|----------|------------------|
| `TenantLicense` | `tenant_licenses` table | **Source of truth** — edition, type, status, limits, signature |
| `LicenseModuleEntitlement` | `license_module_entitlements` | Per-module commercial entitlements with term type |
| `LicenseFeatureEntitlement` | `license_feature_entitlements` | Feature-level entitlements |
| `TenantModule` | `tenant_modules` table | Compatibility sync layer from TenantLicense |
| Seed / demo | `seed.ts`, `LicenseService.seedDemoLicense()` | Perpetual enterprise demo license with signature |
| RBAC | `PermissionsGuard` | Checks JWT `permissions[]` — separate from licensing |
| JWT auth | `JwtAuthGuard` (global) | Authenticates user only |
| Feature flags | `packages/config` | Deployment flags — **not commercial entitlements** |
| EntitlementGuard | Global guard | License + module + feature enforcement |

### Architecture

```text
TenantLicense (source of truth)
        │
        ├── LicenseModuleEntitlement (termType: perpetual | time_limited)
        ├── LicenseFeatureEntitlement
        └── sync → TenantModule (compatibility read model)
```

`TenantModule` is never read as entitlement source of truth at runtime.

---

## 2. Conceptual Distinctions

| Concept | Answers | Example |
|---------|---------|---------|
| **RBAC** | Is this **user** allowed? | `finance:posting:execute` |
| **License** | Has this **tenant** purchased? | Finance module (perpetual) |
| **License type** | Perpetual or time-limited? | `perpetual` — no expiry |
| **Module entitlement** | Is module enabled on license? | `finance = true`, `termType = perpetual` |
| **Feature entitlement** | Is sub-capability enabled? | `finance.financial-posting = true` |
| **Usage limit** | How much can tenant use? | `maxUsers = 25` |
| **Feature flag** | Is code path enabled in this **deployment**? | `partyLegacyRoutingEnabled` |
| **Edition** | Which bundle tier? | `business` → default module set |
| **Activation** | Is installation authorized? | Ed25519 signed payload verified locally |

Both RBAC **and** licensing required:

```text
Licensed capability AND Authorized user → Execute
```

---

## 3. License Model

**Table:** `tenant_licenses` (one license record per tenant)

| Field | Purpose |
|-------|---------|
| `licenseKey` | Public activation identifier |
| `licenseType` | `perpetual` \| `time_limited` |
| `edition` | `starter` \| `professional` \| `business` \| `enterprise` |
| `status` | `pending` \| `active` \| `grace` \| `expired` \| `suspended` \| `revoked` |
| `schemaVersion` | Signed document schema version |
| `issuedAt`, `activatedAt`, `expiresAt`, `graceEndsAt` | Lifecycle |
| `maxUsers`, `maxBranches`, `maxDevices`, `maxStorageMb` | Limits (signed) |
| `installationId` | Future installation binding (signed) |
| `payloadDigest` | SHA-256 fingerprint (audit only — **not** a signature) |
| `payloadSignature` | Ed25519 signature over canonical document |

### License type semantics

| Type | `expiresAt` | Time expiration | Use case |
|------|-------------|-----------------|----------|
| `perpetual` | Must be NULL | Never | Primary commercial model (one-time purchase) |
| `time_limited` | Required | Grace + expiry apply | Evaluation, term contracts, future renewal |

**Never delete business data on expiration.**

### Expiration behavior (time_limited only)

| Status | Licensed modules | Core admin |
|--------|------------------|------------|
| `active` | Full access | Yes |
| `grace` | Full access (renewal window) | Yes |
| `expired` | **Rejected** | Yes (renewal/admin) |
| `suspended` / `revoked` | **Rejected** | Yes (admin view only) |

Perpetual licenses remain `active` regardless of elapsed calendar time.

---

## 4. Module Catalog

Stable keys in `module-catalog.ts`:

| Key | Tier | Dependencies |
|-----|------|--------------|
| `core` | Core | — |
| `finance` | Business | `core` |
| `party` | Business | `core` |
| `sales` | Business | `core` |
| `purchasing` | Business | `core` |
| `inventory` | Business | `core` |
| `products` | Business | `core` |
| `accounting` | Business | `core`, `finance` |
| `pos` | Business | `core`, `sales` |
| `pms` | Vertical | `core` |
| `projects` | Business | `core` |
| `construction` | Vertical | `core`, `projects` |
| `crm` | Business | `core`, `party` |
| `retail`, `manufacturing`, `accounting_firm` | Future | TBD (catalog entry) |

Each module entitlement includes `termType` (`perpetual` \| `time_limited`) for independent module term licensing without subscription architecture.

---

## 5. Feature Entitlements

Registered in `feature-catalog.ts`. Features inherit module requirement and are included in the signed license document.

---

## 6. Services

```text
LicenseService
  → lifecycle, status resolution, activation, integrity verification, TenantModule sync

EntitlementService
  → requireModule(), requireFeature(), getEntitlements(), assertLimit()

Ed25519LicenseVerifier
  → verifyDocument() using LICENSE_VERIFICATION_PUBLIC_KEY
```

Shared activation builder: `prepareLicenseActivation()` ensures signing and activation use identical canonical documents.

---

## 7. Runtime Guard

**`EntitlementGuard`** (global, after JWT):

1. Skip if `@Public()` or `@LicenseExempt()`
2. Resolve tenant license + integrity check — reject if non-operational
3. If `@RequireModule()` — validate module + dependencies + module term
4. If `@RequireFeature()` — validate feature

**Order:** JWT → EntitlementGuard → PermissionsGuard

---

## 8. Activation Architecture

```text
Fratelanza Licensing Authority (FUTURE — external issuance)
        │
        │ Ed25519 private key (NEVER in customer install)
        v
Signed License Payload
        │
        v
Customer Server — LicenseService.activateLicense()
        │
        ├── prepareLicenseActivation() — validate semantics + build document
        ├── Ed25519LicenseVerifier.verifyDocument()
        └── persist TenantLicense + entitlements → sync tenant_modules
```

**Implemented:**

- Real Ed25519 verification on customer server
- Test/dev signing via `LICENSE_SIGNING_PRIVATE_KEY` (not shipped to production customers)
- `StubLicenseVerifier` removed — SHA-256 digest alone is not a digital signature

**Deferred:**

- External Licensing Authority issuance API

---

## 9. API

| Route | Purpose | Access |
|-------|---------|--------|
| `GET /license` | Admin license summary (no signature exposed) | `core:license:read` |
| `GET /license/entitlements` | Desktop-safe entitlement snapshot | Authenticated |
| `GET /license/usage` | Current usage vs limits | `core:license:read` |
| `POST /license/activate` | Activation (signed payload) | `core:license:manage` |

Tenant admins **view only** — cannot forge modules/limits without valid signed payload.

---

## 10. Validation Order

```text
1. Authenticate (JWT)
2. Resolve tenant
3. License integrity + operational check (EntitlementGuard → requireOperationalLicense)
4. Module entitlement (@RequireModule)
5. Feature entitlement (@RequireFeature)
6. Usage limit (assertLimit on create operations)
7. RBAC permission (PermissionsGuard)
8. Business operation
```

---

## 11. Desktop

- Fetch `GET /license/entitlements` after login
- Filter nav by licensed modules (`LicensedRoute`)
- Server remains authoritative

---

## 12. Distribution Model

**Primary model:** Perpetual / one-time license — not monthly SaaS.

Customers receive compiled application + signed license. LAN deployment with local Ed25519 validation after activation. No monthly internet requirement for perpetual licenses.

Optional future products (support, maintenance, upgrades) are separate commercial layers and must not break perpetual runtime unless explicitly documented.

---

## 13. Commercial Examples

**ABC Construction** — PERPETUAL, Core + Finance + Sales + Purchasing + Inventory + Projects + Construction, 25 users / 5 branches

**ABC Medical Center** — PERPETUAL, Core + Finance + Sales + Inventory + PMS (no Construction)

**XYZ Accounting Firm** — PERPETUAL, Core + Finance + Party + Accounting Firm

---

## References

- [PHASE_4_5_LICENSING_COMPLETE.md](./PHASE_4_5_LICENSING_COMPLETE.md) — Phase 4.5 implementation summary
- [PHASE_4_5_1_LICENSE_HARDENING_COMPLETE.md](./PHASE_4_5_1_LICENSE_HARDENING_COMPLETE.md) — Security hardening completion report
