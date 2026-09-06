import type { ModuleDefinition, PermissionDefinition } from '@fratelanza/types';
import { CORE_MODULE_ID } from '@fratelanza/shared';

export const CORE_MODULE: ModuleDefinition = {
  id: CORE_MODULE_ID,
  name: 'Core Platform',
  description: 'Tenants, users, roles, branches, devices, and settings',
  version: '0.1.0',
  dependencies: [],
};

export const CORE_PERMISSIONS: PermissionDefinition[] = [
  { module: 'core', feature: 'dashboard', action: 'read' as never },
  { module: 'core', feature: 'tenants', action: 'read' as never },
  { module: 'core', feature: 'tenants', action: 'create' as never },
  { module: 'core', feature: 'tenants', action: 'update' as never },
  { module: 'core', feature: 'branches', action: 'read' as never },
  { module: 'core', feature: 'branches', action: 'create' as never },
  { module: 'core', feature: 'branches', action: 'update' as never },
  { module: 'core', feature: 'users', action: 'read' as never },
  { module: 'core', feature: 'users', action: 'create' as never },
  { module: 'core', feature: 'users', action: 'update' as never },
  { module: 'core', feature: 'users', action: 'delete' as never },
  { module: 'core', feature: 'roles', action: 'read' as never },
  { module: 'core', feature: 'roles', action: 'create' as never },
  { module: 'core', feature: 'roles', action: 'update' as never },
  { module: 'core', feature: 'devices', action: 'read' as never },
  { module: 'core', feature: 'devices', action: 'update' as never },
  { module: 'core', feature: 'settings', action: 'read' as never },
  { module: 'core', feature: 'settings', action: 'update' as never },
  { module: 'core', feature: 'audit', action: 'read' as never },
];

export * from './events/event-types';
