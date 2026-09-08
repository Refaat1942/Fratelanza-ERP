# PHASE 10.0 — RELEASE & UPDATE

Controlled release and upgrade strategy foundation.

---

## Version Strategy

**Format:** `MAJOR.MINOR.PATCH` (semver)

| Component | Source |
|-----------|--------|
| Monorepo | `package.json` version |
| API | `APP_VERSION` env or package.json via `resolveAppVersion()` |
| Desktop | `apps/desktop/package.json` |
| Diagnostics | `GET /api/v1/system/version` |

Release bundles should ship **matched API + desktop versions**.

---

## Release Artifacts

| Artifact | Description |
|----------|-------------|
| API build | `apps/api/dist/` + production `.env` template |
| Desktop installer | `Fratelanza-ERP-<version>-Setup.exe` |
| Migration set | `packages/database/prisma/migrations/` |
| License public key | PEM for customer `.env` |
| Release notes | Per-version change log |

Customers receive **compiled artifacts only**.

---

## Upgrade Workflow

```
BACKUP
  → STOP API (maintenance window)
  → DEPLOY new API build
  → npm run db:migrate:server:deploy
  → VERIFY health + diagnostics
  → DEPLOY new desktop clients
  → SMOKE TEST
  → RESUME operations
```

### Critical rules

1. **Always backup before upgrade**
2. **Migrations are forward-only** — assume NOT reversible unless explicitly documented
3. **API before desktop** — desktop may depend on new API fields
4. **License compatibility** — same Ed25519 public key unless Fratelanza issues migration notice

---

## Rollback Boundaries

| Rollback | Feasibility |
|----------|-------------|
| Desktop only | Restore previous installer |
| API code | Restore previous build if DB unchanged |
| Database migration | **Only via DB restore from pre-upgrade backup** |
| License downgrade | Not supported without Fratelanza re-issuance |

---

## Maintenance Mode

Phase 10.0 does not implement automated maintenance mode flag. Operational procedure:

1. Stop API service
2. Display maintenance notice to users
3. Perform upgrade
4. Verify before re-enabling

Future: `MAINTENANCE_MODE=true` env (deferred).

---

## mg.fratelanza.com Integration (Deferred)

Optional future capabilities:

- Update catalog download
- License renewal API
- Remote diagnostics upload (customer opt-in)

**Not required** for LAN daily operation.

---

## Compatibility Matrix (template)

| API Version | Desktop Version | DB Migration | Notes |
|-------------|-----------------|--------------|-------|
| 0.1.0 | 0.1.0 | baseline | Phase 10.0 release |

Maintain this matrix per release.
