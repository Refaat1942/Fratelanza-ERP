# Fratelanza Grand ERP

A production-ready, modular, offline-first desktop ERP platform for multi-industry businesses.

## Features

- **Multi-tenant** — Strict tenant isolation for SaaS or multi-company deployments
- **Multi-branch & multi-warehouse** — Branch-level permissions and consolidated reporting
- **Core ERP** — Products, customers, suppliers, inventory, sales, purchasing, accounting, POS
- **Double-entry accounting** — Journal engine with chart of accounts and trial balance
- **Bilingual** — Arabic and English with RTL/LTR support
- **Sync foundation** — Push/pull API, connectivity badge, persisted device identity
- **Modular** — Enable only the modules each company needs

> Full offline SQLite replication is in progress. The desktop app currently operates online against the NestJS API, with sync endpoints ready for local queue integration.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron, React, TypeScript, Vite |
| API | NestJS, TypeScript |
| Server DB | PostgreSQL |
| Local DB | SQLite (schema defined, migrations pending) |
| ORM | Prisma |
| State | Zustand |
| i18n | i18next |

## Project Structure

```
apps/api          — NestJS REST API
apps/desktop      — Electron desktop application
packages/*        — Shared libraries (database, domain, types, localization)
modules/*         — ERP module definitions
infra/docker      — Development infrastructure
docs/             — Architecture and roadmap
```

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL (local install or Docker via `npm run docker:up`)
- npm 10+

### Setup

```bash
git clone https://github.com/Refaat1942/Fratelanza-ERP.git
cd Fratelanza-ERP
npm install

# Copy environment and set DATABASE_URL
cp .env.example .env

# Generate Prisma clients, migrate, and seed
npm run db:generate
npm run db:migrate:server:deploy
npm run db:seed

# Terminal 1 — API
npm run dev:api

# Terminal 2 — Desktop
npm run dev:desktop
```

### Default Credentials (Development Seed)

- Email: `admin@fratelanza.local`
- Password: `Admin@123456`

Sample data includes products with stock, a draft sales invoice, and a draft purchase order.

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Roadmap](./docs/ROADMAP.md)

## License

Proprietary — Fratelanza
