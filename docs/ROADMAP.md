# Development Roadmap

## Phase 1: Foundation ✅ (In Progress)

- [x] Monorepo structure (npm workspaces)
- [x] TypeScript base configuration
- [x] Prisma schemas (PostgreSQL + SQLite)
- [x] NestJS API skeleton
- [x] Auth (JWT + refresh tokens)
- [x] Multi-tenant architecture
- [x] Users, roles, permissions
- [x] Branches, devices
- [x] Settings
- [x] Electron + React + Vite desktop shell
- [x] Localization (Arabic + English, RTL/LTR)
- [x] Theme system (dark/light)
- [x] Docker PostgreSQL

## Phase 2: Offline Engine

- Local repository pattern
- Sync queue, sync log, sync conflicts, sync cursor
- Connectivity detection (ONLINE / OFFLINE / SYNCING / SYNC ERROR)
- Sync engine with retry, backoff, idempotency
- Device identity and registration
- Conflict detection and resolution rules

## Phase 3: Core ERP

- Products, services, categories, units
- Customers, suppliers
- Warehouses, inventory movements
- Sales workflow (quotation → order → delivery → invoice → payment)
- Purchasing workflow
- Payments

## Phase 4: Accounting

- Chart of accounts
- Double-entry journal engine
- General ledger, AR/AP
- Fiscal periods
- Financial reports

## Phase 5: POS

- Touch-friendly checkout
- Barcode, split payments, shifts
- Receipt printing, offline queue

## Phase 6: CRM

- Leads, opportunities, pipeline
- Activities, follow-ups

## Phase 7: Advanced Modules

- HR, assets, projects, manufacturing, service, contracts

## Phase 8: Industry Modules

- Pharmacy, restaurant, real estate, clinic, retail verticals

## Phase 9: Integrations

- Tax adapters, payment gateways, messaging, shipping

## Phase 10: Production Hardening

- Security audit, performance, monitoring
- Backup/restore, updater, installer
- Comprehensive automated testing
