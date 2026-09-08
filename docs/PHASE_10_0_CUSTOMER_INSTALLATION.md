# PHASE 10.0 — CUSTOMER INSTALLATION

Production installation guide for Fratelanza Grand ERP **customer server** + **desktop clients**.

---

## Prerequisites

### Customer server PC

| Requirement | Minimum |
|-------------|---------|
| OS | Windows Server 2019+ or Windows 10/11 Pro (64-bit) |
| RAM | 8 GB (16 GB recommended) |
| Disk | 50 GB free (+ backup storage) |
| Network | Static LAN IP recommended |

### Software

- **Node.js 20 LTS** (runtime for API)
- **PostgreSQL 16** (customer-owned business database)
- **pg_dump / psql** client tools (backup/restore)

### Desktop client PCs

- Windows 10/11 (64-bit)
- LAN connectivity to customer server
- Fratelanza Desktop installer (compiled artifact — no source code)

---

## Installation Order

1. Install PostgreSQL
2. Create database and role
3. Deploy Fratelanza API build artifacts
4. Configure production `.env`
5. Run database migrations
6. Bootstrap admin user (avoid demo seed in production)
7. Activate signed license
8. Verify health and diagnostics
9. Install desktop clients on LAN PCs
10. Configure desktop API URL
11. Run verification checklist

---

## 1. PostgreSQL Setup

```sql
CREATE USER fratelanza WITH PASSWORD '<strong-unique-password>';
CREATE DATABASE fratelanza_erp OWNER fratelanza;
GRANT ALL PRIVILEGES ON DATABASE fratelanza_erp TO fratelanza;
```

Connection string example:

```
DATABASE_URL=postgresql://fratelanza:<password>@127.0.0.1:5432/fratelanza_erp?schema=public
```

---

## 2. Generate Installation Identity

Generate once per customer server:

```powershell
[guid]::NewGuid().ToString()
```

Set in `.env`:

```
FRATELANZA_INSTALLATION_ID=<generated-guid>
```

This ID must match the `installationId` field in the Fratelanza-signed license payload.

---

## 3. Production Environment

Copy `.env.example` → `.env` and set:

| Variable | Production value |
|----------|------------------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Unique random string ≥32 chars |
| `LICENSE_VERIFICATION_PUBLIC_KEY` | Fratelanza Ed25519 public PEM |
| `LICENSE_ALLOW_UNSIGNED_DEV` | `false` |
| `LICENSE_SIGNING_PRIVATE_KEY` | **unset** |
| `FRATELANZA_INSTALLATION_ID` | Server installation GUID |
| `CORS_ORIGINS` | LAN desktop origins if applicable |
| `API_HOST` | `0.0.0.0` (LAN bind) |

Validate before start:

```bash
npm run verify:production-env
```

---

## 4. Database Migration

```bash
npm run db:migrate:server:deploy
```

**Do not** run `db:seed` on production unless Fratelanza support explicitly instructs — seed creates demo credentials.

---

## 5. Admin Bootstrap

Options:

1. **Fratelanza support guided bootstrap** — create tenant, owner role, admin user via controlled script
2. **Controlled seed + immediate password change** — only if documented in support runbook

First login must use a strong password. Disable or remove demo accounts.

---

## 6. License Activation

Fratelanza issues a signed license payload (perpetual or time-limited) bound to:

- `tenantId`
- `installationId` (matches `FRATELANZA_INSTALLATION_ID`)
- modules and features

Admin with `core:license:manage` calls:

```
POST /api/v1/license/activate
Authorization: Bearer <token>
```

Body: signed license document + signature (see Phase 4.5 licensing docs).

After activation, verify:

```
GET /api/v1/system/diagnostics
```

---

## 7. LAN Configuration

1. Bind API to `0.0.0.0:3000` (or reverse proxy)
2. Windows Firewall: allow inbound TCP 3000 from LAN subnet only
3. Note server LAN IP (e.g. `192.168.1.10`)

Desktop clients configure API URL: `http://192.168.1.10:3000`

---

## 8. First Login

1. Install Fratelanza Desktop on client PC
2. Open Settings → set server URL
3. Sign in with admin credentials
4. Verify Dashboard, Party, Sales smoke test

---

## 9. Verification Checklist

- [ ] `GET /api/v1/health` → `healthy`
- [ ] `GET /api/v1/system/version` → version matches release
- [ ] `GET /api/v1/system/diagnostics` → license operational, modules listed
- [ ] Login from desktop over LAN
- [ ] Party create/edit
- [ ] Sales invoice create/post
- [ ] Unlicensed module blocked (if applicable)
- [ ] Backup script runs successfully
- [ ] Disconnect internet → core operations continue

---

## 10. Uninstall / Reinstall

| Component | Notes |
|-----------|-------|
| Desktop | Uninstall via Windows Programs; user data in AppData |
| API | Stop service, remove build directory |
| PostgreSQL | **Customer data** — backup before uninstall |
| License | Re-activation may be required if `installationId` changes |
| Reinstall same server | Preserve `FRATELANZA_INSTALLATION_ID` + restore DB backup |

---

## Support Contacts

License issuance and replacement: Fratelanza licensing authority (`mg.fratelanza.com` — online contract deferred in Phase 10.0).
