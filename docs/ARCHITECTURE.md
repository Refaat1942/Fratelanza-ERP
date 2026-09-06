# Fratelanza Grand ERP — Architecture

## 1. Architecture Assessment

### Current State (Initial)

| Area | Status |
|------|--------|
| Repository | Empty — greenfield project |
| Technology stack | None — full stack to be established |
| Database | None |
| Modules | None |
| Desktop app | None |
| API | None |

**Conclusion:** This is a greenfield build. No migration from legacy code is required. We can implement the target architecture directly without compatibility constraints.

---

## 2. Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     DESKTOP (Electron)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ React UI     │  │ Zustand      │  │ i18n (AR/EN, RTL)    │  │
│  │ (Renderer)   │  │ State        │  │ Theme (Dark/Light)   │  │
│  └──────┬───────┘  └──────────────┘  └──────────────────────┘  │
│         │ preload (contextBridge)                               │
│  ┌──────▼──────────────────────────────────────────────────┐   │
│  │ Electron Main Process                                    │   │
│  │  • Local Domain Services                                 │   │
│  │  • Sync Engine                                           │   │
│  │  • SQLite (Prisma)                                       │   │
│  │  • Connectivity Monitor                                  │   │
│  │  • Device Identity                                       │   │
│  └──────────────────────────┬───────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────┘
                              │ REST + WebSocket (when online)
┌─────────────────────────────▼───────────────────────────────────┐
│                     SERVER (NestJS API)                         │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐ │
│  │ Auth       │ │ Tenants    │ │ Sync       │ │ Module       │ │
│  │ JWT/Refresh│ │ RBAC       │ │ Engine     │ │ Registry     │ │
│  └────────────┘ └────────────┘ └────────────┘ └──────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Domain Modules: core, sales, inventory, accounting, pos... │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                    PostgreSQL (Prisma)                           │
└──────────────────────────────────────────────────────────────────┘
```

### Architectural Style

- **Modular monolith** — clear module boundaries, extractable to microservices later
- **Offline-first** — SQLite is operational source on desktop; PostgreSQL is system of record on server
- **Event-driven internally** — domain events decouple modules
- **Shared domain layer** — business rules live in `@fratelanza/domain`, reused by API and desktop

---

## 3. Folder Structure

```
fratelanza-erp/
├── apps/
│   ├── api/                    # NestJS REST API
│   └── desktop/                # Electron + React + Vite
├── packages/
│   ├── config/                 # Shared configuration schemas
│   ├── database/               # Prisma schemas (server + local)
│   ├── domain/                 # Shared business logic
│   ├── localization/           # i18n resources (AR/EN)
│   ├── shared/                 # Utilities, constants
│   ├── types/                  # Shared TypeScript types
│   └── ui/                     # Shared React components
├── modules/
│   └── core/                   # Core platform module definition
├── infra/
│   └── docker/                 # PostgreSQL, Redis (future)
├── docs/                       # Architecture, roadmap, ADRs
└── tests/                      # Cross-cutting integration tests
```

---

## 4. Database Architecture

### Dual-Database Strategy

| Database | Provider | Purpose |
|----------|----------|---------|
| Server | PostgreSQL | Central multi-tenant system of record |
| Local | SQLite | Offline operational database per device |

### Sync Metadata (Every Synced Entity)

```typescript
interface SyncableEntity {
  id: string;           // UUID
  tenantId: string;
  branchId?: string;
  deviceId?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  syncStatus: 'pending' | 'synced' | 'conflict' | 'error';
  version: number;
  lastSyncedAt?: Date;
}
```

### Sync Infrastructure Tables

- `sync_queue` — outbound changes awaiting upload
- `sync_log` — synchronization history
- `sync_conflicts` — detected conflicts
- `sync_cursor` — incremental pull position
- `device_sessions` — registered devices

### Tenant Isolation

- Every business table includes `tenantId`
- Row-level filtering enforced at repository/service layer
- JWT claims include `tenantId`; middleware validates on every request

---

## 5. Module Architecture

Each module defines:

```typescript
interface ErpModuleDefinition {
  id: string;
  name: string;
  version: string;
  dependencies: string[];
  permissions: PermissionDefinition[];
  entities: string[];
  routes: RouteDefinition[];
  menuItems: MenuItemDefinition[];
  syncHandlers: SyncHandlerDefinition[];
}
```

Module registry enables per-tenant activation. Industry verticals (pharmacy, restaurant, real estate) are separate modules under `modules/industry/`.

---

## 6. Offline Synchronization Architecture

```
Local Transaction
    │
    ▼
SQLite (atomic commit)
    │
    ▼
sync_queue (entityType, entityId, operation, payload, version)
    │
    ▼ (when ONLINE)
Sync Engine ──► REST API ──► PostgreSQL
    │                              │
    ◄── confirmation / conflict ───┘
    │
    ▼
Update local syncStatus, lastSyncedAt
```

**Capabilities:** retry with exponential backoff, partial sync, conflict detection, idempotency keys, transaction ordering, batch uploads.

**Conflict rules:**
- Master data: last-write-wins (configurable)
- Transactions: never silently overwrite — both preserved
- Financial records: immutable — conflicts flagged for manual resolution
- Inventory: movement-based ledger — no quantity overwrites

---

## 7. Security Architecture

| Layer | Controls |
|-------|----------|
| Authentication | JWT access + refresh tokens, bcrypt passwords |
| Authorization | RBAC: Module → Feature → Action |
| Tenant isolation | tenantId on all queries, middleware enforcement |
| Desktop | Context isolation, no nodeIntegration, CSP, secure IPC |
| API | Input validation (class-validator), rate limiting, CORS |
| Data | Parameterized queries (Prisma), encryption for sensitive fields |

---

## 8. Development Roadmap

See [ROADMAP.md](./ROADMAP.md) for phased delivery plan (Phases 1–10).

**Current phase:** Phase 1 — Foundation

---

## 9. Migration Strategy

Not applicable for initial build. Future considerations:

- Schema migrations via Prisma migrate (versioned, never manual)
- Local and server schemas kept compatible through shared entity definitions
- Desktop migrations run on app startup before sync resume

---

## 10. Risks and Technical Decisions

| Decision | Rationale | Risk |
|----------|-----------|------|
| Modular monolith first | Faster delivery, clear boundaries | Must enforce module boundaries in code review |
| Prisma dual schema | Type-safe ORM, migration tooling | Two schemas to keep in sync |
| SQLite offline | Proven, embedded, fast | Large sync batches need batching |
| NestJS API | Enterprise patterns, DI, modular | Learning curve for team |
| Electron desktop | Cross-platform, offline-capable | App size, update complexity |
| UUID primary keys | Offline-safe ID generation | Larger indexes vs sequential |
| Zustand state | Lightweight vs Redux | May need middleware for complex flows |

**Mitigations:**
- Shared `@fratelanza/domain` prevents logic duplication
- Automated sync integration tests (Phase 2+)
- Module boundary lint rules (future)
- Document numbering via server-safe sequences with offline reservation
