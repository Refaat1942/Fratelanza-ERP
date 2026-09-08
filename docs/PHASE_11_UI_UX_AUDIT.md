# Phase 11 — Desktop UI/UX Audit

**Date:** 2026-09-08  
**Scope:** `apps/desktop` (Electron + React 19)  
**Purpose:** Baseline audit before global enterprise UI/UX overhaul. No backend changes.

---

## 1. Technology Stack

| Layer | Technology | Location |
|-------|------------|----------|
| Shell | Electron 34 | `apps/desktop/electron/` |
| UI | React 19 + TypeScript | `apps/desktop/src/` |
| Routing | react-router-dom v7 | `App.tsx` |
| State | Zustand (persist) | `stores/index.ts` |
| i18n | i18next via `@fratelanza/localization` | `packages/localization/` |
| Styling | Single global CSS + CSS variables | `styles/global.css` |
| Build | Vite 6 + vite-plugin-electron | `vite.config.ts` |
| Offline | SQLite + IPC | `electron/local-*.ts` |

**No shared UI package** (`packages/ui` does not exist). All UI lives in desktop app.

---

## 2. Application Structure

```
apps/desktop/
├── electron/          Main, preload, sync, local DB
├── src/
│   ├── main.tsx       i18n + theme bootstrap
│   ├── App.tsx        Routes + guards
│   ├── components/    9 files (layout, table, auth)
│   ├── pages/         22 page components
│   ├── hooks/         useAutoSync (unused)
│   ├── lib/           api, auth-session, offline-api
│   ├── stores/        auth, app prefs, entitlements
│   └── styles/        global.css only
└── index.html
```

---

## 3. Route Inventory (Implemented)

| Path | Page | License guard | Notes |
|------|------|---------------|-------|
| `/login` | LoginPage | Public | Pre-filled dev credentials |
| `/` | DashboardPage | Auth | Stat cards |
| `/parties` | PartiesPage | party | Online only |
| `/products` | ProductsPage | products | Offline capable |
| `/customers` | CustomersPage | customers | Offline + legacy overlap |
| `/suppliers` | SuppliersPage | suppliers | Offline + legacy overlap |
| `/warehouses` | WarehousesPage | warehouses | |
| `/inventory` | InventoryPage | inventory + stock feature | |
| `/sales` | SalesPage | sales | Line items editor |
| `/purchasing` | PurchasingPage | purchasing | |
| `/projects` | ProjectsPage | projects.projects | |
| `/cost-centers` | CostCentersPage | projects.cost-centers | |
| `/construction/contracts` | ConstructionContractsPage | construction.contracts | |
| `/construction/boq/:id` | ConstructionBoqPage | construction.boq | **Not in sidebar** |
| `/construction/progress` | ConstructionProgressPage | construction.progress | Minimal UI |
| `/accounting` | AccountingPage | accounting | Trial balance only |
| `/pos` | PosPage | pos | Custom grid |
| `/users` | UsersPage | Auth only | |
| `/branches` | BranchesPage | Auth only | |
| `/settings` | SettingsPage | Auth only | License display |

**Missing routes (API exists, no desktop UI):** PMS, Finance GL/posting, Construction billing/costing/reporting/materials/variations/retention, Roles, Devices, Audit, Sync conflicts.

---

## 4. Layout & Navigation Audit

### Current shell (`AppLayout.tsx`)

- Fixed 260px sidebar (dark), flat nav list (18+ items, no grouping)
- Topbar: connection badge + user initials + logout only
- **No:** breadcrumbs, page title in shell, branch switcher, global search, notifications, collapsible sidebar, module icons
- Nav filtered by `useEntitlementStore` (mirrors `LicensedRoute`)
- `NAV_MODULE_MAP` duplicates route guard config — manual sync risk

### Guard behavior issues

| Guard | Issue |
|-------|-------|
| `LicensedRoute` | Redirects to `/settings` when unlicensed — confusing |
| `LicensedRoute` | Loading returns `null` — blank flash |
| `ProtectedRoute` | Returns `null` when no token — blank flash |
| Permissions | Almost unused in UI; only license read on Settings |

---

## 5. Component Inventory

### Existing (`src/components/`)

| Component | File | Quality |
|-----------|------|---------|
| AppLayout | AppLayout.tsx | Functional, not enterprise |
| AuthGate | AuthGate.tsx | Boot + guards |
| ConnectionStatusBadge | ConnectionStatusBadge.tsx | OK |
| SyncStatusBadge | SyncStatusBadge.tsx | **Unused** |
| DataTable | DataTable.tsx | Basic; inline styles; LTR hardcoded |
| PageHeader | DataTable.tsx | Minimal |
| Modal | DataTable.tsx | No focus trap |
| FormField | DataTable.tsx | Basic |
| PageState | PageState.tsx | Loading/empty/error |
| LineItemsEditor | LineItemsEditor.tsx | Sales/purchasing |

### Missing (required for enterprise UX)

- Button system (variants/sizes/loading)
- Input, Select, Textarea, Checkbox, Switch
- StatusBadge (semantic, centralized)
- ConfirmDialog, Toast/notification system
- Breadcrumbs, Tabs, Drawer
- Pagination, sortable columns, table toolbar
- Currency/date/number formatters (shared)
- ListPage / FormPage / DetailPage templates
- Unlicensed module empty state
- Permission-aware action hiding

---

## 6. Styling Audit

**Single file:** `global.css` (~560 lines)

### Existing tokens (partial)

- Colors: bg, surface, primary, success, warning, danger, sidebar
- Radius: `--radius`, `--radius-lg`
- Shadows: sm, md
- Fonts: `--font-family`, `--font-family-ar`

### Missing tokens

- Spacing scale (4/8/12/16/24/32)
- Typography scale (display, h1–h4, body, caption)
- Z-index scale
- Motion/transition tokens
- Semantic info color
- Focus ring tokens
- Component-specific tokens (table row height, input height)

### CSS class inconsistencies

| Class used in JSX | Defined in CSS? |
|-------------------|-----------------|
| `.input` | **No** — Parties, Projects, Construction |
| `.toolbar` | **No** |
| `.table-actions` | **No** |
| `.btn-link` | **No** |
| `.btn-secondary` | **No** |
| `.form-input`, `.select-input` | Yes — older pages |
| `.btn`, `.btn-primary`, `.btn-ghost` | Yes |

### Inline styles

Heavy use in `DataTable.tsx`, badges, modals, several pages — prevents theme consistency.

### Dark mode

Partial: `[data-theme='dark']` overrides exist but hardcoded hex in login gradient, sync badge, some pages.

---

## 7. Page Pattern Audit

### Dominant pattern (15+ pages)

```
PageHeader + toolbar (inconsistent) + DataTable + Modal + FormField
```

Local `useState` for forms, errors, `refreshKey` for reload.

### Deviations

| Page | Pattern | Issue |
|------|---------|-------|
| LoginPage | Standalone gradient card | Different visual language |
| PosPage | Custom grid | Intentionally different but unstyled tokens |
| ConstructionBoqPage | Card + `<ul>` lists | Not DataTable; missing CSS classes |
| ConstructionProgressPage | Forms + raw lists | Immature vs contracts |
| DashboardPage | Stat cards | Hardcoded EGP |
| SettingsPage | Form rows | Mixed i18n (hardcoded license labels) |

---

## 8. Localization & RTL Audit

### Supported

- English + Arabic via `@fratelanza/localization`
- `dir` and `lang` on `<html>` via `applyLocaleToDocument`
- Arabic font family switch on `html[dir='rtl'] body`

### RTL gaps

- Sidebar remains left in RTL (should flip or use logical properties)
- Table headers `textAlign: 'left'` hardcoded
- Flex layouts without `gap` logical direction
- Modal close button position
- Breadcrumb separators (when added)
- No mirrored icons for directional affordances

### Copy issues

- Connection settings say **"clinic server"** (PMS legacy) in EN/AR
- Settings license section partially hardcoded English
- Inventory column `'SKU'` hardcoded
- Construction status strings raw in lists

---

## 9. Accessibility Audit

| Area | Status |
|------|--------|
| Form labels | Partial — FormField exists but placeholders overused |
| Focus visible | Minimal custom focus styles |
| Modal focus trap | **Missing** |
| ARIA on dialogs | **Missing** |
| Keyboard nav sidebar | Basic (NavLink) |
| Color-only status | Some status uses color only |
| Screen reader labels | Minimal |

---

## 10. Duplicate & Legacy Patterns

1. **Party vs Customers/Suppliers** — three parallel master-data UIs; sales supports both via flags
2. **UI primitives in DataTable.tsx** — should be separate modules
3. **API client** — `useApiClient()` vs inline `createApiClient()` in POS/Dashboard
4. **Error display** — modal-only vs page-level vs inline `<p>`
5. **Unused code** — `SyncStatusBadge`, `useAutoSync`
6. **Type duplication** — `DesktopApi` in preload + vite-env.d.ts

---

## 11. Backend Features Without Desktop UI

| Module | API status | Desktop gap |
|--------|------------|-------------|
| Construction reporting | Phase 9.9 complete | No routes/pages |
| Construction billing | Phase 9.8 complete | No UI |
| Construction costing | Phase 9.7 complete | No UI |
| Construction materials | Phase 9.6 complete | No UI |
| PMS patients | API exists | No UI |
| Finance posting | API exists | Trial balance only |
| Roles/permissions admin | API exists | No UI |
| License admin | Partial in Settings | Not full admin UX |

**Rule for Phase 11:** Do not invent UI for unfinished APIs. Improve existing screens only; document gaps.

---

## 12. Enterprise UX Gap Summary

| Capability | Current | Target |
|------------|---------|--------|
| Design system | Ad-hoc CSS classes | Centralized tokens + primitives |
| App shell | Flat sidebar list | Grouped nav, breadcrumbs, context |
| Tables | Basic fetch-all | Sticky header, alignment, badges, actions |
| Forms | Per-page modals | Sectioned grids, validation states |
| States | PageState only | Skeleton, empty, error, unlicensed |
| Feedback | Inline errors | Toasts + confirm dialogs |
| RTL | dir only | Full layout mirroring |
| Permissions | Stored, unused | Hide/disable unauthorized actions |
| Formatting | Ad-hoc | Shared currency/date/number |
| Packaging | No electron-builder | Out of Phase 11 scope unless trivial |

---

## 13. Migration Order (Approved)

1. Design tokens (`design-system/tokens.css`)
2. UI primitives (`components/ui/`)
3. Layout system (`components/layout/`)
4. Feedback (`components/feedback/`)
5. Data patterns (`components/data/`)
6. App shell redesign
7. Page templates
8. Core/admin pages
9. Business modules (Party → Sales → Purchasing → Inventory → Finance → Projects)
10. Verticals (Construction → PMS when routed)
11. RTL/LTR pass
12. Localization pass
13. Visual QA + regression

---

## 14. Risks

- Large diff touching all pages — regression risk mitigated by keeping API calls unchanged
- RTL refactor may break layouts — test both locales
- Construction pages use undefined CSS — fix as part of migration
- LicensedRoute redirect UX must change to in-place unlicensed state
- No frontend unit tests today — rely on typecheck + manual regression

---

## 15. Audit Conclusion

The desktop app is a **functional MVP** with consistent routing and license gating but **no enterprise design system**. Visual quality varies by module (Construction BOQ/Progress lag behind Sales/Parties). Styling is fragmented (missing CSS classes, inline styles, duplicate patterns). RTL is incomplete. Permission-aware UI is absent.

**Proceed with Phase 11 implementation** per migration order above. Do not change backend business logic.

---

*Audit complete. Implementation authorized.*
