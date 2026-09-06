import { ConnectivityStatus } from '@fratelanza/types';
import type { ApiClient } from './api';

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch');
}

export function isOfflineMode(connectivity: ConnectivityStatus): boolean {
  return connectivity === ConnectivityStatus.OFFLINE;
}

export async function mutateWithOffline<T>(options: {
  connectivity: ConnectivityStatus;
  online: () => Promise<T>;
  offline: () => Promise<T>;
}): Promise<T> {
  if (!isOfflineMode(options.connectivity)) {
    try {
      return await options.online();
    } catch (err) {
      if (window.desktopApi && isNetworkError(err)) {
        return options.offline();
      }
      throw err;
    }
  }

  if (!window.desktopApi) {
    throw new Error('Offline mode requires the desktop application');
  }

  return options.offline();
}

export async function fetchListWithOffline<T>(options: {
  connectivity: ConnectivityStatus;
  online: (client: ApiClient) => Promise<T[]>;
  offline: () => Promise<T[]>;
  client: ApiClient;
}): Promise<T[]> {
  if (isOfflineMode(options.connectivity) && window.desktopApi) {
    return options.offline();
  }

  try {
    return await options.online(options.client);
  } catch (err) {
    if (window.desktopApi && isNetworkError(err)) {
      return options.offline();
    }
    throw err;
  }
}
