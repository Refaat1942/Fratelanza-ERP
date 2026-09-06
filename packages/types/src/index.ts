export enum SyncStatus {
  PENDING = 'pending',
  SYNCED = 'synced',
  CONFLICT = 'conflict',
  ERROR = 'error',
}

export enum ConnectivityStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  SYNCING = 'syncing',
  SYNC_ERROR = 'sync_error',
}

export enum PermissionAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  APPROVE = 'approve',
  POST = 'post',
  VOID = 'void',
  EXPORT = 'export',
  PRINT = 'print',
}

export interface SyncableEntityMeta {
  id: string;
  tenantId: string;
  branchId?: string | null;
  deviceId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  syncStatus: SyncStatus;
  version: number;
  lastSyncedAt?: Date | null;
}

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  branchId?: string;
  sessionId: string;
  type: 'access' | 'refresh';
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface PaginatedQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export type Locale = 'en' | 'ar';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  tenantId: string;
  branchId?: string;
  appVersion: string;
  os: string;
  lastSeen?: Date;
  status: 'active' | 'inactive' | 'revoked';
}

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  dependencies: string[];
}

export interface PermissionDefinition {
  module: string;
  feature: string;
  action: PermissionAction;
}

export interface MenuItemDefinition {
  id: string;
  moduleId: string;
  labelKey: string;
  path: string;
  icon?: string;
  permission?: string;
  order: number;
}

export interface TenantSettings {
  defaultLocale: Locale;
  defaultCurrency: string;
  timezone: string;
  fiscalYearStart: number;
}
