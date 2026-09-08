# Fratelanza Evaluation Demo Credentials

**Local evaluation only.** Do not use these passwords in production.

## Default password (all demo users)

`Eval@2026!Demo`

Override during seed with environment variable `DEMO_SEED_PASSWORD`.

---

## Demo businesses (database: `fratelanza_eval`)

### 1. Trading — Nile Trading Company | شركة النيل للتجارة

| Username | Role |
|----------|------|
| `admin` | System Admin (Owner) |
| `manager` | Business Manager |
| `accountant` | Accountant |
| `sales` | Sales User |

**Tenant code:** `TRADING_DEMO`

### 2. Construction — Ahram Construction | شركة الأهرام للمقاولات

| Username | Role |
|----------|------|
| `constr-admin` | System Admin (Owner) |

**Tenant code:** `CONSTRUCTION_DEMO`

### 3. Professional Services — Hilal Professional Services | مكتب الهلال للخدمات المهنية

| Username | Role |
|----------|------|
| `serv-admin` | System Admin (Owner) |

**Tenant code:** `SERVICES_DEMO`

---

## Setup

1. Run `scripts\Setup-Eval-Database.cmd`
2. Run `Start-Fratelanza.cmd`
3. Log in with username `admin` and password above

**Note:** Login is case-insensitive. Usernames are stored internally as `username@fratelanza.local` but you only type the username part.
