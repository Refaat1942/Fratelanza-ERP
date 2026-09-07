export type ModuleTier = 'core' | 'business' | 'vertical' | 'future';

export interface ModuleCatalogEntry {
  key: string;
  displayName: string;
  description: string;
  tier: ModuleTier;
  available: boolean;
  dependencies: string[];
}

export const MODULE_CATALOG: Record<string, ModuleCatalogEntry> = {
  core: {
    key: 'core',
    displayName: 'Core Platform',
    description: 'Tenant administration, users, roles, branches, settings, audit, licensing',
    tier: 'core',
    available: true,
    dependencies: [],
  },
  finance: {
    key: 'finance',
    displayName: 'Universal Finance',
    description: 'Chart of accounts, fiscal periods, financial posting',
    tier: 'business',
    available: true,
    dependencies: ['core'],
  },
  party: {
    key: 'party',
    displayName: 'Universal Party',
    description: 'Party master data, roles, contacts',
    tier: 'business',
    available: true,
    dependencies: ['core'],
  },
  products: {
    key: 'products',
    displayName: 'Products',
    description: 'Product catalog, categories, units',
    tier: 'business',
    available: true,
    dependencies: ['core'],
  },
  customers: {
    key: 'customers',
    displayName: 'Customers (Legacy)',
    description: 'Legacy ERP customer master',
    tier: 'business',
    available: true,
    dependencies: ['core'],
  },
  suppliers: {
    key: 'suppliers',
    displayName: 'Suppliers (Legacy)',
    description: 'Legacy ERP supplier master',
    tier: 'business',
    available: true,
    dependencies: ['core'],
  },
  warehouses: {
    key: 'warehouses',
    displayName: 'Warehouses',
    description: 'Warehouse locations',
    tier: 'business',
    available: true,
    dependencies: ['core'],
  },
  inventory: {
    key: 'inventory',
    displayName: 'Inventory',
    description: 'Stock movements and balances',
    tier: 'business',
    available: true,
    dependencies: ['core'],
  },
  sales: {
    key: 'sales',
    displayName: 'Sales',
    description: 'Sales invoices and payments',
    tier: 'business',
    available: true,
    dependencies: ['core'],
  },
  purchasing: {
    key: 'purchasing',
    displayName: 'Purchasing',
    description: 'Purchase orders and receiving',
    tier: 'business',
    available: true,
    dependencies: ['core'],
  },
  accounting: {
    key: 'accounting',
    displayName: 'Accounting (Legacy)',
    description: 'Legacy chart of accounts and journals',
    tier: 'business',
    available: true,
    dependencies: ['core', 'finance'],
  },
  pos: {
    key: 'pos',
    displayName: 'Point of Sale',
    description: 'POS shifts and sales',
    tier: 'business',
    available: true,
    dependencies: ['core', 'sales'],
  },
  sync: {
    key: 'sync',
    displayName: 'Sync',
    description: 'Offline sync (requires deployment flag)',
    tier: 'business',
    available: true,
    dependencies: ['core'],
  },
  pms: {
    key: 'pms',
    displayName: 'Practice Management',
    description: 'Patients, encounters, clinical ledger',
    tier: 'vertical',
    available: true,
    dependencies: ['core'],
  },
  projects: {
    key: 'projects',
    displayName: 'Projects',
    description: 'Universal projects and cost centers',
    tier: 'business',
    available: true,
    dependencies: ['core'],
  },
  construction: {
    key: 'construction',
    displayName: 'Construction',
    description: 'Construction vertical',
    tier: 'vertical',
    available: true,
    dependencies: ['core', 'projects', 'finance', 'party'],
  },
  crm: {
    key: 'crm',
    displayName: 'CRM',
    description: 'Customer relationship management',
    tier: 'business',
    available: false,
    dependencies: ['core', 'party'],
  },
  retail: {
    key: 'retail',
    displayName: 'Retail',
    description: 'Retail vertical',
    tier: 'vertical',
    available: false,
    dependencies: ['core'],
  },
  manufacturing: {
    key: 'manufacturing',
    displayName: 'Manufacturing',
    description: 'Manufacturing vertical',
    tier: 'vertical',
    available: false,
    dependencies: ['core'],
  },
  accounting_firm: {
    key: 'accounting_firm',
    displayName: 'Accounting Firm',
    description: 'Accounting firm vertical',
    tier: 'vertical',
    available: false,
    dependencies: ['core', 'finance'],
  },
};

export const ALL_MODULE_KEYS = Object.keys(MODULE_CATALOG);

export function getModuleEntry(moduleKey: string): ModuleCatalogEntry {
  const entry = MODULE_CATALOG[moduleKey];
  if (!entry) {
    throw new Error(`Unknown module key: ${moduleKey}`);
  }
  return entry;
}

export function validateModuleDependencies(enabledModules: Set<string>): string[] {
  const errors: string[] = [];
  for (const moduleKey of enabledModules) {
    const entry = MODULE_CATALOG[moduleKey];
    if (!entry) {
      errors.push(`Unknown module: ${moduleKey}`);
      continue;
    }
    for (const dep of entry.dependencies) {
      if (!enabledModules.has(dep)) {
        errors.push(
          `Module "${moduleKey}" requires "${dep}" but it is not enabled`,
        );
      }
    }
  }
  return errors;
}

/** Modules enabled for demo / full regression tenant */
export const DEMO_ENABLED_MODULES = [
  'core',
  'finance',
  'party',
  'products',
  'customers',
  'suppliers',
  'warehouses',
  'inventory',
  'sales',
  'purchasing',
  'accounting',
  'pos',
  'sync',
  'pms',
  'projects',
];
