# Development Roadmap

## Phase 1: Foundation ✅

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

## Phase 2: Offline Engine (Partial)

- [x] Connectivity detection (ONLINE / OFFLINE / SYNCING / SYNC ERROR)
- [x] Sync API endpoints (push / pull)
- [x] Desktop sync trigger with persisted device ID
- [x] Local SQLite schema (core + ERP cache models)
- [x] Electron local DB init (`prisma db push` on startup)
- [x] Pull → SQLite apply for products, customers, suppliers, warehouses, units, stock
- [ ] Sync queue processing for offline writes
- [ ] Conflict detection and resolution rules

## Phase 3: Core ERP (Partial)

- [x] Products, categories, units (API + list/create/edit UI)
- [x] Customers, suppliers (API + list/create/edit UI)
- [x] Warehouses, inventory movements (API + balances + adjust UI)
- [x] Sales invoices (API + list/create/post UI)
- [x] Purchasing orders (API + list/create/receive UI)
- [x] Customer/supplier payments (API)
- [x] Sample seed data (stock, draft invoice, draft PO)

## Phase 4: Accounting (Partial)

- [x] Chart of accounts (API + seed)
- [x] Double-entry journal engine
- [x] Trial balance report (API + UI)
- [ ] General ledger, AR/AP reports
- [ ] Fiscal periods UI
- [ ] Financial reports (P&L, balance sheet)

## Phase 5: POS (Partial)

- [x] Touch-friendly checkout UI
- [x] Shift open/close (API + auto-open on POS page)
- [x] Cash payments
- [ ] Barcode scanner integration
- [ ] Split payments UI
- [ ] Receipt printing
- [ ] Offline POS queue

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
