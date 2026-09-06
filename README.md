# Fratelanza Grand ERP

A production-ready, modular, offline-first desktop ERP platform for multi-industry businesses.

## Features (Planned)

- **Offline-first** — Full ERP operations without internet; automatic sync when online
- **Multi-tenant** — Strict tenant isolation for SaaS or multi-company deployments
- **Multi-branch & multi-warehouse** — Branch-level permissions and consolidated reporting
- **Modular** — Enable only the modules each company needs
- **Bilingual** — Arabic and English with RTL/LTR support
- **Double-entry accounting** — Proper financial engine with audit trail

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron, React, TypeScript, Vite |
| API | NestJS, TypeScript |
| Server DB | PostgreSQL |
| Local DB | SQLite |
| ORM | Prisma |
| State | Zustand |
| i18n | i18next |

## Project Structure

```
apps/api          — NestJS REST API
apps/desktop      — Electron desktop application
packages/*        — Shared libraries
modules/*         — ERP module definitions
infra/docker      — Development infrastructure
docs/             — Architecture and roadmap
```

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)
- npm 10+

### Setup

```bash
# Clone and install
git clone https://github.com/Refaat1942/Fratelanza-ERP.git
cd Fratelanza-ERP
npm install

# Start PostgreSQL
npm run docker:up

# Copy environment
cp .env.example .env

# Generate Prisma clients and run migrations
npm run db:generate
npm run db:migrate:server
npm run db:seed

# Start API (terminal 1)
npm run dev:api

# Start desktop app (terminal 2)
npm run dev:desktop
```

### Default Credentials (Development Seed)

- Email: `admin@fratelanza.local`
- Password: `Admin@123456`

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Roadmap](./docs/ROADMAP.md)

## License

Proprietary — Fratelanza
