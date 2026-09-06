import { getLocalDb } from './local-db';

interface SyncChange {
  entityType: string;
  entityId: string;
  updatedAt: string;
  data: Record<string, unknown>;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value) || fallback;
  return fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function bool(value: unknown, fallback = true): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function date(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return new Date();
}

export async function applyPullChanges(changes: SyncChange[]): Promise<number> {
  const db = getLocalDb();
  let applied = 0;

  for (const change of changes) {
    const data = change.data;
    const now = new Date();

    switch (change.entityType) {
      case 'unit': {
        await db.unitOfMeasure.upsert({
          where: { id: change.entityId },
          update: {
            tenantId: str(data.tenantId),
            name: str(data.name),
            code: str(data.code),
            symbol: data.symbol ? str(data.symbol) : null,
            isActive: bool(data.isActive),
            updatedAt: date(data.updatedAt),
            syncStatus: 'synced',
            lastSyncedAt: now,
          },
          create: {
            id: change.entityId,
            tenantId: str(data.tenantId),
            name: str(data.name),
            code: str(data.code),
            symbol: data.symbol ? str(data.symbol) : null,
            isActive: bool(data.isActive),
            createdAt: date(data.createdAt),
            updatedAt: date(data.updatedAt),
            syncStatus: 'synced',
            lastSyncedAt: now,
          },
        });
        applied += 1;
        break;
      }
      case 'warehouse': {
        await db.warehouse.upsert({
          where: { id: change.entityId },
          update: {
            tenantId: str(data.tenantId),
            branchId: str(data.branchId),
            name: str(data.name),
            code: str(data.code),
            address: data.address ? str(data.address) : null,
            isActive: bool(data.isActive),
            updatedAt: date(data.updatedAt),
            syncStatus: 'synced',
            lastSyncedAt: now,
          },
          create: {
            id: change.entityId,
            tenantId: str(data.tenantId),
            branchId: str(data.branchId),
            name: str(data.name),
            code: str(data.code),
            address: data.address ? str(data.address) : null,
            isActive: bool(data.isActive),
            createdAt: date(data.createdAt),
            updatedAt: date(data.updatedAt),
            syncStatus: 'synced',
            lastSyncedAt: now,
          },
        });
        applied += 1;
        break;
      }
      case 'product': {
        await db.product.upsert({
          where: { id: change.entityId },
          update: {
            tenantId: str(data.tenantId),
            categoryId: data.categoryId ? str(data.categoryId) : null,
            unitId: str(data.unitId),
            sku: str(data.sku),
            name: str(data.name),
            barcode: data.barcode ? str(data.barcode) : null,
            costPrice: num(data.costPrice),
            salePrice: num(data.salePrice),
            trackInventory: bool(data.trackInventory),
            isActive: bool(data.isActive),
            updatedAt: date(data.updatedAt),
            syncStatus: 'synced',
            lastSyncedAt: now,
          },
          create: {
            id: change.entityId,
            tenantId: str(data.tenantId),
            categoryId: data.categoryId ? str(data.categoryId) : null,
            unitId: str(data.unitId),
            sku: str(data.sku),
            name: str(data.name),
            barcode: data.barcode ? str(data.barcode) : null,
            costPrice: num(data.costPrice),
            salePrice: num(data.salePrice),
            trackInventory: bool(data.trackInventory),
            isActive: bool(data.isActive),
            createdAt: date(data.createdAt),
            updatedAt: date(data.updatedAt),
            syncStatus: 'synced',
            lastSyncedAt: now,
          },
        });
        applied += 1;
        break;
      }
      case 'customer': {
        await db.customer.upsert({
          where: { id: change.entityId },
          update: {
            tenantId: str(data.tenantId),
            branchId: data.branchId ? str(data.branchId) : null,
            code: str(data.code),
            name: str(data.name),
            email: data.email ? str(data.email) : null,
            phone: data.phone ? str(data.phone) : null,
            balance: num(data.balance),
            isActive: bool(data.isActive),
            updatedAt: date(data.updatedAt),
            syncStatus: 'synced',
            lastSyncedAt: now,
          },
          create: {
            id: change.entityId,
            tenantId: str(data.tenantId),
            branchId: data.branchId ? str(data.branchId) : null,
            code: str(data.code),
            name: str(data.name),
            email: data.email ? str(data.email) : null,
            phone: data.phone ? str(data.phone) : null,
            balance: num(data.balance),
            isActive: bool(data.isActive),
            createdAt: date(data.createdAt),
            updatedAt: date(data.updatedAt),
            syncStatus: 'synced',
            lastSyncedAt: now,
          },
        });
        applied += 1;
        break;
      }
      case 'supplier': {
        await db.supplier.upsert({
          where: { id: change.entityId },
          update: {
            tenantId: str(data.tenantId),
            code: str(data.code),
            name: str(data.name),
            email: data.email ? str(data.email) : null,
            balance: num(data.balance),
            isActive: bool(data.isActive),
            updatedAt: date(data.updatedAt),
            syncStatus: 'synced',
            lastSyncedAt: now,
          },
          create: {
            id: change.entityId,
            tenantId: str(data.tenantId),
            code: str(data.code),
            name: str(data.name),
            email: data.email ? str(data.email) : null,
            balance: num(data.balance),
            isActive: bool(data.isActive),
            createdAt: date(data.createdAt),
            updatedAt: date(data.updatedAt),
            syncStatus: 'synced',
            lastSyncedAt: now,
          },
        });
        applied += 1;
        break;
      }
      case 'stock_balance': {
        await db.stockBalance.upsert({
          where: { id: change.entityId },
          update: {
            tenantId: str(data.tenantId),
            warehouseId: str(data.warehouseId),
            productId: str(data.productId),
            quantity: num(data.quantity),
            avgCost: num(data.avgCost),
            updatedAt: date(data.updatedAt),
            syncStatus: 'synced',
          },
          create: {
            id: change.entityId,
            tenantId: str(data.tenantId),
            warehouseId: str(data.warehouseId),
            productId: str(data.productId),
            quantity: num(data.quantity),
            avgCost: num(data.avgCost),
            updatedAt: date(data.updatedAt),
            syncStatus: 'synced',
          },
        });
        applied += 1;
        break;
      }
      default:
        break;
    }
  }

  if (applied > 0) {
    await db.syncLog.create({
      data: {
        tenantId: str(changes[0]?.data?.tenantId, 'local'),
        deviceId: 'local',
        direction: 'pull_apply',
        recordCount: applied,
        status: 'completed',
        completedAt: new Date(),
      },
    });
  }

  return applied;
}

export async function getLocalProductCount(): Promise<number> {
  const db = getLocalDb();
  return db.product.count();
}
