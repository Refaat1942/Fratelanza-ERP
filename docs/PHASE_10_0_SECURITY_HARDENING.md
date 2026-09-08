# PHASE 10.0 — SECURITY HARDENING

Deployment security review and Phase 10.0 mitigations.

---

## Production Secret Validation

| Control | Status |
|---------|--------|
| JWT_SECRET ≥32 chars in production | Enforced in `validateAppConfig()` |
| Dev JWT fallback blocked in production | Enforced |
| LICENSE_VERIFICATION_PUBLIC_KEY required | Enforced in production |
| LICENSE_SIGNING_PRIVATE_KEY forbidden on customer server | Enforced in production |
| LICENSE_ALLOW_UNSIGNED_DEV forbidden in production | Enforced |
| FRATELANZA_INSTALLATION_ID required | Enforced in production |

Run: `npm run verify:production-env`

---

## JWT & Sessions

- Access tokens: short TTL (`JWT_ACCESS_EXPIRES_IN`, default 15m)
- Refresh tokens: stored in `Session` table with revocation
- `assertSessionActive()` on each JWT validation
- Password hashing: bcrypt (auth service)

**No changes to semantics in Phase 10.0.**

---

## API Hardening

| Control | Implementation |
|---------|----------------|
| Helmet | `main.ts` |
| CORS | Configurable `CORS_ORIGINS` |
| Rate limiting | ThrottlerGuard 100/min |
| Input validation | Global ValidationPipe whitelist |
| Error leakage | GlobalExceptionFilter — no stack to client |
| SQL injection | Prisma parameterized queries |
| Tenant isolation | Application-level `tenantId` scoping |

---

## Licensing Security

- Ed25519 signature verification on every licensed operation
- Tampered payload rejected
- Installation binding when `FRATELANZA_INSTALLATION_ID` configured
- Private signing key never shipped to customers

---

## RBAC & Entitlements

- License does **not** bypass RBAC
- RBAC does **not** grant unlicensed features
- `@LicenseExempt()` limited to core admin routes

---

## LAN Exposure

- Bind `API_HOST=0.0.0.0` for LAN — restrict via firewall to internal subnet
- Do not expose PostgreSQL port to WAN
- Diagnostics endpoint requires `core:license:read` — no secrets in response

---

## Audit

- Selective audit writes (not universal)
- Read protected by `core:audit:read`
- Known gap: not all mutations audited — documented, not expanded in 10.0

---

## Development Endpoints

- No debug routes exposed in production module set
- Sync routes disabled when `SYNC_ENABLED=false`
- Test signing keys only in Jest `setup-env.ts`

---

## Regression Tests

- `production-config.spec.ts` — production env validation
- `licensing.integration.spec.ts` — license semantics
- `license-hardening.integration.spec.ts` — tamper resistance
- `commercial-deployment.integration.spec.ts` — Phase 10.0 deployment checks

---

## Remaining Risks

| Risk | Mitigation path |
|------|-----------------|
| Demo seed on production | Installation doc warns |
| CSP localhost-only in desktop | Per-deployment CSP update |
| maxDevices not enforced | Future phase |
| Universal audit coverage | Future phase |
