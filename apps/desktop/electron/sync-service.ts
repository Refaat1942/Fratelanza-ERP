import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { getOrCreateDeviceId } from './device-store';
import {
  initLocalDatabase,
  getLocalDatabasePath,
  getLocalDb,
  isLocalDbReady,
} from './local-db';
import { applyPullChanges, getLocalProductCount } from './local-sync';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function registerSyncHandlers(getAccessToken: () => string | null) {
  ipcMain.handle('sync:initLocalDb', async () => {
    try {
      await initLocalDatabase();
      return { success: true, path: getLocalDatabasePath() };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Local DB init failed',
      };
    }
  });

  ipcMain.handle('sync:getLocalDbPath', () => {
    const dataDir = path.join(app.getPath('userData'), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    return getLocalDatabasePath();
  });

  ipcMain.handle('sync:getLocalStats', async () => {
    if (!isLocalDbReady()) return { ready: false, productCount: 0 };
    const productCount = await getLocalProductCount();
    return { ready: true, productCount };
  });

  ipcMain.handle('sync:run', async () => {
    const token = getAccessToken();
    if (!token) return { success: false, message: 'Not authenticated' };

    const deviceId = getOrCreateDeviceId();

    try {
      await initLocalDatabase();

      const pushResponse = await fetch(`${API_URL}/api/v1/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ deviceId, items: [] }),
      });
      const pushJson = await pushResponse.json() as { data?: unknown; error?: { message?: string } };
      if (!pushResponse.ok) {
        return { success: false, message: pushJson.error?.message ?? 'Push failed' };
      }

      const pullResponse = await fetch(
        `${API_URL}/api/v1/sync/pull?deviceId=${encodeURIComponent(deviceId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const pullJson = await pullResponse.json() as {
        data?: { changes?: Array<{ entityType: string; entityId: string; updatedAt: string; data: Record<string, unknown> }>; cursor?: string };
        error?: { message?: string };
      };
      if (!pullResponse.ok) {
        return { success: false, message: pullJson.error?.message ?? 'Pull failed' };
      }

      const changes = pullJson.data?.changes ?? [];
      const applied = await applyPullChanges(changes);
      const productCount = await getLocalProductCount();

      const tenantId = str(
        changes.find((c) => typeof c.data?.tenantId === 'string')?.data?.tenantId,
        'local',
      );

      const db = getLocalDb();
      await db.syncCursor.upsert({
        where: {
          tenantId_deviceId_entityType: {
            tenantId,
            deviceId,
            entityType: 'all',
          },
        },
        update: { cursor: pullJson.data?.cursor ?? new Date().toISOString() },
        create: {
          tenantId,
          deviceId,
          entityType: 'all',
          cursor: pullJson.data?.cursor ?? new Date().toISOString(),
        },
      });

      return {
        success: true,
        data: {
          push: pushJson.data,
          pulledCount: changes.length,
          appliedCount: applied,
          localProductCount: productCount,
          cursor: pullJson.data?.cursor,
        },
      };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Sync failed' };
    }
  });
}
