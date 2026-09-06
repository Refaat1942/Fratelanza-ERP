import { randomUUID } from 'crypto';
import { getLocalDb } from './local-db';

export interface QueueItemInput {
  tenantId: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update';
  payload: Record<string, unknown>;
}

export interface PendingQueueItem {
  id: string;
  entityType: string;
  entityId: string;
  operation: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  version: number;
}

export async function enqueueSyncItem(input: QueueItemInput): Promise<string> {
  const db = getLocalDb();
  const idempotencyKey = `${input.entityType}:${input.entityId}:${input.operation}`;

  const existing = await db.syncQueue.findUnique({ where: { idempotencyKey } });
  if (existing) return existing.id;

  const row = await db.syncQueue.create({
    data: {
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      entityType: input.entityType,
      entityId: input.entityId,
      operation: input.operation,
      payload: JSON.stringify(input.payload),
      idempotencyKey,
      status: 'pending',
    },
  });

  return row.id;
}

export async function getPendingQueueItems(deviceId: string): Promise<PendingQueueItem[]> {
  const db = getLocalDb();
  const rows = await db.syncQueue.findMany({
    where: { deviceId, status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });

  return rows.map((row: {
    id: string;
    entityType: string;
    entityId: string;
    operation: string;
    payload: string;
    idempotencyKey: string;
    version: number;
  }) => ({
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    operation: row.operation,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    idempotencyKey: row.idempotencyKey,
    version: row.version,
  }));
}

export async function getPendingQueueCount(deviceId: string): Promise<number> {
  const db = getLocalDb();
  return db.syncQueue.count({ where: { deviceId, status: 'pending' } });
}

export async function markQueueItemsProcessed(
  items: Array<{ idempotencyKey: string; status: string }>,
): Promise<void> {
  const db = getLocalDb();
  for (const item of items) {
    if (item.status !== 'completed') continue;
    await db.syncQueue.updateMany({
      where: { idempotencyKey: item.idempotencyKey },
      data: { status: 'completed', processedAt: new Date() },
    });
  }
}

export function newEntityId(): string {
  return randomUUID();
}
