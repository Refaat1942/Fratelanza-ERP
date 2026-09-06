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
import {
  getPendingQueueCount,
  getPendingQueueItems,
  markQueueItemsProcessed,
} from './local-queue';
import {
  offlineCreateCustomer,
  offlineUpdateCustomer,
  offlineCreateSupplier,
  offlineUpdateSupplier,
  offlineCreateProduct,
  offlineUpdateProduct,
  offlinePosSale,
  getOrCreateLocalShift,
  setLocalShift,
  getLocalCustomersList,
  getLocalSuppliersList,
  getLocalProductsList,
} from './offline-mutations';

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
    if (!isLocalDbReady()) return { ready: false, productCount: 0, pendingCount: 0 };
    const deviceId = getOrCreateDeviceId();
    const [productCount, pendingCount] = await Promise.all([
      getLocalProductCount(),
      getPendingQueueCount(deviceId),
    ]);
    return { ready: true, productCount, pendingCount };
  });

  ipcMain.handle('offline:createCustomer', async (_e, args: {
    tenantId: string;
    branchId?: string;
    payload: { code: string; name: string; email?: string; phone?: string };
  }) => {
    await initLocalDatabase();
    const deviceId = getOrCreateDeviceId();
    return offlineCreateCustomer(args.tenantId, deviceId, args.branchId, args.payload);
  });

  ipcMain.handle('offline:updateCustomer', async (_e, args: {
    tenantId: string;
    id: string;
    payload: { name?: string; email?: string; phone?: string };
  }) => {
    await initLocalDatabase();
    const deviceId = getOrCreateDeviceId();
    await offlineUpdateCustomer(args.tenantId, deviceId, args.id, args.payload);
    return { success: true };
  });

  ipcMain.handle('offline:createSupplier', async (_e, args: {
    tenantId: string;
    payload: { code: string; name: string; email?: string; phone?: string };
  }) => {
    await initLocalDatabase();
    const deviceId = getOrCreateDeviceId();
    return offlineCreateSupplier(args.tenantId, deviceId, args.payload);
  });

  ipcMain.handle('offline:updateSupplier', async (_e, args: {
    tenantId: string;
    id: string;
    payload: { name?: string; email?: string };
  }) => {
    await initLocalDatabase();
    const deviceId = getOrCreateDeviceId();
    await offlineUpdateSupplier(args.tenantId, deviceId, args.id, args.payload);
    return { success: true };
  });

  ipcMain.handle('offline:createProduct', async (_e, args: {
    tenantId: string;
    payload: {
      sku: string;
      name: string;
      unitId: string;
      barcode?: string;
      salePrice?: number;
      costPrice?: number;
    };
  }) => {
    await initLocalDatabase();
    const deviceId = getOrCreateDeviceId();
    return offlineCreateProduct(args.tenantId, deviceId, args.payload);
  });

  ipcMain.handle('offline:updateProduct', async (_e, args: {
    tenantId: string;
    id: string;
    payload: { name?: string; barcode?: string; salePrice?: number };
  }) => {
    await initLocalDatabase();
    const deviceId = getOrCreateDeviceId();
    await offlineUpdateProduct(args.tenantId, deviceId, args.id, args.payload);
    return { success: true };
  });

  ipcMain.handle('local:getCustomers', async () => {
    if (!isLocalDbReady()) return [];
    const rows = await getLocalCustomersList();
    return rows.map((r: { id: string; code: string; name: string; email?: string; phone?: string; balance: number }) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      email: r.email ?? undefined,
      phone: r.phone ?? undefined,
      balance: Number(r.balance),
    }));
  });

  ipcMain.handle('local:getSuppliers', async () => {
    if (!isLocalDbReady()) return [];
    const rows = await getLocalSuppliersList();
    return rows.map((r: { id: string; code: string; name: string; email?: string; balance: number }) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      email: r.email ?? undefined,
      balance: Number(r.balance),
    }));
  });

  ipcMain.handle('local:getProducts', async () => {
    if (!isLocalDbReady()) return [];
    const rows = await getLocalProductsList();
    return rows.map((r: { id: string; sku: string; name: string; salePrice: number; barcode?: string; isActive: boolean }) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      salePrice: Number(r.salePrice),
      barcode: r.barcode ?? undefined,
      isActive: r.isActive,
    }));
  });

  ipcMain.handle('offline:getOrCreateShift', async (_e, args: { branchId: string; userId: string }) => {
    await initLocalDatabase();
    return getOrCreateLocalShift(args.branchId, args.userId);
  });

  ipcMain.handle('offline:setShift', async (_e, args: { branchId: string; userId: string; shiftId: string }) => {
    await initLocalDatabase();
    await setLocalShift(args.branchId, args.userId, args.shiftId);
    return { success: true };
  });

  ipcMain.handle('offline:posSale', async (_e, args: {
    tenantId: string;
    payload: {
      branchId: string;
      userId: string;
      shiftId: string;
      warehouseId?: string;
      customerId?: string;
      lines: Array<{ productId: string; description: string; quantity: number; unitPrice: number }>;
      payments: Array<{ method: string; amount: number }>;
    };
  }) => {
    await initLocalDatabase();
    const deviceId = getOrCreateDeviceId();
    return offlinePosSale(args.tenantId, deviceId, args.payload);
  });

  ipcMain.handle('sync:run', async () => {
    const token = getAccessToken();
    if (!token) return { success: false, message: 'Not authenticated' };

    const deviceId = getOrCreateDeviceId();

    try {
      await initLocalDatabase();

      const pendingItems = await getPendingQueueItems(deviceId);
      const pushBody = {
        deviceId,
        items: pendingItems.map((item) => ({
          entityType: item.entityType,
          entityId: item.entityId,
          operation: item.operation,
          payload: item.payload,
          idempotencyKey: item.idempotencyKey,
          version: item.version,
        })),
      };

      const pushResponse = await fetch(`${API_URL}/api/v1/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(pushBody),
      });
      const pushJson = await pushResponse.json() as {
        data?: {
          processed?: Array<{ idempotencyKey: string; status: string }>;
        };
        error?: { message?: string };
      };
      if (!pushResponse.ok) {
        return { success: false, message: pushJson.error?.message ?? 'Push failed' };
      }

      if (pushJson.data?.processed) {
        await markQueueItemsProcessed(pushJson.data.processed);
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
      const pendingCount = await getPendingQueueCount(deviceId);

      const tenantId = str(
        changes.find((c) => typeof c.data?.tenantId === 'string')?.data?.tenantId,
        pendingItems[0]?.payload?.tenantId as string ?? 'local',
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
          pushedCount: pendingItems.length,
          processedCount: pushJson.data?.processed?.filter((p) => p.status === 'completed').length ?? 0,
          pulledCount: changes.length,
          appliedCount: applied,
          localProductCount: productCount,
          pendingCount,
          cursor: pullJson.data?.cursor,
        },
      };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Sync failed' };
    }
  });
}
