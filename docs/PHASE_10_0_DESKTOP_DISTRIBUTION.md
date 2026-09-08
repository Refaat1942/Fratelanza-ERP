# PHASE 10.0 — DESKTOP DISTRIBUTION

Production packaging foundation for Fratelanza Desktop (thin LAN client).

---

## Distribution Model

| Deliverable | Contents |
|-------------|----------|
| Customer receives | Compiled installer (NSIS `.exe`), no source code |
| Customer does NOT receive | Repository, Ed25519 private key, JWT secrets, API source |

Desktop is a **thin client**:

- Business data on customer PostgreSQL via API
- Auth tokens and preferences stored locally (Electron userData)
- Legacy SQLite sync disabled by default (`SYNC_ENABLED=false`)

---

## Application Identity

| Property | Value |
|----------|-------|
| Package name | `@fratelanza/desktop` |
| App ID | `com.fratelanza.grand-erp` |
| Product name | Fratelanza Grand ERP |
| Version source | `apps/desktop/package.json` → synced with monorepo `0.1.0` |

Override at build time: `DESKTOP_VERSION` or `APP_VERSION` env.

---

## Build Commands

```bash
# Renderer + Electron main/preload
npm run build:desktop

# Windows installer (requires electron-builder)
cd apps/desktop
npm run pack
```

Output: `apps/desktop/release/Fratelanza-ERP-<version>-Setup.exe`

Directory-only build (no installer):

```bash
npm run pack:dir -w @fratelanza/desktop
```

---

## Configuration Strategy

### API URL

- **Not hardcoded in production builds**
- Default dev: `http://localhost:3000`
- Production: user configures in Settings → Server URL
- Persisted via Electron `userData` + Zustand store

### Connectivity

- Health check: `GET {apiUrl}/api/v1/health`
- No runtime dependency on `mg.fratelanza.com`

### CSP

Production LAN deployments may require updating `apps/desktop/index.html` CSP `connect-src` to include customer server IP. Document per-deployment or use build-time injection in future release pipeline.

---

## Versioning

Desktop version reported to support via:

- Installer filename: `Fratelanza-ERP-0.1.0-Setup.exe`
- API `GET /api/v1/system/version` for server-side version alignment

Keep desktop and API versions aligned per release bundle.

---

## Security

- `contextIsolation: true`, preload bridge only
- No private signing keys in desktop bundle
- Access tokens stored in Electron secure storage path (userData)
- Logout clears tokens

---

## Deferred

- Auto-updater (Phase 10.0 documents foundation only)
- Code signing certificate (customer-specific deployment step)
- macOS/Linux installers
