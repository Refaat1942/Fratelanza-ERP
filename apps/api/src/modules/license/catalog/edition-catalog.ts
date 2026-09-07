export type LicenseEditionKey = 'starter' | 'professional' | 'business' | 'enterprise';

export interface EditionDefinition {
  key: LicenseEditionKey;
  displayName: string;
  description: string;
  defaultModules: string[];
  limits: {
    maxUsers: number;
    maxBranches: number;
    maxDevices: number;
    maxStorageMb?: number;
  };
}

export const EDITION_CATALOG: Record<LicenseEditionKey, EditionDefinition> = {
  starter: {
    key: 'starter',
    displayName: 'Starter',
    description: 'Core platform with essential ERP modules',
    defaultModules: [
      'core',
      'products',
      'customers',
      'suppliers',
      'sales',
      'purchasing',
      'inventory',
      'warehouses',
    ],
    limits: { maxUsers: 5, maxBranches: 1, maxDevices: 3 },
  },
  professional: {
    key: 'professional',
    displayName: 'Professional',
    description: 'Starter plus finance and party',
    defaultModules: [
      'core',
      'finance',
      'party',
      'products',
      'customers',
      'suppliers',
      'sales',
      'purchasing',
      'inventory',
      'warehouses',
      'accounting',
    ],
    limits: { maxUsers: 15, maxBranches: 3, maxDevices: 5 },
  },
  business: {
    key: 'business',
    displayName: 'Business',
    description: 'Full ERP with POS and sync',
    defaultModules: [
      'core',
      'finance',
      'party',
      'products',
      'customers',
      'suppliers',
      'sales',
      'purchasing',
      'inventory',
      'warehouses',
      'accounting',
      'pos',
      'sync',
    ],
    limits: { maxUsers: 25, maxBranches: 5, maxDevices: 10 },
  },
  enterprise: {
    key: 'enterprise',
    displayName: 'Enterprise',
    description: 'Business plus vertical modules',
    defaultModules: [
      'core',
      'finance',
      'party',
      'products',
      'customers',
      'suppliers',
      'sales',
      'purchasing',
      'inventory',
      'warehouses',
      'accounting',
      'pos',
      'sync',
      'pms',
    ],
    limits: { maxUsers: 100, maxBranches: 20, maxDevices: 50, maxStorageMb: 102400 },
  },
};

export function getEditionDefinition(edition: LicenseEditionKey): EditionDefinition {
  return EDITION_CATALOG[edition];
}
