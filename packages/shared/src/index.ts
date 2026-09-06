export const APP_NAME = 'Fratelanza Grand ERP';
export const APP_VERSION = '0.1.0';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const SYNC_BATCH_SIZE = 100;
export const SYNC_RETRY_MAX = 5;
export const SYNC_BACKOFF_BASE_MS = 1000;

export const CORE_MODULE_ID = 'core';

export const PERMISSION_SEPARATOR = ':';

export function buildPermissionKey(
  module: string,
  feature: string,
  action: string,
): string {
  return `${module}${PERMISSION_SEPARATOR}${feature}${PERMISSION_SEPARATOR}${action}`;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
