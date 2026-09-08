# Fratelanza Desktop — Field Definition Audit

**Date:** 2026-09-08  
**Scope:** Major desktop screens in `apps/desktop`  
**Purpose:** Document what each field means, whether it is required, and how it should be classified for business users.

## Classification Legend

| Classification | Meaning |
|----------------|---------|
| **REQUIRED** | Must be filled to save; blocks the workflow if empty |
| **OPTIONAL** | Improves records but can be left blank |
| **ADVANCED** | Useful for power users or specific industries; often hidden until needed |
| **SYSTEM-GENERATED** | Assigned by the system; not entered by the user on create |
| **READ-ONLY** | Shown for reference; not editable in the current form |

## Audit Summary

Most screens follow a simple pattern: a list table plus a create/edit modal. Several gaps remain:

- Missing business fields (tax ID, address, category, dates, payment method)
- Technical concepts exposed (Party routing mode, finance pilot dimensions)
- Inconsistent labels (`SKU` in English only; `costPrice` collected in code but not always shown)
- System fields (codes, numbers, balances, status) shown without explanation

This audit documents **current behavior**, not the ideal end state from Step 8.

---

## 1. Dashboard (`/`)

Read-only summary cards. No user input fields.

| Field / Metric | Classification | Required | Business Meaning |
|----------------|----------------|----------|------------------|
| Sales Today | READ-ONLY | — | Total posted sales value for the current calendar day |
| Sales This Month | READ-ONLY | — | Cumulative posted sales in the current month |
| Receivables | READ-ONLY | — | Outstanding customer balances (money owed to the company) |
| Payables | READ-ONLY | — | Outstanding supplier balances (money the company owes) |
| Inventory Value | READ-ONLY | — | Estimated stock value from on-hand quantities |
| Low Stock Count | READ-ONLY | — | Number of products below configured reorder levels |

**Notes:** Welcome line shows user first name and tenant (company) name. Values default to zero if the API is unreachable — no empty-state guidance yet.

---

## 2. Parties (`/parties`)

Universal contact master used across sales, purchasing, and construction.

### List columns

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Code | SYSTEM-GENERATED | — | Internal reference code; auto-assigned on create |
| Display Name | READ-ONLY (list) | — | Name shown on documents and dropdowns |
| Type | READ-ONLY (list) | — | Individual person vs organization |
| Roles | READ-ONLY | — | Whether the party acts as customer, supplier, or both |

### Create form

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Type | REQUIRED | Yes | Organization (company) or individual (person) |
| Display Name | REQUIRED | Yes | Primary name used everywhere in the app |
| Legal Name | OPTIONAL | No | Official registered name for contracts and tax |
| Email | OPTIONAL | No | Contact email |
| Phone | OPTIONAL | No | Contact phone |

### Edit form (additional)

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Linked Customer | READ-ONLY | — | Legacy customer record linked to this party (if any) |
| Linked Supplier | READ-ONLY | — | Legacy supplier record linked to this party (if any) |

**Actions (not fields):** Assign Customer role, Assign Supplier role, Archive.

**Gap:** No address, tax ID, or notes. Search box filters client-side only after load.

---

## 3. Customers (`/customers`)

Legacy customer master; still used when Party routing is disabled.

### List columns

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Code | SYSTEM-GENERATED | — | Customer reference code |
| Name | READ-ONLY (list) | — | Customer display name |
| Phone | READ-ONLY (list) | — | Primary phone |
| Balance | READ-ONLY | — | Running account balance (receivable) |

### Create form

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Code | REQUIRED | Yes | Short unique identifier (e.g. `CUST-001`) |
| Name | REQUIRED | Yes | Customer name on invoices |
| Phone | OPTIONAL | No | Contact number |
| Email | OPTIONAL | No | Contact email |

### Edit form

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Name | REQUIRED | Yes | Updated customer name |
| Phone | OPTIONAL | No | Updated phone |
| Email | OPTIONAL | No | Updated email |

**Gap:** Code cannot be edited after create (correct). No credit limit, address, or tax registration.

---

## 4. Products (`/products`)

### List columns

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| SKU | READ-ONLY (list) | — | Stock keeping unit — product code |
| Name | READ-ONLY (list) | — | Product description |
| Sale Price | READ-ONLY (list) | — | Default selling price |
| Barcode | READ-ONLY (list) | — | Scannable barcode (optional) |

### Create form

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| SKU | REQUIRED | Yes | Unique product code for inventory and documents |
| Name | REQUIRED | Yes | Product name on invoices and stock reports |
| Barcode | OPTIONAL | No | For POS / barcode scanning |
| Sale Price | OPTIONAL | No | Default unit price on sales lines |
| Unit of Measure | REQUIRED (hidden) | Yes | Auto-selected first unit from server; blocks save if none exist |

**Gap:** `costPrice` exists in payload logic but is **not shown** in the create modal. Category not selectable in UI. No tax or opening stock fields.

### Edit form

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Name | REQUIRED | Yes | Updated product name |
| Barcode | OPTIONAL | No | Updated barcode |
| Sale Price | REQUIRED (UI) | Yes | Updated selling price |

---

## 5. Sales (`/sales`)

### List columns

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Invoice Number | SYSTEM-GENERATED | — | Document number assigned on create |
| Customer | READ-ONLY | — | Buyer name |
| Status | READ-ONLY | — | Draft vs posted (affects stock and accounting) |
| Total | READ-ONLY | — | Invoice total amount |

### Create invoice form

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Buyer Mode | ADVANCED | No | Choose legacy Customer vs Party (only if Party routing enabled in settings) |
| Customer / Party | REQUIRED | Yes | Who is buying |
| Warehouse | OPTIONAL | No | Stock source; defaults to first warehouse |
| Line: Product | REQUIRED | Yes | Item sold |
| Line: Description | OPTIONAL | No | Override line text |
| Line: Quantity | REQUIRED | Yes | Units sold |
| Line: Unit Price | REQUIRED | Yes | Price per unit |

### Post invoice (toolbar — finance pilot)

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Project | ADVANCED | No | Finance dimension when universal finance pilot is on |
| Cost Center | ADVANCED | No | Cost allocation dimension when pilot is on |

**Gap:** No invoice date, discount, tax, payment method, or notes in UI. Posting is a separate action from draft list.

---

## 6. Purchasing (`/purchasing`)

### List columns

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| PO Number | SYSTEM-GENERATED | — | Purchase order reference |
| Supplier | READ-ONLY | — | Vendor name |
| Status | READ-ONLY | — | Open, partially received, or fully received |
| Total | READ-ONLY | — | Order total |

### Create purchase order form

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Supplier Mode | ADVANCED | No | Legacy Supplier vs Party (if routing enabled) |
| Supplier / Party | REQUIRED | Yes | Who you are buying from |
| Warehouse | REQUIRED | Yes | Where goods will be received |
| Line items | REQUIRED | Yes | Same structure as sales (product, qty, price) |

**Gap:** No expected delivery date, payment terms, or notes.

---

## 7. Inventory (`/inventory`)

### List columns

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Product Name | READ-ONLY | — | Item description |
| SKU | READ-ONLY | — | Product code |
| Warehouse | READ-ONLY | — | Storage location |
| Quantity | READ-ONLY | — | On-hand stock |

### Adjust stock form

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Warehouse | REQUIRED | Yes | Location to adjust |
| Product | REQUIRED | Yes | Item to adjust |
| Quantity | REQUIRED | Yes | Positive or negative change (+10 adds, −5 removes) |
| Notes | OPTIONAL | No | Reason for adjustment (audit trail) |

**Gap:** No dedicated transfer between warehouses or movement history view in desktop UI.

---

## 8. Projects (`/projects`)

### List columns

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Code | SYSTEM-GENERATED | — | Project reference |
| Name | READ-ONLY (list) | — | Project title |
| Status | READ-ONLY | — | Active, completed, archived, etc. |

### Create form

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Name | REQUIRED | Yes | Project title |
| Description | OPTIONAL | No | Short summary |

**Gap:** No customer, manager, dates, budget, or cost center on create — all exist in API/design but not in this form.

---

## 9. Construction Contracts (`/construction/contracts`)

### List columns

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Contract Number | SYSTEM-GENERATED | — | Unique contract reference |
| Title | READ-ONLY (list) | — | Contract description |
| Direction | READ-ONLY | — | Customer contract (revenue) vs subcontractor (cost) |
| Status | READ-ONLY | — | Lifecycle state (draft, active, etc.) |
| BOQ link | READ-ONLY | — | Navigation to bill of quantities |

### Create form

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Project | REQUIRED | Yes | Which job site / project this contract belongs to |
| Party | REQUIRED | Yes | Customer or subcontractor (from Parties) |
| Contract Title | REQUIRED | Yes | Human-readable contract name |
| Direction | REQUIRED | Yes (default: customer) | Revenue-side or cost-side contract |

**Hidden defaults:** Pricing model fixed to `lump_sum` in code — not shown to user.

**Gap:** No contract value, dates, retention %, or advance terms in desktop form. BOQ page exists at `/construction/boq/:id` but is **not in sidebar**.

---

## 10. Settings (`/settings`)

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Server URL | REQUIRED (for LAN) | Yes | API address (e.g. `http://192.168.1.10:3000`) |
| Language | OPTIONAL | No | Arabic or English UI |
| Theme | OPTIONAL | No | Light, dark, or system |
| Company Name | READ-ONLY | — | Current tenant name from login session |
| Branch | READ-ONLY | — | User's assigned branch |

**Removed in reset:** License activation, module entitlements, installation ID.

---

## 11. Users (`/users`)

### List columns

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Username | READ-ONLY | — | Login name (stored as email internally) |
| Name | READ-ONLY | — | First + last name |
| Role | READ-ONLY | — | Permission profile |
| Branch | READ-ONLY | — | Default branch for transactions |
| Status | READ-ONLY | — | Active or inactive |

### Create / edit form

| Field | Classification | Required | Business Meaning |
|-------|----------------|----------|------------------|
| Username | REQUIRED | Yes | Login identifier |
| Password | REQUIRED (create) | Yes on create | Minimum 8 characters; optional on edit |
| First Name | REQUIRED | Yes | Given name |
| Last Name | REQUIRED | Yes | Family name |
| Role | REQUIRED | Yes | Determines permissions (RBAC) |
| Branch | OPTIONAL | No | Default operating branch |
| Phone | OPTIONAL | No | Contact number |

**Gap:** No Roles management screen in desktop (API exists). No email field separate from username.

---

## Cross-Screen Recommendations (Steps 8+)

1. Hide **ADVANCED** fields (Party routing mode, finance pilot dimensions) behind an "Advanced" section or admin settings.
2. Never show raw UUIDs in labels; use codes and names only.
3. Add help text for **SYSTEM-GENERATED** fields: "Assigned automatically when you save."
4. Align Customer and Party workflows — document which path the demo tenant uses.
5. Extend Product and Customer forms with the business fields listed in the product reset brief (tax, address, category, opening stock).

---

*This audit satisfies Step 7 of the Fratelanza Product Reset brief. Implementation of form UX improvements is tracked in Steps 8–14.*
