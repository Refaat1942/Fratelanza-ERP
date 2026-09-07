# Phase 1.5 — Fratelanza Business Platform Architecture

**Status:** Design Complete (Architecture Checkpoint)  
**Date:** 2026-09-07  
**Scope:** Design only — no implementation, no schema changes, no code modifications  
**Approved immutable:** Phase 1a, 1b, 1c PMS decisions (see §22)

---

## 1. Executive Summary

Fratelanza is repositioned from a clinic-only PMS into a **general-purpose Business Management / ERP Platform** capable of serving construction firms, accounting practices, trading companies, retail, professional services, clinics, manufacturing, and other SMBs.

**PMS is a vertical module**, not the platform center. The Phase 1a–1c PMS backend (schema, patient ledger, patients API) remains **intact and approved** — it becomes the first fully-designed vertical subledger, not a prototype to rewrite.

### Current repository reality

| Layer | State |
|-------|-------|
| **Platform Core** | Production-ready: auth, RBAC, tenants, branches, users, devices, settings, audit skeleton, document numbering |
| **Business Core (ERP)** | Functional but **frozen**: products, customers, suppliers, inventory, sales, purchasing, accounting GL, POS |
| **PMS Vertical** | Active backend: 14 tables, ledger core, patients API — no PMS UI yet |
| **Other verticals** | Not started (construction, accounting firm, etc.) |
| **Desktop** | Electron thin client with frozen ERP pages; LAN MVP mode (`SYNC_ENABLED=false`) |

### Target direction

A **modular monolith** organized in three horizontal layers plus vertical modules:

```
FRATELANZA BUSINESS PLATFORM
         │
    ┌────┴────┐
    │         │
PLATFORM   BUSINESS
  CORE       CORE
    │         │
    └────┬────┘
         │
   VERTICAL MODULES
  (PMS, Retail, Construction, …)
```

**Key architectural bet:** Operational documents post to **domain subledgers** (patient ledger, AR ledger, project cost ledger), which optionally emit **Financial Posting** events to a **Universal General Ledger**. PMS Phase 1b ledger is the reference implementation of a subledger — not a mistake to undo.

---

## 2. Current Architecture Audit

### 2.1 Monorepo structure

```
fratelanza-grand-erp/
├── apps/
│   ├── api/          NestJS 11 REST API (/api/v1)
│   └── desktop/      Electron 34 + React 19 + Vite 6
├── packages/
│   ├── config/       Env validation, API config
│   ├── database/     Prisma (PostgreSQL server + SQLite local subset)
│   ├── domain/       Module definitions, event types (minimal)
│   ├── localization/ i18n (en, ar)
│   ├── shared/       Constants, permission key builder
│   └── types/        JwtPayload, ApiResponse, RBAC types
├── modules/
│   └── core/         Core module registry (@fratelanza/core-module)
├── infra/docker/     Dev PostgreSQL 16
└── docs/             Architecture + phase completion docs
```

**Note:** Original `docs/ARCHITECTURE.md` describes an offline-first greenfield plan that **does not match** the current LAN-first reality. `docs/ARCHITECTURE_AUDIT.md` and phase completion docs are more authoritative for current state.

### 2.2 API modules (actual)

| Category | Modules | Status |
|----------|---------|--------|
| **Platform** | auth, tenants, branches, users, roles, devices, settings, health, audit | Active |
| **Legacy ERP** | products, customers, suppliers, warehouses, inventory, sales, purchasing, accounting, pos, sync, dashboard | Frozen (`docs/LEGACY_ERP.md`) |
| **PMS** | pms (ledger, patients) | Active — Phase 1b/1c complete |

**Not yet implemented:** PMS services, encounters, charges, payments, refunds, reports; all other verticals.

### 2.3 Database domains (PostgreSQL)

| Domain | Tables | Notes |
|--------|--------|-------|
| **Platform** | tenants, branches, users, roles, permissions, sessions, devices, audit_logs, tenant_modules, number_sequences | Solid foundation |
| **ERP Business** | products, customers, suppliers, warehouses, stock, inventory_movements, sales_invoices, purchase_orders, payments, accounts, journal_entries, fiscal_periods, pos_* | Frozen reference |
| **PMS** | pms_* (14 tables) | Additive namespace; approved |
| **Sync** | sync_queue, sync_logs, sync_conflicts, sync_cursors | Disabled by default |

**SQLite local schema:** Platform + partial ERP cache only. No PMS, no GL. LAN MVP deprecates client SQLite for daily use.

### 2.4 Shared services (actual code)

| Service | Location | Role |
|---------|----------|------|
| `DocumentNumberService` | `common/services/document-number.service.ts` | Atomic numbering via `number_sequences` SQL upsert |
| `AccountingEngineService` | `common/services/accounting-engine.service.ts` | Balanced GL journal creation; hardcoded COA codes |
| `InventoryLedgerService` | `common/services/inventory-ledger.service.ts` | Stock movements + weighted average cost |
| `LedgerPostingService` | `pms/ledger/ledger-posting.service.ts` | Append-only PMS subledger (not yet called by charge/payment services) |
| `PatientAccountService` | `pms/ledger/patient-account.service.ts` | Patient account lifecycle + reconciliation |

### 2.5 Financial posting today (ERP)

| Trigger | GL Entry | Inventory | Party Balance |
|---------|----------|-----------|---------------|
| Post sales invoice | DR AR / CR Revenue (+ COGS) | Yes | Customer.balance ↑ |
| Customer payment | DR Cash / CR AR | No | Customer.balance ↓ |
| Receive PO | DR Inventory / CR AP | Yes | Supplier.balance ↑ |
| POS sale | DR Cash / CR Revenue (cash portion only) | Optional | No |
| Stock adjustment | **None** | Yes | No |

**PMS:** Patient account created on patient registration; ledger posting service exists but **no charge/payment services call it yet**.

### 2.6 Authentication & RBAC

- JWT access + refresh with **session validation** on every request (Phase 0)
- Permissions: `module:feature:action` (e.g. `pms:patients:read`, `sales:invoices:post`)
- `@RequirePermissions` + global `JwtAuthGuard` + per-controller `PermissionsGuard`
- Permissions loaded from DB on each request via role → role_permissions
- Seed: `CORE_PERMISSIONS` + `PMS_PERMISSIONS` (30 PMS permissions)

### 2.7 Tenant & branch patterns

- **Every business row** carries `tenantId`; queries scoped from JWT
- **Branch** required on transactional documents (sales, PMS ledger); optional on master data (customer, patient)
- **PatientAccount:** one per `(tenantId, patientId)` — branch on **transactions**, not accounts (approved Phase 1a)
- **Number sequences:** `(tenantId, branchId, documentType, fiscalYear)` — NULL branchId unsafe for upsert (PostgreSQL NULL unique semantics)

### 2.8 What can become Universal Platform

| Existing | Universal role | Action |
|----------|----------------|--------|
| Tenant, Branch | Platform Core | Reuse as-is |
| User, Role, Permission, Session | Identity | Reuse; extend permission namespaces |
| AuditLog | Platform Core | Reuse; expand write coverage |
| NumberSequence + DocumentNumberService | Platform Core | Reuse; document-type registry |
| TenantModule | Platform Core | Enable per-vertical licensing |
| Device | Platform Core | Reuse for LAN clients |
| Settings (JSON on Tenant/Branch) | Platform Core | Evolve to typed settings modules |

### 2.9 What must remain frozen or be deprecated gradually

| Existing | Disposition |
|----------|-------------|
| ERP modules (products → POS) | **Frozen** — reference + extract patterns; do not delete |
| SQLite offline sync | **Deprecated for LAN MVP** — keep code, disable by default |
| Hardcoded GL account codes in services | **Replace later** with posting rules / account mapping |
| Customer.balance / Supplier.balance caches | **Subledger pattern** — align with universal AR/AP later |
| Desktop ERP pages | **Frozen** — new UI per vertical/platform |

---

## 3. Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FRATELANZA BUSINESS PLATFORM                          │
│                         (Modular Monolith)                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐         ┌─────────────────┐         ┌─────────────────┐
│ PLATFORM CORE │         │  BUSINESS CORE  │         │ VERTICAL MODULES│
├───────────────┤         ├─────────────────┤         ├─────────────────┤
│ Tenants       │         │ Finance (GL)    │         │ PMS             │
│ Branches      │         │ Treasury        │         │ Retail/Trading  │
│ Identity/RBAC │         │ AR / AP         │         │ Construction    │
│ Audit         │         │ Contacts/Party  │         │ Accounting Firm │
│ Settings      │         │ Documents       │         │ Prof. Services  │
│ Numbering     │         │ Projects        │         │ Manufacturing   │
│ Attachments*  │         │ Sales           │         │ (future)        │
│ Workflows*    │         │ Purchasing      │         │                 │
│ Notifications*│         │ Inventory       │         │                 │
└───────────────┘         │ Expenses*       │         └─────────────────┘
        │                 └─────────────────┘                   │
        │                           │                           │
        └───────────────────────────┴───────────────────────────┘
                                    │
                          Integration Layer
                    (FinancialPosting, Events, Dimensions)
                                    │
                          PostgreSQL (single DB)
                    tenant-scoped, branch-aware transactions
```

`*` = designed but not yet in repository

### Architectural principles

1. **Vertical modules own domain entities** — Patient ≠ Customer; never merge for convenience
2. **Subledgers before GL** — operational truth lives in domain ledgers; GL is consolidated financial truth
3. **Posting is explicit** — no silent double-entry from CRUD; caller-owned transactions
4. **Platform services are shared** — numbering, audit, permissions, documents
5. **Tenant isolation is non-negotiable** — every query, every test
6. **Branch is a reporting/transaction dimension** — not a second tenant
7. **Freeze-then-evolve** — extract universal patterns from working ERP code; don't rewrite in place

---

## 4. Platform Core

Universal capabilities required by **every** business type.

| Entity / Service | Why universal | Exists today | Recommendation |
|------------------|---------------|--------------|----------------|
| **Tenant** | Multi-tenant SaaS / multi-company | ✅ `Tenant` | **Reuse** — add `TenantModule` licensing enforcement |
| **Company** | Legal entity (may differ from tenant in enterprise) | ❌ (Tenant ≈ company today) | **Defer** — Tenant suffices for SMB; alias later if needed |
| **Branch** | Sites, offices, clinics, stores | ✅ `Branch` | **Reuse** — extend settings JSON → typed branch config |
| **User** | Human operators | ✅ `User` | **Reuse** |
| **Role / Permission** | RBAC | ✅ | **Reuse** — extend namespaces (`finance:*`, `projects:*`) |
| **Session** | Secure auth | ✅ | **Reuse** (Phase 0 hardened) |
| **Audit Log** | Compliance, traceability | ✅ skeleton | **Extend** — wire to all financial mutations |
| **Settings** | Tenant/branch configuration | ✅ JSON fields | **Refactor later** — typed settings per module without breaking JSON |
| **Numbering** | Document codes | ✅ `DocumentNumberService` | **Reuse** — add document-type registry |
| **Currency** | Multi-currency readiness | ⚠️ implicit (EGP default) | **Add** to platform settings; PMS account already has `currency` |
| **Tax configuration** | VAT, withholding | ❌ | **Add** in Business Core finance layer |
| **Attachments** | Files on any entity | ❌ | **Add** platform service (S3/local path) |
| **Documents (metadata)** | Universal document header | ⚠️ per-entity numbers only | **Evolve** — document registry wrapping numbering |
| **Notifications** | Alerts, approvals | ❌ | **Add** later |
| **Approval workflows** | Discount overrides, PO approval | ❌ | **Add** platform workflow engine later |
| **Activity history** | User-facing timeline | ⚠️ audit + PMS notes | **Unify** via audit + domain events |
| **Device** | LAN client identity | ✅ | **Reuse** |
| **TenantModule** | Enable/disable verticals | ✅ | **Enforce** in guards before vertical routes |

**Phase 2 decision:** Platform Core in the repo is **good enough to build on**. Universal Finance foundation implemented in Phase 2 (`FinancialPostingService`, posting rules, fiscal periods). Legacy `AccountingEngineService` remains for frozen ERP until migration.

---

## 5. Business Core

Shared business capabilities used by **multiple verticals**, not tied to one industry.

| Capability | Owner | Exists | Target |
|------------|-------|--------|--------|
| **Chart of Accounts** | Finance | ✅ ERP `Account` | Promote to universal finance module |
| **General Ledger** | Finance | ✅ `JournalEntry` / `JournalLine` | Promote; add posting rules |
| **AR (Receivables)** | Finance | ⚠️ `Customer` + `SalesInvoice` + balance cache | Evolve to AR subledger + GL posting |
| **AP (Payables)** | Finance | ⚠️ `Supplier` + `PurchaseOrder` + balance cache | Evolve to AP subledger + GL posting |
| **Treasury (Cash/Bank)** | Finance | ⚠️ hardcoded account `1000` | Explicit bank/cash accounts module |
| **Contacts / Party** | CRM | ⚠️ separate Customer, Supplier | Universal Party model (see §8) |
| **Sales** | Sales | ✅ frozen ERP | Refactor into Business Core sales module |
| **Purchasing** | Procurement | ✅ frozen ERP | Refactor into Business Core |
| **Inventory** | Inventory | ✅ frozen ERP | Refactor; keep warehouse model |
| **Products / Items** | Catalog | ✅ frozen ERP | Universal item master (goods + non-stock services) |
| **Projects** | Projects | ❌ | **New** universal module (see §9) |
| **Cost Centers** | Projects/Finance | ❌ | **New** as finance dimensions |
| **Expenses** | Finance | ❌ | Employee/vendor expenses → AP or GL |
| **POS** | Retail vertical | ✅ frozen | Stays retail-specific; uses Business Core sales/inventory |

**Boundary rule:** If two verticals need it unchanged → Business Core. If industry-specific → Vertical Module.

---

## 6. Universal Finance

### 6.1 Target financial stack

```
Business Transaction (Invoice, Charge, Payment, Project Cost, …)
              │
              ▼
    Domain Subledger (operational truth)
    ├── PatientAccount + pms_ledger_entries     [PMS]
    ├── Customer AR subledger (future)          [Sales]
    ├── Supplier AP subledger (future)          [Purchasing]
    └── Project cost ledger (future)          [Projects]
              │
              ▼
      Financial Posting Service (future)
      ├── Validates balanced entry
      ├── Maps to Chart of Accounts
      ├── Applies dimensions (branch, project, cost center)
      └── Creates JournalEntry + JournalLines
              │
              ▼
         General Ledger (financial truth)
              │
              ▼
    Financial Reports (Trial Balance, P&L, Balance Sheet, Cash Flow)
```

### 6.2 Entity mapping (current → target)

| Concept | Current | Target owner |
|---------|---------|--------------|
| Chart of Accounts | `accounts` | Universal Finance |
| General Ledger | `journal_entries`, `journal_lines` | Universal Finance |
| Fiscal Periods | `fiscal_periods` | Universal Finance |
| AR | `customers.balance` + invoices | AR subledger + GL |
| AP | `suppliers.balance` + POs | AP subledger + GL |
| Cash/Bank | COA code `1000` | Treasury accounts |
| Payments/Receipts | `customer_payments`, `supplier_payments`, `pms_payments` | Domain docs → posting |
| Revenue | COA `4000` + invoice lines | GL via posting rules |
| Expenses | COA `5100` (partial) | Expense module + GL |
| Taxes | Not modeled | Tax codes + posting lines |
| Cost Centers | Not modeled | Finance dimensions |
| Projects | Not modeled | Project module + dimensions |
| Financial Periods | `fiscal_periods` | Close/open enforcement on posting |

### 6.3 Coexistence with PMS patient ledger (critical)

**Approved Phase 1b design (immutable):**

```
PatientAccount (cachedBalance)
       ↕ atomic
pms_ledger_entries (append-only, debit↑ credit↓)
```

**This remains PMS-specific forever** at the operational level. It is a **patient subledger**, not a replacement for GL.

**Future integration (Phase 2+):**

```
PMS Charge posted
  → LedgerPostingService.postEntry (PMS subledger)     [unchanged]
  → FinancialPostingService.post (optional/configurable)
       → DR AR-Patients / CR Revenue-PMS               [GL]
       → dimensions: branchId, optional costCenterId
```

| Question | Answer |
|----------|--------|
| Can PMS ledger coexist with Universal GL? | **Yes** — they serve different purposes (patient statement vs financial statements) |
| What stays PMS-specific? | Patient, PatientAccount, pms_ledger_entries, charges, payments, refunds |
| What becomes universal? | Chart of Accounts, JournalEntry, posting rules, financial reports |
| Can LedgerPostingService evolve? | **Pattern reuse yes, code merge no** — extract `SubledgerPostingEngine` interface later; PMS implementation stays |
| What must NOT change now? | Append-only ledger, FOR UPDATE, caller-owned tx, cachedBalance atomicity, debit/credit semantics |
| GL link timing | **Deferred** — post-MVP; use `referenceType`/`referenceId` convention already on both sides |

### 6.4 Posting rules (future)

Replace hardcoded account codes (`1000`, `1100`, …) with:

```typescript
// Conceptual — NOT implemented
PostingRule {
  tenantId, sourceModule, sourceType, eventType
  lines: [{ accountCode | accountRole, debit | credit, amountField, dimensionMap }]
}
```

ERP services become **callers** of posting rules instead of embedding COA codes.

---

## 7. PMS Integration Strategy

### 7.1 Vertical boundary

| In PMS module | In Platform/Business Core |
|---------------|---------------------------|
| Patient, Profile, Notes | Tenant, Branch, User, RBAC |
| PatientAccount, pms_ledger_entries | Chart of Accounts, GL |
| Service catalog (clinic services) | Universal Item (optional link later) |
| Encounter, Charge, Payment, Refund | Financial Posting (future) |
| PMS reports (patient statement) | Universal financial reports |

### 7.2 Dependencies

```
PMS → Platform Core (auth, tenant, branch, numbering, audit)
PMS → Finance (future, optional GL posting)
PMS ↛ Sales/Inventory/Projects (no direct dependency)
Finance ↛ PMS (GL should not know Patient entity)
```

### 7.3 Completing PMS vertical (post-1.5)

Continue Phase 1d+ on **approved foundation**:

1. Services catalog (PMS services, not ERP products)
2. Encounters
3. Charges → calls `LedgerPostingService`
4. Payments / Refunds / Adjustments
5. PMS operational reports
6. PMS desktop UI
7. Optional: GL posting bridge (tenant setting `pms.glIntegrationEnabled`)

**Do not** rename `Patient` → `Customer` or merge ledgers.

---

## 8. Party / Customer / Supplier Architecture

### 8.1 Problem

Today: three independent party models with no cross-reference:

| Model | Domain | Balance |
|-------|--------|---------|
| `Customer` | ERP AR | `balance` on entity |
| `Supplier` | ERP AP | `balance` on entity |
| `Patient` | PMS | `PatientAccount.cachedBalance` |

Future verticals add: Contractor, Employee, Client (accounting firm), etc.

### 8.2 Recommended long-term model

**Universal Party registry** with **role links** — not a single merged table for all behavior.

```
Party (universal identity)
├── id, tenantId, partyType (person | organization)
├── displayName, legalName, taxId, email, phone, address
├── status, createdAt, …
│
├── PartyRole (many per party)
│   ├── roleType: customer | supplier | patient | employee | contractor | client
│   ├── moduleOwner: business | pms | hr | construction
│   ├── domainEntityId → Customer.id | Patient.id | …
│   └── isActive
│
└── (domain entities remain separate)
    Customer extends/links PartyRole
    Patient extends/links PartyRole   ← Patient keeps clinical fields
    Supplier extends/links PartyRole
```

### 8.3 Rules

| Rule | Rationale |
|------|-----------|
| **Patient stays PMS entity** | Clinical/admin fields don't belong on Customer |
| **No forced merge** | Same person can be Patient + Customer via two PartyRoles |
| **Balance stays on subledger** | Party registry is identity; AR/AP/PatientAccount hold balances |
| **Migration is additive** | Introduce `parties` table; link existing rows; don't delete Customer/Supplier/Patient |

### 8.4 Timeline

| Phase | Action |
|-------|--------|
| Now | Keep three models; document intended Party abstraction |
| Phase 3 (CRM) | Introduce Party + link Customer/Supplier |
| Phase 6 (PMS complete) | Optional PartyRole link on Patient (not required for PMS MVP) |

---

## 9. Projects & Cost Centers

### 9.1 Business requirement

Construction and professional services require project-centric costing. **Nothing exists in schema today.**

### 9.2 Universal project model (target)

```
Project
├── tenantId, branchId?, code, name, status
├── projectType (internal enum: construction | professional | internal | …)
├── customerPartyId? (link to Party/Customer)
├── startDate, endDate, contractValue
├── budget (BudgetVersion[])
├── costCenters[] (optional hierarchy)
└── dimensions for posting

BudgetLine
├── projectId, costCenterId?, category, plannedAmount

ProjectCostEntry (subledger)
├── projectId, costCenterId?, sourceModule, sourceType, sourceId
├── amount, direction, entryDate, description
└── (append-only, like PMS ledger)

ProjectRevenueEntry
├── projectId, sourceInvoiceId?, amount, …
```

### 9.3 Universal vs construction-specific

| Universal (Business Core: Projects) | Construction vertical |
|-------------------------------------|----------------------|
| Project, Budget, Cost Center | BOQ (Bill of Quantities) |
| Actual cost entries | Site, WBS hierarchy |
| Revenue recognition | Progress certificates |
| Profitability reports | Retention, variations |
| Dimension on GL posting | Subcontractor modules |
| | Material requisitions per site |

### 9.4 Integration with finance

```
Construction PO received
  → Inventory movement (materials)
  → ProjectCostEntry (materials → project X, cost center Y)
  → FinancialPosting → GL (DR Project WIP / CR AP)
```

PMS pattern (subledger → optional GL) applies analogously.

---

## 10. Document Architecture

### 10.1 Current numbering (keep)

`DocumentNumberService` — atomic, tenant + branch + documentType + fiscalYear:

| documentType | Prefix | Used by |
|--------------|--------|---------|
| INV | INV | Sales |
| PO | PO | Purchasing |
| RCP | RCP | Customer payments |
| JE | JE | Journal entries |
| PAT | PAT | PMS patients |
| ENC, CHG, PMT, REF, ADJ | same | PMS (schema ready) |
| POS | POS | POS |

**Rules (preserve):**
- Tenant-aware always
- Branch-aware where business requires (use default branch when entity has no branch)
- Never use NULL branchId for upsert-dependent sequences
- Caller passes transaction client for atomicity with business writes

### 10.2 Target universal document model (future)

Conceptual wrapper — not a replacement for domain tables:

```
DocumentRegistry
├── tenantId, branchId?, documentType, number
├── sourceModule, sourceEntityType, sourceEntityId
├── status, documentDate, createdById
└── links to attachment(s)
```

Domain tables (SalesInvoice, Charge, etc.) **keep their rows**; registry is cross-module index for search, audit, and attachments.

### 10.3 Document types by layer

| Layer | Examples |
|-------|----------|
| Business Core | Quotation, Sales Invoice, PO, Receipt, Payment, JE |
| PMS | Encounter, Charge, Payment, Refund, Adjustment |
| Construction | Contract, Progress Certificate, Variation Order |
| Accounting Firm | Engagement letter, Workpaper bundle |

---

## 11. Tenant / Branch Architecture

### 11.1 Hierarchy

```
Tenant (organization / company)
 └── Branch (site, clinic, store, office)
      └── Warehouse (inventory location)
      └── Users (optional branch assignment)
      └── Transactions (branchId required on most docs)
```

**Company = Tenant** for SMB scope. Multi-company holdings are out of MVP scope.

### 11.2 Isolation rules

| Scope | Rule |
|-------|------|
| **Tenant** | Hard isolation — all queries filter `tenantId` from JWT |
| **Branch** | Soft partition — reporting filter, not security boundary by default |
| **Cross-branch** | Allowed within tenant unless branch-restricted role (future) |
| **Consolidated reporting** | Aggregate across branches at tenant level |

### 11.3 PMS PatientAccount pattern (approved — platform-compatible)

```
PatientAccount: UNIQUE(tenantId, patientId) — one account per patient per tenant
LedgerEntry.branchId — branch on each transaction
Patient.branchId — registration branch (optional)
```

**This pattern generalizes:**

| Domain | Account scope | Transaction branch |
|--------|---------------|-------------------|
| PMS Patient | Per patient per tenant | On ledger entry |
| AR Customer (future) | Per customer per tenant | On invoice/payment |
| Project (future) | Per project per tenant | On cost entry |

**Do not** create branch-specific patient accounts.

### 11.4 Branch permissions (future)

Extend RBAC with optional `branchIds[]` on User or Role:

```
Permission: finance:reports:read
Scope: branchIds = [HQ, Branch2]  →  filter queries
```

Not required for Phase 2; design for it.

---

## 12. Vertical Module Boundaries

### 12.1 Capability matrix

| Capability | Platform | Business Core | PMS | Retail | Construction | Acct Firm |
|------------|----------|---------------|-----|--------|--------------|-----------|
| Auth/RBAC | ✅ | | | | | |
| Numbering | ✅ | | | | | |
| GL / COA | | ✅ | | | | |
| AR / AP | | ✅ | | | | |
| Products/Inventory | | ✅ | | ✅ | | |
| Sales / POS | | ✅ | | ✅ | | |
| Purchasing | | ✅ | | ✅ | ✅ | |
| Projects | | ✅ | | | ✅ | ✅ |
| Party/CRM | | ✅ | | ✅ | ✅ | ✅ |
| Patients | | | ✅ | | | |
| Patient ledger | | | ✅ | | | |
| Clinic services | | | ✅ | | | |
| BOQ / Site | | | | | ✅ | |
| Client workspaces | | | | | | ✅ |
| Tax workpapers | | | | | | ✅ |

### 12.2 PMS (current + planned)

```
pms/
├── patients/      ✅ Phase 1c
├── ledger/        ✅ Phase 1b
├── services/      Phase 1d
├── encounters/    Phase 1e
├── charges/       Phase 1f
├── payments/      Phase 1g
└── reports/       Phase 1h
```

### 12.3 Retail / Trading (existing ERP maps here)

Frozen ERP modules **are** the retail vertical prototype:

```
retail/ (future namespace)
├── catalog/       ← products, categories, units
├── inventory/     ← warehouses, stock
├── sales/         ← invoices, quotations
├── purchasing/    ← POs
├── pos/           ← shifts, checkout
└── reports/
```

Migration: rename/module-wrap without deleting tables.

### 12.4 Construction (future)

```
construction/
├── boq/
├── sites/
├── progress/
├── variations/
├── retention/
└── subcontractors/
```

Depends on: Projects (Business Core), Purchasing, Inventory, Finance.

### 12.5 Accounting Firm (future)

```
accounting-firm/
├── clients/           (PartyRole: client)
├── engagements/
├── workspaces/
├── bookkeeping/
├── tax/
└── client-billing/
```

Depends on: Finance, Party, Documents, Reporting.

### 12.6 Professional Services (future)

```
professional-services/
├── clients/
├── projects/          (uses Business Core Projects)
├── contracts/
├── timesheets/
└── billing/
```

---

## 13. ERP Migration Strategy

### 13.1 Principles

1. **Never delete** frozen ERP code or tables during migration
2. **Extract patterns**, not bulk renames
3. **Additive schema** — new tables alongside old
4. **Feature flags** — `TenantModule` controls which vertical is active
5. **Dual-run period** — old ERP endpoints remain until new Business Core equivalents exist

### 13.2 Migration map

| Legacy ERP | Disposition | Target |
|------------|-------------|--------|
| `modules/products/` | Freeze → wrap | Business Core `catalog/` |
| `modules/customers/` | Freeze → link Party | Business Core `contacts/` + AR |
| `modules/suppliers/` | Freeze → link Party | Business Core `contacts/` + AP |
| `modules/inventory/` | Freeze → refactor | Business Core `inventory/` |
| `modules/sales/` | Freeze → refactor | Business Core `sales/` + posting rules |
| `modules/purchasing/` | Freeze → refactor | Business Core `purchasing/` |
| `modules/accounting/` | Freeze → **promote** | Universal Finance (already closest to target) |
| `modules/pos/` | Freeze | Retail vertical |
| `modules/sync/` | Deprecate | Remove from LAN MVP path |
| `modules/dashboard/` | Freeze | Per-vertical dashboards |
| `AccountingEngineService` | Evolve | `FinancialPostingService` + rules |
| `DocumentNumberService` | **Keep** | Platform Core |
| `InventoryLedgerService` | **Keep** | Business Core inventory |

### 13.3 Phased migration (safe)

| Step | Action | Risk |
|------||--------|------|
| 1 | Document ownership + posting rules design | Low |
| 2 | Add Party table; link Customer/Supplier optionally | Low |
| 3 | Add posting rules; refactor sales/purchasing to use them | Medium |
| 4 | Add AR/AP subledger tables (parallel to balance caches) | Medium |
| 5 | Add Projects module | Medium |
| 6 | Wrap ERP modules in Business Core namespace | Low |
| 7 | Deprecate direct ERP routes (redirect) | Low |
| 8 | Remove balance caches after subledger parity | High — needs reconciliation |

**Do not execute steps 3–8 until Phase 2 approved.**

---

## 14. NestJS Module Architecture (Target)

Derived from actual repo — evolutionary, not greenfield rewrite.

```
apps/api/src/modules/
│
├── platform/                    (rename/group existing)
│   ├── auth/
│   ├── tenants/
│   ├── branches/
│   ├── users/
│   ├── roles/
│   ├── devices/
│   ├── settings/
│   ├── audit/
│   └── health/
│
├── finance/                     (evolve from accounting + common services)
│   ├── chart-of-accounts/
│   ├── general-ledger/
│   ├── posting/                 (FinancialPostingService — future)
│   ├── treasury/
│   ├── receivables/
│   ├── payables/
│   ├── fiscal-periods/
│   └── tax/                     (future)
│
├── business/                    (evolve from frozen ERP)
│   ├── catalog/                 (products)
│   ├── contacts/                (party + customer + supplier)
│   ├── inventory/
│   ├── sales/
│   ├── purchasing/
│   └── projects/                (new)
│
├── verticals/
│   ├── pms/                     ✅ exists
│   │   ├── patients/
│   │   ├── ledger/
│   │   ├── services/
│   │   ├── encounters/
│   │   ├── charges/
│   │   └── payments/
│   ├── retail/                  (wrap frozen ERP)
│   ├── construction/            (future)
│   ├── accounting-firm/         (future)
│   └── professional-services/   (future)
│
├── common/                      (shared services — keep)
│   ├── document-number.service
│   ├── inventory-ledger.service
│   └── filters, guards, decorators
│
└── legacy/                      (optional alias period)
    └── erp-*/                   (frozen routes, deprecated)
```

**Rules:**
- No `PmsService` god class — already avoided in Phase 1c ✅
- Vertical modules import Business Core + Platform — never each other
- Finance imports nothing from verticals (verticals call finance via posting contract)

---

## 15. Data Ownership Matrix

| Concept | Owner | Table / Module | Notes |
|---------|-------|----------------|-------|
| Tenant | Platform | `tenants` | |
| Branch | Platform | `branches` | |
| User | Platform / Identity | `users` | |
| Role, Permission | Platform / Identity | `roles`, `permissions` | |
| Session | Platform / Identity | `sessions` | |
| Device | Platform | `devices` | |
| Audit Log | Platform | `audit_logs` | |
| Settings | Platform | Tenant/Branch JSON | Evolve to typed |
| Number Sequence | Platform | `number_sequences` | |
| Tenant Module License | Platform | `tenant_modules` | |
| Party (future) | Business / Contacts | `parties` | Not yet exists |
| Customer | Business / Contacts | `customers` | Legacy ERP |
| Supplier | Business / Contacts | `suppliers` | Legacy ERP |
| Product / Item | Business / Catalog | `products` | Legacy ERP |
| Warehouse, Stock | Business / Inventory | `warehouses`, `stock_balances` | |
| Sales Invoice | Business / Sales | `sales_invoices` | |
| Purchase Order | Business / Purchasing | `purchase_orders` | |
| Chart of Accounts | Finance | `accounts` | |
| General Ledger | Finance | `journal_entries` | |
| Fiscal Period | Finance | `fiscal_periods` | |
| AR Subledger (future) | Finance | TBD | Replaces balance cache |
| AP Subledger (future) | Finance | TBD | |
| Project | Business / Projects | TBD | |
| Cost Center | Business / Projects | TBD | |
| Budget | Business / Projects | TBD | |
| **Patient** | **PMS** | `pms_patients` | **Never merge with Customer** |
| Patient Profile | PMS | `pms_patient_profiles` | |
| Patient Notes | PMS | `pms_patient_notes` | |
| **Patient Account** | **PMS** | `pms_patient_accounts` | **Phase 1a invariant** |
| **Patient Ledger** | **PMS** | `pms_ledger_entries` | **Phase 1b invariant** |
| PMS Service | PMS | `pms_services` | Not ERP Product |
| Encounter | PMS | `pms_encounters` | |
| Charge | PMS | `pms_charges` | |
| PMS Payment | PMS | `pms_payments` | Not CustomerPayment |
| BOQ | Construction | TBD | Vertical only |
| Engagement | Accounting Firm | TBD | Vertical only |
| Timesheet | Prof. Services | TBD | Vertical only |
| POS Sale | Retail | `pos_sales` | |
| Sync Queue | Platform (deprecated path) | `sync_queue` | LAN MVP off |

### Ambiguous ownership — resolved

| Ambiguity | Resolution |
|-----------|------------|
| Customer vs Patient | Separate forever; optional Party link |
| ERP Payment vs PMS Payment | Separate tables; both post to Finance differently |
| Service (PMS) vs Product (ERP) | Separate; universal Item abstraction optional in Phase 4+ |
| Revenue account | Finance COA; PMS and Sales both post via rules |
| Employee | HR vertical (future); not Customer |

---

## 16. Integration Contracts

### 16.1 Financial posting contract (conceptual — not implemented)

Vertical modules emit posting requests; Finance module executes.

```typescript
// CONCEPTUAL — do not implement in Phase 1.5

interface FinancialPostingRequest {
  tenantId: string;
  branchId: string;
  sourceModule: 'pms' | 'sales' | 'purchasing' | 'projects' | 'inventory' | 'pos';
  sourceType: string;          // 'charge' | 'sales_invoice' | 'project_cost' | …
  sourceId: string;            // UUID of source document
  postingDate: Date;
  description: string;
  currency: string;
  lines: FinancialPostingLine[];
  dimensions?: PostingDimensions;
  idempotencyKey?: string;
}

interface FinancialPostingLine {
  accountCode: string;         // or accountRole resolved by rule
  debit: Decimal;
  credit: Decimal;
  description?: string;
}

interface PostingDimensions {
  branchId?: string;
  projectId?: string;
  costCenterId?: string;
  department?: string;
}
```

### 16.2 Module integration map

| From | To | Contract | When |
|------|-----|----------|------|
| PMS Charge | PMS Ledger | `LedgerPostInput` | **Now (Phase 1f)** |
| PMS Charge | Finance GL | `FinancialPostingRequest` | Optional later |
| Sales Invoice | Finance GL | `FinancialPostingRequest` | Phase 2 |
| Sales Invoice | Inventory | `InventoryMovementInput` | Exists |
| Purchasing | Inventory + AP | Existing + posting rules | Phase 2 |
| Projects | Finance GL | `FinancialPostingRequest` | Phase 5 |
| Inventory adjustment | Finance GL | `FinancialPostingRequest` | Phase 4 (gap today) |

### 16.3 Event-based alternative (later)

For audit and decoupling:

```
DomainEvent: ChargePosted { tenantId, chargeId, amount, … }
  → Audit listener
  → GL posting listener (if enabled)
  → Project cost listener (if applicable)
```

Not required for LAN MVP modular monolith; design for extractability.

---

## 17. Reporting Architecture

### 17.1 Three reporting layers

```
┌─────────────────────────────────────┐
│     OPERATIONAL REPORTS             │  Domain-specific, real-time
│  Patient statement, stock on hand,  │
│  project budget vs actual, POS daily│
├─────────────────────────────────────┤
│     SUBLEDGER REPORTS               │  Domain ledger reconciliation
│  Patient ledger, AR aging detail,  │
│  project cost breakdown             │
├─────────────────────────────────────┤
│     FINANCIAL REPORTS               │  GL-derived, period-based
│  Trial Balance, P&L, Balance Sheet, │
│  Cash Flow, consolidated by branch  │
└─────────────────────────────────────┘
```

### 17.2 Report ownership

| Report | Layer | Source |
|--------|-------|--------|
| Patient balance / statement | Operational | `pms_ledger_entries` |
| Patient revenue by service | Operational | `pms_charges` + lines |
| AR aging | Subledger → Financial | Customer invoices / future AR ledger |
| AP aging | Subledger → Financial | Supplier POs / future AP ledger |
| Project profitability | Operational | Project cost + revenue entries |
| Trial Balance | Financial | `journal_lines` |
| P&L, Balance Sheet | Financial | GL + COA hierarchy |
| Branch consolidated P&L | Financial | GL filtered by branch dimension |
| Inventory valuation | Operational | `stock_balances` + cost |

### 17.3 PMS reports stay in PMS

Patient-facing reports **never require GL**. GL reports **never require Patient entity**.

---

## 18. Security Architecture

### 18.1 Current model (keep)

- Format: `module:feature:action`
- Global JWT auth + per-route permission checks (AND logic)
- Tenant from JWT — never from request body
- Session revocation on logout (Phase 0)

### 18.2 Target permission namespaces

| Namespace | Examples |
|-----------|----------|
| `core:*` | tenants, branches, users, roles, settings, audit |
| `finance:*` | coa, journals, posting, periods, reports |
| `sales:*` | invoices, quotations, payments |
| `purchasing:*` | orders, receipts |
| `inventory:*` | stock, movements, adjustments |
| `projects:*` | projects, budgets, cost centers |
| `pms:*` | patients, services, charges, ledger (✅ seeded) |
| `construction:*` | boq, sites, progress |
| `retail:*` | pos, shifts |
| `acctfirm:*` | engagements, workpapers |

### 18.3 Tenant + branch + permission interaction

```
Effective access =
  JWT.tenantId match
  AND permission granted
  AND (optional) branch scope match
  AND TenantModule enabled for vertical
```

### 18.4 Financial permissions separation

| Permission | Who |
|------------|-----|
| `pms:ledger:payment` | Front desk — post patient payment |
| `finance:journals:post` | Accountant — GL entries |
| `pms:ledger:adjust:approve` | Supervisor — PMS adjustments |
| `finance:periods:close` | Controller — period close |

---

## 19. Architectural Risks

| Risk | Severity | Description | Mitigation |
|------|----------|-------------|------------|
| **Dual unlinked ledgers** | **Critical** | PMS subledger and ERP GL operate independently; consolidated financials miss clinic revenue | Design `FinancialPostingService`; tenant flag for GL integration |
| **Hardcoded COA codes** | **High** | Sales/POS/Purchasing embed `1000`, `1100`, etc. | Posting rules engine in Phase 2 |
| **POS partial GL** | **High** | Non-cash POS payments skip GL | Fix during retail vertical refactor |
| **Balance cache drift** | **High** | Customer/Supplier/Patient cached balances can desync | Subledger as source of truth + reconcile (PMS pattern ✅) |
| **Duplicate party entities** | **High** | Customer, Supplier, Patient unlinked | Party abstraction Phase 3 |
| **No projects/cost centers** | **High** | Blocks construction vertical | Phase 5 Projects module |
| **NULL branchId numbering** | **Medium** | PostgreSQL NULL unique breaks sequence upsert | Always use concrete branch (documented Phase 1c) |
| **ERP/PMS semantic collision** | **Medium** | Payment, Service, Account mean different things | Namespace prefixes (`pms_*` tables ✅) |
| **Circular module deps** | **Medium** | Vertical imports vertical | Enforce: vertical → business → platform only |
| **TenantModule not enforced** | **Medium** | All modules accessible if permitted | Guard on vertical routes |
| **Inventory without GL** | **Medium** | Stock adjustments don't post | Posting rules for adjustments |
| **Schema scaling** | **Medium** | Single DB, growing table count | Table prefixes per domain; indexing discipline |
| **Reporting duplication** | **Medium** | Same metric from subledger vs GL | Define layer ownership (§17) |
| **SQLite sync drift** | **Low** (LAN MVP) | Local schema diverges from server | Deprecate for MVP |
| **Audit incomplete** | **Low** | Not all mutations audited | Expand audit writes incrementally |
| **Authorization branch scope** | **Low** | No branch-restricted roles yet | Design now, implement Phase 3+ |

---

## 20. Recommended Roadmap

Adjusted from PMS-only sequence to **platform-first with parallel vertical completion**.

```
Phase 0   ✅ Stabilization (auth, concurrency, tests, LAN mode)
Phase 1a  ✅ PMS schema
Phase 1b  ✅ PMS financial core (patient subledger)
Phase 1c  ✅ PMS patients API
Phase 1.5 ✅ Platform architecture (this document)

─── APPROVAL GATE ───

Phase 2   Universal Finance Foundation
          ├── Posting rules (replace hardcoded COA)
          ├── FinancialPostingService (GL only)
          ├── Fiscal period enforcement
          ├── AR/AP subledger design + migration plan
          └── Refactor sales/purchasing to posting rules (behind flag)

Phase 3   Contacts & CRM Core
          ├── Party model + Customer/Supplier links
          └── Shared contact search/API

Phase 4   Inventory & Catalog Consolidation
          ├── Business Core catalog/inventory modules
          ├── Inventory adjustment → GL posting
          └── Wrap frozen ERP catalog/inventory

Phase 5   Projects & Cost Centers
          ├── Universal Project, Budget, CostCenter
          ├── Project cost subledger
          └── Basic profitability reports

Phase 6   Complete PMS Vertical (resume 1d–1h)
          ├── Services, Encounters, Charges, Payments
          ├── PMS UI (desktop)
          ├── PMS operational reports
          └── Optional PMS → GL posting (tenant setting)

Phase 7   Retail Vertical Packaging
          ├── Wrap ERP sales/purchasing/POS as retail module
          ├── Fix POS GL gaps
          └── Retail UI refresh

Phase 8   Construction Vertical
          ├── BOQ, sites, progress, retention
          └── Depends on Phase 5 Projects

Phase 9   Accounting Firm Vertical
          ├── Client workspaces, engagements
          └── Depends on Phase 2 Finance + Phase 3 Party

Phase 10  Professional Services
          ├── Timesheets, billing
          └── Depends on Phase 5 Projects

Phase 11  Platform Polish
          ├── Attachments, workflows, notifications
          ├── Branch-scoped permissions
          ├── Consolidated reporting
          └── Packaging / installer
```

### Dependency graph

```
Phase 1.5 (this doc)
    ↓
Phase 2 (Finance) ──────────────────────────┐
    ↓                                         ↓
Phase 3 (Party)                          Phase 6 (PMS complete)
    ↓                                         ↓
Phase 4 (Inventory)                      Phase 7 (Retail)
    ↓
Phase 5 (Projects)
    ↓
Phase 8 (Construction)    Phase 9 (Acct Firm)    Phase 10 (Prof Services)
```

**PMS can resume (Phase 6 / old 1d+) in parallel with Phase 2** if GL integration is deferred — subledger work is independent.

---

## 21. Explicit Decisions

| # | Decision | Status |
|---|----------|--------|
| D1 | Fratelanza is a **Business Platform**, not a PMS-only product | **Approved direction** |
| D2 | PMS is a **vertical module** with `pms_*` namespace | **Approved Phase 1a** |
| D3 | Patient subledger (Phase 1b) is **immutable** | **Approved** |
| D4 | Patient CRUD (Phase 1c) is **immutable** | **Approved** |
| D5 | ERP modules are **frozen**, not deleted | **Approved** |
| D6 | LAN MVP — single PostgreSQL, sync disabled | **Approved Phase 0** |
| D7 | Modular monolith (not microservices) | **Recommended** |
| D8 | Subledger → optional GL posting pattern | **Recommended** |
| D9 | Patient ≠ Customer — no merge | **Recommended** |
| D10 | Party registry with role links (long-term) | **Recommended** |
| D11 | DocumentNumberService stays platform-wide | **Recommended** |
| D12 | One account per (tenant, party) — branch on transactions | **Approved (PMS)** |
| D13 | Projects/Cost Centers in Business Core | **Recommended** |
| D14 | Complete PMS before Construction | **Recommended** (or parallel if GL deferred) |
| D15 | No schema/code changes in Phase 1.5 | **This phase** |

---

## 22. Open Questions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| Q1 | Resume PMS (1d+) before or after Universal Finance? | A) PMS first B) Finance first C) Parallel | **C Parallel** — PMS subledger doesn't need GL |
| Q2 | When to introduce Party model? | Before/after PMS complete | **After PMS MVP (Phase 3)** |
| Q3 | Single COA per tenant or per branch? | Shared / per-branch | **Shared COA per tenant**; branch as dimension |
| Q4 | Multi-currency in MVP? | Yes / No | **No** — design fields (PMS has currency); implement later |
| Q5 | Rename repo/package from "ERP" branding? | Rebrand / keep | **Defer** — docs use "Business Platform" |
| Q6 | Enforce TenantModule licensing now? | Yes / No | **Before first vertical UI launch** |
| Q7 | PMS GL auto-posting default? | On / Off / Tenant setting | **Off by default** — tenant setting when built |
| Q8 | Consolidate SQLite local schema? | Remove / keep | **Keep but deprioritize** for LAN MVP |

---

## 23. Final Decision Register

| Decision | Recommendation | Reason | Impact | Urgency |
|----------|----------------|--------|--------|---------|
| Platform vs PMS center | **Platform center, PMS vertical** | Product vision requires multi-industry | All future module placement | **Before any new module** |
| Keep Phase 1a–1c unchanged | **Yes — immutable** | Approved, tested, correct subledger pattern | Avoid rework | **Immediate** |
| Freeze legacy ERP | **Yes — extract don't delete** | Safe migration | Retail vertical reuses code | **Immediate** |
| Subledger + GL pattern | **Adopt platform-wide** | PMS Phase 1b is the reference | Finance Phase 2 design | **Before Phase 2** |
| Don't merge Patient/Customer | **Yes — separate entities** | Domain purity | PMS clinical fields isolated | **Before Phase 3** |
| Party registry | **Add in Phase 3** | Unifies CRM without merging domains | New table + links | Medium |
| Posting rules engine | **Phase 2 priority** | Removes hardcoded COA risk | Refactor sales/purchasing/POS | **High** |
| Projects module | **Phase 5 before Construction** | Construction depends on it | New Business Core module | Medium |
| Resume PMS 1d+ | **Allowed after 1.5 approval** | Independent of GL | Continue vertical | **Next if PMS prioritized** |
| Universal Finance before Construction | **Yes** | Construction needs cost posting | Sequencing | Medium |
| DocumentNumberService | **Keep as platform service** | Proven atomic, used everywhere | No change | Low |
| NULL branchId sequences | **Never use** | PostgreSQL upsert bug | Numbering policy | **Immediate** |
| TenantModule enforcement | **Add guard before vertical UI** | Licensing / deployment tiers | Route guards | Medium |
| SQLite offline | **Deprecate for LAN MVP** | Architecture audit finding | Desktop simplification | Low |
| POS GL fix | **Defer to Retail Phase 7** | Frozen module | Financial accuracy | Medium |
| PMS → GL integration | **Optional tenant setting** | Clinics may want separate books initially | Phase 6 add-on | Low |

---

## Appendix A — Current vs Target Diagram

```
TODAY                              TARGET
─────                              ──────

┌─────────────┐                    ┌─────────────┐
│ Platform    │                    │ Platform    │
│ Auth/RBAC   │                    │ Core (++)   │
│ Tenants     │                    └──────┬──────┘
└──────┬──────┘                           │
       │                    ┌─────────────┴─────────────┐
┌──────┴──────┐             │                           │
│ ERP (frozen)│             ▼                           ▼
│ Sales ──► GL│      ┌─────────────┐            ┌─────────────┐
│ Purch ──► GL│      │ Business    │            │  Verticals  │
│ POS ──► GL  │      │ Core        │            │ PMS ✅      │
└─────────────┘      │ Finance GL  │            │ Retail      │
                     │ Sales/AP/AR │            │ Construct.  │
┌─────────────┐      │ Projects    │            │ Acct Firm   │
│ PMS (active)│      └──────┬──────┘            └──────┬──────┘
│ Patients ✅ │             │                          │
│ Ledger ✅   │             │    FinancialPosting      │
│ (no charges)│             ◄──────────────────────────┘
└─────────────┘             │
       │                    ▼
       │              General Ledger
       ▼
 pms_ledger_entries      (consolidated financial truth)
 (patient truth)
       │
       ✗ no link yet
       │
       ▼
   (ERP journal_entries — separate)
```

---

## Appendix B — Immutable Phase 1 Decisions (Reference)

### Phase 1a
- PMS tables additive; `pms_*` namespace
- Tenant isolation; branch-aware transactions
- `Decimal(18,4)`; `UNIQUE(tenantId, patientId)` on PatientAccount

### Phase 1b
- Append-only ledger; debit↑ credit↓
- `cachedBalance` atomic with ledger entry
- `FOR UPDATE` account lock; caller-owned transaction; no nested transaction

### Phase 1c
- Patient is PMS-specific; auto PatientAccount creation
- PAT numbering; archive over delete when history exists
- Server-side search/pagination; tenant isolation

**These must not change for architectural elegance.**

---

**STOP — Phase 1.5 complete. No implementation. Await approval before Phase 2 or Phase 1d.**
