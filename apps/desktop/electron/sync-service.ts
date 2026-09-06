import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { getOrCreateDeviceId } from './device-store';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

export function registerSyncHandlers(getAccessToken: () => string | null) {
  ipcMain.handle('sync:run', async () => {
    const token = getAccessToken();
    if (!token) return { success: false, message: 'Not authenticated' };

    const deviceId = getOrCreateDeviceId();

    try {
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
      const pullJson = await pullResponse.json() as { data?: { changes?: unknown[] }; error?: { message?: string } };
      if (!pullResponse.ok) {
        return { success: false, message: pullJson.error?.message ?? 'Pull failed' };
      }

      return {
        success: true,
        data: {
          push: pushJson.data,
          pull: pullJson.data,
          pulledCount: pullJson.data?.changes?.length ?? 0,
        },
      };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Sync failed' };
    }
  });

  ipcMain.handle('sync:getLocalDbPath', () => {
    const dataDir = path.join(app.getPath('userData'), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    return path.join(dataDir, 'fratelanza-local.db');
  });

  ipcMain.handle('sync:getDeviceId', () => getOrCreateDeviceId());
}
