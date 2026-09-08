# PHASE 10.0 — BACKUP & RESTORE

Production backup foundation for customer PostgreSQL business data.

---

## Scope

### Included in backup

- Full PostgreSQL database (`fratelanza_erp`)
- All tenant business data: parties, sales, inventory, finance, construction, audit, users, license records

### NOT included

- Desktop client local preferences (API URL, theme)
- Fratelanza licensing authority records (mg.fratelanza.com)
- Ed25519 private signing keys (never on customer server)

---

## Backup Utility

### Windows

```powershell
npm run backup:db
# or
.\scripts\backup-database.ps1 -OutputDir D:\FratelanzaBackups
```

### Linux

```bash
chmod +x scripts/backup-database.sh
DATABASE_URL="postgresql://..." ./scripts/backup-database.sh /var/backups/fratelanza
```

Output: `fratelanza_erp_YYYYMMDD-HHMMSS.sql` (plain SQL via `pg_dump`)

---

## Restore Procedure

**Prerequisite:** Stop Fratelanza API during restore.

```bash
# Drop and recreate database (destructive)
psql -U postgres -c "DROP DATABASE IF EXISTS fratelanza_erp;"
psql -U postgres -c "CREATE DATABASE fratelanza_erp OWNER fratelanza;"

# Restore
psql -U fratelanza -d fratelanza_erp -f backups/fratelanza_erp_YYYYMMDD-HHMMSS.sql
```

Then:

1. Start API
2. `GET /api/v1/health` → healthy
3. `GET /api/v1/system/diagnostics` → license status
4. Login smoke test

---

## Verification

A backup is **verified** only after a successful restore test on a non-production instance.

Recommended cadence:

- Before every upgrade
- Daily automated backup (customer IT policy)
- Post restore: run verification checklist from Customer Installation doc

---

## Disaster Recovery

| Scenario | Recovery |
|----------|----------|
| DB corruption | Restore latest verified backup |
| Server hardware failure | New server + same `FRATELANZA_INSTALLATION_ID` + restore DB + reinstall API |
| Lost installation ID | Contact Fratelanza for license re-binding |
| Lost license file | Re-import signed payload if available; else contact Fratelanza |

---

## License Recovery Implications

- License stored in PostgreSQL (`TenantLicense`)
- Restore includes license record and signature
- If `installationId` on new server differs from license, re-activation required

---

## Phase 10.0 Restore Test Status

Restore procedure documented and script-compatible with standard `pg_dump`/`psql`. **Execute restore test on staging before declaring production-ready.**
