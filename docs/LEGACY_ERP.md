# Legacy ERP Modules (Frozen)

These modules belong to the **original ERP prototype** and are **frozen for the PMS MVP**.

## Policy

- **Do not delete** this code during Phase 0–1.
- **Do not expand** these modules unless required to keep the platform buildable.
- **Do not rename** ERP entities into PMS concepts (e.g. Customer → Patient).
- New clinic/PMS features must be implemented as **new modules** with proper domain models.

## Frozen API modules

| Module | Path | Status |
|--------|------|--------|
| Products | `apps/api/src/modules/products/` | Frozen |
| Customers | `apps/api/src/modules/customers/` | Frozen |
| Suppliers | `apps/api/src/modules/suppliers/` | Frozen |
| Warehouses | `apps/api/src/modules/warehouses/` | Frozen |
| Inventory | `apps/api/src/modules/inventory/` | Frozen |
| Sales | `apps/api/src/modules/sales/` | Frozen |
| Purchasing | `apps/api/src/modules/purchasing/` | Frozen |
| Accounting (ERP) | `apps/api/src/modules/accounting/` | Frozen |
| POS | `apps/api/src/modules/pos/` | Frozen |
| Dashboard (ERP KPIs) | `apps/api/src/modules/dashboard/` | Frozen |
| Sync | `apps/api/src/modules/sync/` | Disabled by default (`SYNC_ENABLED=false`) |

## Frozen desktop pages

`ProductsPage`, `CustomersPage`, `SuppliersPage`, `WarehousesPage`, `InventoryPage`, `SalesPage`, `PurchasingPage`, `AccountingPage`, `PosPage`

These remain reachable for reference/testing but are **not part of the PMS product roadmap**.
