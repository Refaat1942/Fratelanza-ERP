# Fratelanza Product Demo Checklist

**Audience:** Sales, presales, trainers, business stakeholders — **no command-line required**  
**Date:** 2026-09-08  
**Environment:** Local evaluation install with demo database seeded

---

## Before You Start

### One-time setup (IT / developer prepares this)

Someone with access to the project folder must run **`scripts\Setup-Eval-Database.cmd`** once to create and seed the evaluation database. After that, demos use only the desktop app.

### Start the application

1. Run **`1-Start-API.cmd`** (or your usual API launcher) and wait until the API is listening.
2. Run **`2-Open-ERP.cmd`** to open the Fratelanza desktop app.

### Demo credentials

See **`docs/DEMO_CREDENTIALS.md`**.

| Item | Value |
|------|-------|
| **Primary demo tenant** | Nile Trading Company \| شركة النيل للتجارة |
| **Username** | `admin` |
| **Password** | `Eval@2026!Demo` |
| **Tenant code** | `TRADING_DEMO` |

Other demo businesses: **CONSTRUCTION_DEMO** (`constr-admin`) and **SERVICES_DEMO** (`serv-admin`) — same password.

---

## Demo Flow Checklist

Check each box as you complete it. Expected results describe what a successful demo looks like.

### 1. Login

- [ ] Open the app — login screen shows **Fratelanza** branding (no license activation screen)
- [ ] Enter username **`admin`** and password **`Eval@2026!Demo`**
- [ ] Login succeeds — you land on the **Dashboard**
- [ ] Top area shows company name **Nile Trading Company** (or Arabic equivalent)
- [ ] No error about license, entitlement, or installation ID

**If login fails:** Ask IT to confirm the API is running and evaluation database was seeded.

---

### 2. Dashboard

- [ ] Six summary cards visible: sales today, sales month, receivables, payables, inventory value, low stock
- [ ] Numbers look like real business amounts (not UUIDs or zeros everywhere)
- [ ] Explain: *"This is the owner’s morning view — cash in, cash out, stock value."*

---

### 3. Customers

- [ ] Open **Customers** from the sidebar
- [ ] Table shows seeded customers (e.g. trading company clients with codes and balances)
- [ ] Click **Create** — form asks for code, name, phone, email
- [ ] Create a test customer (e.g. code `DEMO-01`, name `Demo Customer`)
- [ ] New row appears in the list

---

### 4. Suppliers

- [ ] Open **Suppliers**
- [ ] Seeded suppliers visible
- [ ] Create one supplier or point out existing seeded records
- [ ] Explain: *"Suppliers are who we buy from; customers are who we sell to."*

---

### 5. Products

- [ ] Open **Products**
- [ ] Seeded products visible (e.g. oil, rice, paste with SKUs and prices)
- [ ] Create a product or review existing — note SKU and sale price
- [ ] Explain unit of measure is assigned automatically from system defaults

---

### 6. Purchasing (buy stock)

- [ ] Open **Purchasing**
- [ ] Show existing purchase order if seeded, or create new:
  - Select **supplier**
  - Select **warehouse**
  - Add line: product + quantity + price
- [ ] Save — PO appears as **draft** or open status
- [ ] Click **Receive** on the PO
- [ ] Status updates to received

---

### 7. Inventory

- [ ] Open **Inventory**
- [ ] Stock balances reflect received goods
- [ ] Optional: run **Adjust stock** with a small quantity change and note
- [ ] Explain: *"Every sale and purchase moves stock here."*

---

### 8. Sales (sell to customer)

- [ ] Open **Sales**
- [ ] Create invoice: pick **customer**, **warehouse**, add product lines
- [ ] Save — invoice appears as **draft**
- [ ] Click **Post** on the draft invoice
- [ ] Status becomes posted; stock decreases (verify in Inventory if time allows)

---

### 9. Accounting

- [ ] Open **Accounting**
- [ ] Trial balance table loads (may be empty until chart is seeded)
- [ ] If empty, click **Seed chart of accounts** (admin action)
- [ ] Explain: *"Posting sales and purchases flows into these accounts."*
- [ ] Note: full journal entry UI is API-only today — trial balance is the desktop view

---

### 10. Projects (optional — trading tenant)

- [ ] Open **Projects**
- [ ] Show project list or create a simple project (name + description)
- [ ] Open **Cost Centers** — show department-style buckets
- [ ] Explain: *"Used to track job profitability — essential for construction and services."*

---

### 11. Construction (switch tenant recommended)

For a credible construction story, **log out** and log in as **`constr-admin`** on **CONSTRUCTION_DEMO**.

- [ ] Open **Construction → Contracts**
- [ ] Show seeded contract(s) or create: project + party + title + direction
- [ ] Click **Manage BOQ** link on a contract (note: BOQ is not in sidebar — use the table link)
- [ ] Open **Construction → Progress**
- [ ] Show progress list or explain the workflow: contract → BOQ → progress period → submit

**Be honest with the audience:** Billing, variations, retention, material issue, and costing screens are **API-only** — not in desktop nav yet.

---

### 12. Reports

- [ ] **Dashboard** — recap KPI cards after transactions
- [ ] **Accounting** — trial balance totals
- [ ] **Inventory** — on-hand quantities as a stock report
- [ ] Construction profitability reports: explain they exist in API / future UI — do not pretend a screen exists

---

## Role-Based Demo (optional)

Log in as different TRADING_DEMO users to show RBAC:

| Username | Role | What to show |
|----------|------|--------------|
| `admin` | Owner | Full access |
| `manager` | Manager | Operations without user admin |
| `accountant` | Accountant | Accounting, read-only sales/purchasing |
| `sales` | Sales | Sales, customers, read stock |

Password for all: **`Eval@2026!Demo`**

---

## Settings & Language

- [ ] Open **Settings**
- [ ] Switch **Language** between Arabic and English — layout direction changes
- [ ] Confirm **no license section** appears
- [ ] Server URL field only needed when API is on another PC on the LAN

---

## What NOT to Demo (avoid confusion)

| Do not show | Why |
|-------------|-----|
| PMS / Patients | Clinic module — API only, not core ERP story |
| License activation | Removed in product reset |
| Raw database IDs | Not business-friendly |
| Construction screens that don't exist in sidebar | Billing, variations, retention — API only |

---

## Troubleshooting (non-developer)

| Problem | What to try |
|---------|-------------|
| "Cannot reach API" on login | Confirm **`1-Start-API.cmd`** is running |
| Empty tables everywhere | IT must re-run **`scripts\Setup-Eval-Database.cmd`** |
| "Permission denied" in Arabic | Log in as **`admin`** or a role with access |
| Blank page flash | Refresh; if persists, restart desktop app |
| Wrong company data | Confirm you used the intended username (`admin` vs `constr-admin`) |

---

## Demo Script (15-minute version)

1. **Login** as admin → Dashboard (2 min)
2. **Customers + Products** — master data (3 min)
3. **Purchase → Receive → Inventory** — stock in (4 min)
4. **Sales → Post** — stock out + receivable (3 min)
5. **Accounting** trial balance (2 min)
6. **Construction** — switch tenant, show contract + BOQ link (1 min)

---

*This checklist satisfies Step 21 of the Fratelanza Product Reset brief.*
