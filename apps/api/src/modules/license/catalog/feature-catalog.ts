export interface FeatureCatalogEntry {
  key: string;
  moduleKey: string;
  displayName: string;
  description: string;
}

export const FEATURE_CATALOG: Record<string, FeatureCatalogEntry> = {
  'finance.general-ledger': {
    key: 'finance.general-ledger',
    moduleKey: 'finance',
    displayName: 'General Ledger',
    description: 'Chart of accounts and GL accounts',
  },
  'finance.fiscal-periods': {
    key: 'finance.fiscal-periods',
    moduleKey: 'finance',
    displayName: 'Fiscal Periods',
    description: 'Fiscal period open/close/lock',
  },
  'finance.financial-posting': {
    key: 'finance.financial-posting',
    moduleKey: 'finance',
    displayName: 'Financial Posting',
    description: 'Universal financial posting engine',
  },
  'sales.invoices': {
    key: 'sales.invoices',
    moduleKey: 'sales',
    displayName: 'Sales Invoices',
    description: 'Create and post sales invoices',
  },
  'sales.quotations': {
    key: 'sales.quotations',
    moduleKey: 'sales',
    displayName: 'Quotations',
    description: 'Sales quotations',
  },
  'purchasing.orders': {
    key: 'purchasing.orders',
    moduleKey: 'purchasing',
    displayName: 'Purchase Orders',
    description: 'Create and receive purchase orders',
  },
  'inventory.stock': {
    key: 'inventory.stock',
    moduleKey: 'inventory',
    displayName: 'Stock Management',
    description: 'Stock balances, movements, and adjustments',
  },
  'projects.projects': {
    key: 'projects.projects',
    moduleKey: 'projects',
    displayName: 'Projects',
    description: 'Universal project master data and lifecycle',
  },
  'projects.cost-centers': {
    key: 'projects.cost-centers',
    moduleKey: 'projects',
    displayName: 'Cost Centers',
    description: 'Cost center master data and hierarchy',
  },
  'construction.foundation': {
    key: 'construction.foundation',
    moduleKey: 'construction',
    displayName: 'Construction Foundation',
    description: 'Construction project profiles and cost subledger',
  },
  'construction.contracts': {
    key: 'construction.contracts',
    moduleKey: 'construction',
    displayName: 'Construction Contracts',
    description: 'Customer and subcontractor construction contracts',
  },
  'construction.boq': {
    key: 'construction.boq',
    moduleKey: 'construction',
    displayName: 'Bill of Quantities',
    description: 'BOQ headers, sections, items, and revisions',
  },
  'construction.progress': {
    key: 'construction.progress',
    moduleKey: 'construction',
    displayName: 'Construction Progress',
    description: 'Measured work progress against approved BOQ revisions',
  },
  'construction.variations': {
    key: 'construction.variations',
    moduleKey: 'construction',
    displayName: 'Construction Variations',
    description: 'Approved change orders against BOQ revisions without mutating history',
  },
  'construction.retention': {
    key: 'construction.retention',
    moduleKey: 'construction',
    displayName: 'Retention & Advances',
    description: 'Operational retention holds/releases and advance mobilization tracking',
  },
  'construction.subcontractors': {
    key: 'construction.subcontractors',
    moduleKey: 'construction',
    displayName: 'Construction Subcontractors',
    description: 'Subcontractor profiles, project assignments, and contract linkage via Party roles',
  },
  'construction.materials': {
    key: 'construction.materials',
    moduleKey: 'construction',
    displayName: 'Construction Materials',
    description: 'Material issues from warehouse to construction projects with inventory and cost subledger integration',
  },
  'construction.costing': {
    key: 'construction.costing',
    moduleKey: 'construction',
    displayName: 'Construction Costing',
    description: 'Project, contract, and cost-center costing with planned vs actual profitability reporting',
  },
  'construction.billing': {
    key: 'construction.billing',
    moduleKey: 'construction',
    displayName: 'Construction Billing',
    description: 'Progress-based client billing via Universal Sales and FinancialPostingService',
  },
  'pms.patients': {
    key: 'pms.patients',
    moduleKey: 'pms',
    displayName: 'Patients',
    description: 'Patient registration and profiles',
  },
  'pms.ledger': {
    key: 'pms.ledger',
    moduleKey: 'pms',
    displayName: 'Clinical Ledger',
    description: 'Patient account ledger',
  },
};

export function getFeatureEntry(featureKey: string): FeatureCatalogEntry {
  const entry = FEATURE_CATALOG[featureKey];
  if (!entry) {
    throw new Error(`Unknown feature key: ${featureKey}`);
  }
  return entry;
}

export function featuresForModules(moduleKeys: string[]): string[] {
  return Object.values(FEATURE_CATALOG)
    .filter((f) => moduleKeys.includes(f.moduleKey))
    .map((f) => f.key);
}

export const DEMO_ENABLED_FEATURES = featuresForModules([
  'finance',
  'sales',
  'purchasing',
  'inventory',
  'projects',
  'pms',
]);
