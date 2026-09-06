import { getLocalDb } from './local-db';
import { enqueueSyncItem, newEntityId } from './local-queue';

export async function offlineCreateCustomer(
  tenantId: string,
  deviceId: string,
  branchId: string | undefined,
  payload: { code: string; name: string; email?: string; phone?: string },
) {
  const db = getLocalDb();
  const id = newEntityId();

  await db.customer.create({
    data: {
      id,
      tenantId,
      branchId: branchId ?? null,
      code: payload.code,
      name: payload.name,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      balance: 0,
      isActive: true,
      syncStatus: 'pending',
      deviceId,
    },
  });

  await enqueueSyncItem({
    tenantId,
    deviceId,
    entityType: 'customer',
    entityId: id,
    operation: 'create',
    payload: { ...payload, branchId },
  });

  return { id };
}

export async function offlineUpdateCustomer(
  tenantId: string,
  deviceId: string,
  id: string,
  payload: { name?: string; email?: string; phone?: string },
) {
  const db = getLocalDb();

  await db.customer.update({
    where: { id },
    data: {
      ...payload,
      syncStatus: 'pending',
      deviceId,
      updatedAt: new Date(),
    },
  });

  await enqueueSyncItem({
    tenantId,
    deviceId,
    entityType: 'customer',
    entityId: id,
    operation: 'update',
    payload,
  });
}

export async function offlineCreateSupplier(
  tenantId: string,
  deviceId: string,
  payload: { code: string; name: string; email?: string; phone?: string },
) {
  const db = getLocalDb();
  const id = newEntityId();

  await db.supplier.create({
    data: {
      id,
      tenantId,
      code: payload.code,
      name: payload.name,
      email: payload.email ?? null,
      balance: 0,
      isActive: true,
      syncStatus: 'pending',
      deviceId,
    },
  });

  await enqueueSyncItem({
    tenantId,
    deviceId,
    entityType: 'supplier',
    entityId: id,
    operation: 'create',
    payload,
  });

  return { id };
}

export async function offlineUpdateSupplier(
  tenantId: string,
  deviceId: string,
  id: string,
  payload: { name?: string; email?: string },
) {
  const db = getLocalDb();

  await db.supplier.update({
    where: { id },
    data: {
      ...payload,
      syncStatus: 'pending',
      deviceId,
      updatedAt: new Date(),
    },
  });

  await enqueueSyncItem({
    tenantId,
    deviceId,
    entityType: 'supplier',
    entityId: id,
    operation: 'update',
    payload,
  });
}

export async function offlineCreateProduct(
  tenantId: string,
  deviceId: string,
  payload: {
    sku: string;
    name: string;
    unitId: string;
    barcode?: string;
    salePrice?: number;
    costPrice?: number;
  },
) {
  const db = getLocalDb();
  const id = newEntityId();

  await db.product.create({
    data: {
      id,
      tenantId,
      unitId: payload.unitId,
      sku: payload.sku,
      name: payload.name,
      barcode: payload.barcode ?? null,
      costPrice: payload.costPrice ?? 0,
      salePrice: payload.salePrice ?? 0,
      trackInventory: true,
      isActive: true,
      syncStatus: 'pending',
      deviceId,
    },
  });

  await enqueueSyncItem({
    tenantId,
    deviceId,
    entityType: 'product',
    entityId: id,
    operation: 'create',
    payload,
  });

  return { id };
}

export async function offlineUpdateProduct(
  tenantId: string,
  deviceId: string,
  id: string,
  payload: { name?: string; barcode?: string; salePrice?: number },
) {
  const db = getLocalDb();

  await db.product.update({
    where: { id },
    data: {
      ...payload,
      syncStatus: 'pending',
      deviceId,
      updatedAt: new Date(),
    },
  });

  await enqueueSyncItem({
    tenantId,
    deviceId,
    entityType: 'product',
    entityId: id,
    operation: 'update',
    payload,
  });
}

export async function getOrCreateLocalShift(branchId: string, userId: string): Promise<string> {
  const db = getLocalDb();
  const key = `pos_shift:${branchId}:${userId}`;
  const existing = await db.appMeta.findUnique({ where: { key } });
  if (existing) return existing.value;

  const shiftId = newEntityId();
  await db.appMeta.create({ data: { key, value: shiftId } });
  return shiftId;
}

export async function setLocalShift(branchId: string, userId: string, shiftId: string) {
  const db = getLocalDb();
  const key = `pos_shift:${branchId}:${userId}`;
  await db.appMeta.upsert({
    where: { key },
    create: { key, value: shiftId },
    update: { value: shiftId },
  });
}

export async function offlinePosSale(
  tenantId: string,
  deviceId: string,
  payload: {
    branchId: string;
    userId: string;
    shiftId: string;
    warehouseId?: string;
    customerId?: string;
    lines: Array<{ productId: string; description: string; quantity: number; unitPrice: number }>;
    payments: Array<{ method: string; amount: number }>;
  },
) {
  const saleId = newEntityId();

  await enqueueSyncItem({
    tenantId,
    deviceId,
    entityType: 'pos_sale',
    entityId: saleId,
    operation: 'create',
    payload,
  });

  return {
    id: saleId,
    number: `OFF-${saleId.slice(0, 8).toUpperCase()}`,
  };
}

export async function getLocalCustomersList() {
  const db = getLocalDb();
  return db.customer.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function getLocalSuppliersList() {
  const db = getLocalDb();
  return db.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function getLocalProductsList() {
  const db = getLocalDb();
  return db.product.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
}
