export type ModuleCategory =
  | 'core'
  | 'business'
  | 'finance'
  | 'operations'
  | 'industry'
  | 'admin';

export interface ErpModuleDefinition {
  id: string;
  icon: string;
  nameKey: string;
  descriptionKey: string;
  route: string;
  category: ModuleCategory;
  /** Any of these permission prefixes grants module visibility */
  permissionPrefixes: string[];
  featureFlag?: string;
  demoSlugs?: string[];
  sortOrder: number;
}

export const ERP_MODULES: ErpModuleDefinition[] = [
  {
    id: 'dashboard',
    icon: '📊',
    nameKey: 'modules.dashboard.name',
    descriptionKey: 'modules.dashboard.description',
    route: '/dashboard',
    category: 'core',
    permissionPrefixes: ['core:dashboard:read'],
    sortOrder: 1,
  },
  {
    id: 'sales',
    icon: '🛒',
    nameKey: 'modules.sales.name',
    descriptionKey: 'modules.sales.description',
    route: '/sales',
    category: 'business',
    permissionPrefixes: ['sales:', 'customers:customers:read'],
    sortOrder: 10,
  },
  {
    id: 'purchasing',
    icon: '🧾',
    nameKey: 'modules.purchasing.name',
    descriptionKey: 'modules.purchasing.description',
    route: '/purchasing',
    category: 'business',
    permissionPrefixes: ['purchasing:', 'suppliers:suppliers:read'],
    sortOrder: 11,
  },
  {
    id: 'inventory',
    icon: '📦',
    nameKey: 'modules.inventory.name',
    descriptionKey: 'modules.inventory.description',
    route: '/inventory',
    category: 'business',
    permissionPrefixes: ['inventory:', 'products:products:read', 'warehouses:warehouses:read'],
    sortOrder: 12,
  },
  {
    id: 'customers',
    icon: '👥',
    nameKey: 'modules.customers.name',
    descriptionKey: 'modules.customers.description',
    route: '/customers',
    category: 'business',
    permissionPrefixes: ['customers:'],
    sortOrder: 13,
  },
  {
    id: 'suppliers',
    icon: '🏭',
    nameKey: 'modules.suppliers.name',
    descriptionKey: 'modules.suppliers.description',
    route: '/suppliers',
    category: 'business',
    permissionPrefixes: ['suppliers:'],
    sortOrder: 14,
  },
  {
    id: 'products',
    icon: '🏷️',
    nameKey: 'modules.products.name',
    descriptionKey: 'modules.products.description',
    route: '/products',
    category: 'business',
    permissionPrefixes: ['products:'],
    sortOrder: 15,
  },
  {
    id: 'pos',
    icon: '💳',
    nameKey: 'modules.pos.name',
    descriptionKey: 'modules.pos.description',
    route: '/pos',
    category: 'business',
    permissionPrefixes: ['pos:'],
    sortOrder: 16,
  },
  {
    id: 'accounting',
    icon: '💰',
    nameKey: 'modules.accounting.name',
    descriptionKey: 'modules.accounting.description',
    route: '/accounting',
    category: 'finance',
    permissionPrefixes: ['finance:', 'accounting:'],
    sortOrder: 20,
  },
  {
    id: 'currency',
    icon: '💱',
    nameKey: 'modules.currency.name',
    descriptionKey: 'modules.currency.description',
    route: '/currency',
    category: 'finance',
    permissionPrefixes: ['currency:'],
    sortOrder: 21,
  },
  {
    id: 'bank',
    icon: '🏦',
    nameKey: 'modules.bank.name',
    descriptionKey: 'modules.bank.description',
    route: '/bank',
    category: 'finance',
    permissionPrefixes: ['bank:'],
    sortOrder: 22,
  },
  {
    id: 'assets',
    icon: '🏢',
    nameKey: 'modules.assets.name',
    descriptionKey: 'modules.assets.description',
    route: '/assets',
    category: 'finance',
    permissionPrefixes: ['assets:'],
    sortOrder: 23,
  },
  {
    id: 'crm',
    icon: '🎯',
    nameKey: 'modules.crm.name',
    descriptionKey: 'modules.crm.description',
    route: '/crm',
    category: 'business',
    permissionPrefixes: ['crm:'],
    sortOrder: 17,
  },
  {
    id: 'hr',
    icon: '👔',
    nameKey: 'modules.hr.name',
    descriptionKey: 'modules.hr.description',
    route: '/hr',
    category: 'operations',
    permissionPrefixes: ['hr:'],
    sortOrder: 25,
  },
  {
    id: 'approvals',
    icon: '✅',
    nameKey: 'modules.approvals.name',
    descriptionKey: 'modules.approvals.description',
    route: '/approvals',
    category: 'operations',
    permissionPrefixes: ['approvals:'],
    sortOrder: 26,
  },
  {
    id: 'projects',
    icon: '📁',
    nameKey: 'modules.projects.name',
    descriptionKey: 'modules.projects.description',
    route: '/projects',
    category: 'operations',
    permissionPrefixes: ['projects:'],
    featureFlag: 'projects.enabled',
    sortOrder: 30,
  },
  {
    id: 'construction',
    icon: '🏗️',
    nameKey: 'modules.construction.name',
    descriptionKey: 'modules.construction.description',
    route: '/construction/contracts',
    category: 'industry',
    permissionPrefixes: ['construction:'],
    featureFlag: 'construction.enabled',
    sortOrder: 31,
  },
  {
    id: 'restaurant',
    icon: '🍽️',
    nameKey: 'modules.restaurant.name',
    descriptionKey: 'modules.restaurant.description',
    route: '/pos',
    category: 'industry',
    permissionPrefixes: ['pos:', 'restaurant:'],
    featureFlag: 'restaurant.enabled',
    sortOrder: 32,
  },
  {
    id: 'reports',
    icon: '📈',
    nameKey: 'modules.reports.name',
    descriptionKey: 'modules.reports.description',
    route: '/dashboard',
    category: 'finance',
    permissionPrefixes: ['core:dashboard:read', 'finance:', 'construction:reports:read'],
    sortOrder: 40,
  },
  {
    id: 'settings',
    icon: '⚙️',
    nameKey: 'modules.settings.name',
    descriptionKey: 'modules.settings.description',
    route: '/settings',
    category: 'admin',
    permissionPrefixes: ['core:settings:read'],
    sortOrder: 90,
  },
  {
    id: 'administration',
    icon: '🛡️',
    nameKey: 'modules.administration.name',
    descriptionKey: 'modules.administration.description',
    route: '/users',
    category: 'admin',
    permissionPrefixes: ['core:users:read', 'core:roles:read'],
    sortOrder: 91,
  },
];

export function userCanAccessModule(
  permissions: string[],
  module: ErpModuleDefinition,
  enabledModules?: string[],
  featureFlags?: Record<string, boolean>,
): boolean {
  if (enabledModules && enabledModules.length > 0 && !enabledModules.includes(module.id)) {
    return false;
  }
  if (module.featureFlag && featureFlags && featureFlags[module.featureFlag] === false) {
    return false;
  }
  return module.permissionPrefixes.some((prefix) =>
    permissions.some((p) => p.startsWith(prefix) || p === prefix.replace(/:$/, '')),
  );
}
