export const PERMISSION_ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'approve',
  'post',
  'cancel',
  'print',
  'export',
] as const;

export type PermissionActionName = (typeof PERMISSION_ACTIONS)[number];

export interface PermissionModuleDefinition {
  id: string;
  label: string;
  features: Array<{
    id: string;
    label: string;
    actions: PermissionActionName[];
  }>;
}

/** Canonical permission catalog for authorization matrix UI */
export const PERMISSION_CATALOG: PermissionModuleDefinition[] = [
  {
    id: 'sales',
    label: 'Sales',
    features: [
      {
        id: 'invoices',
        label: 'Invoices',
        actions: ['view', 'create', 'edit', 'delete', 'approve', 'post', 'cancel', 'print', 'export'],
      },
      {
        id: 'payments',
        label: 'Payments',
        actions: ['view', 'create', 'edit', 'delete', 'approve', 'post', 'cancel', 'print', 'export'],
      },
    ],
  },
  {
    id: 'purchasing',
    label: 'Purchasing',
    features: [
      {
        id: 'orders',
        label: 'Purchase Orders',
        actions: ['view', 'create', 'edit', 'delete', 'approve', 'post', 'cancel', 'print', 'export'],
      },
      {
        id: 'receipts',
        label: 'Goods Receipts',
        actions: ['view', 'create', 'edit', 'delete', 'approve', 'post', 'cancel', 'print', 'export'],
      },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    features: [
      {
        id: 'stock',
        label: 'Stock',
        actions: ['view', 'create', 'edit', 'delete', 'approve', 'post', 'cancel', 'print', 'export'],
      },
      {
        id: 'movements',
        label: 'Movements',
        actions: ['view', 'create', 'edit', 'delete', 'approve', 'post', 'cancel', 'print', 'export'],
      },
    ],
  },
  {
    id: 'accounting',
    label: 'Accounting',
    features: [
      {
        id: 'accounts',
        label: 'Accounts',
        actions: ['view', 'create', 'edit', 'delete', 'approve', 'post', 'cancel', 'print', 'export'],
      },
      {
        id: 'journals',
        label: 'Journals',
        actions: ['view', 'create', 'edit', 'delete', 'approve', 'post', 'cancel', 'print', 'export'],
      },
      {
        id: 'reports',
        label: 'Reports',
        actions: ['view', 'export', 'print'],
      },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    features: [
      {
        id: 'customers',
        label: 'Customers',
        actions: ['view', 'create', 'edit', 'delete', 'print', 'export'],
      },
    ],
  },
  {
    id: 'suppliers',
    label: 'Suppliers',
    features: [
      {
        id: 'suppliers',
        label: 'Suppliers',
        actions: ['view', 'create', 'edit', 'delete', 'print', 'export'],
      },
    ],
  },
  {
    id: 'core',
    label: 'Administration',
    features: [
      {
        id: 'users',
        label: 'Users',
        actions: ['view', 'create', 'edit', 'delete'],
      },
      {
        id: 'roles',
        label: 'Roles',
        actions: ['view', 'create', 'edit', 'delete'],
      },
      {
        id: 'settings',
        label: 'Settings',
        actions: ['view', 'edit'],
      },
      {
        id: 'integrations',
        label: 'Government Integrations',
        actions: ['view', 'edit'],
      },
      {
        id: 'tax',
        label: 'Tax Configuration',
        actions: ['view', 'edit'],
      },
      {
        id: 'audit',
        label: 'Audit Logs',
        actions: ['view', 'export'],
      },
    ],
  },
];

export function catalogPermissionKey(
  moduleId: string,
  featureId: string,
  action: PermissionActionName,
): string {
  const actionMap: Record<PermissionActionName, string> = {
    view: 'read',
    create: 'create',
    edit: 'update',
    delete: 'delete',
    approve: 'approve',
    post: 'post',
    cancel: 'cancel',
    print: 'print',
    export: 'export',
  };
  return `${moduleId}:${featureId}:${actionMap[action] ?? action}`;
}

export function matrixActionGranted(
  permissions: string[],
  moduleId: string,
  featureId: string,
  action: PermissionActionName,
): boolean {
  return permissions.includes(catalogPermissionKey(moduleId, featureId, action));
}
