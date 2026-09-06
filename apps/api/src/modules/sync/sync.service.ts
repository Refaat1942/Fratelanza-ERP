import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';
import { SyncProcessorService } from './sync-processor.service';

interface SyncItemInput {
  entityType: string;
  entityId: string;
  operation: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  version?: number;
}

@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private processor: SyncProcessorService,
  ) {}

  async push(
    tenantId: string,
    deviceId: string,
    items: SyncItemInput[],
  ) {
    const results = [];

    for (const item of items) {
      const existing = await this.prisma.syncQueue.findUnique({
        where: { idempotencyKey: item.idempotencyKey },
      });

      if (existing) {
        results.push({ idempotencyKey: item.idempotencyKey, status: existing.status, id: existing.id });
        continue;
      }

      const queued = await this.prisma.syncQueue.create({
        data: {
          tenantId,
          deviceId,
          entityType: item.entityType,
          entityId: item.entityId,
          operation: item.operation,
          payload: item.payload as Prisma.InputJsonValue,
          version: item.version ?? 1,
          idempotencyKey: item.idempotencyKey,
          status: 'pending',
        },
      });
      results.push({ idempotencyKey: item.idempotencyKey, status: 'pending', id: queued.id });
    }

    await this.prisma.syncLog.create({
      data: {
        tenantId,
        deviceId,
        direction: 'push',
        recordCount: items.length,
        status: 'completed',
        completedAt: new Date(),
      },
    });

    const processed = await this.processor.processPending(tenantId, deviceId);

    return { queued: results, processed };
  }

  async pull(
    tenantId: string,
    deviceId: string,
    cursor?: string,
    entityType?: string,
  ) {
    const since = cursor ? new Date(cursor) : new Date(0);

    const changes: Array<{
      entityType: string;
      entityId: string;
      updatedAt: string;
      data: unknown;
    }> = [];

    if (!entityType || entityType === 'product') {
      const products = await this.prisma.product.findMany({
        where: { tenantId, updatedAt: { gt: since } },
        take: 100,
      });
      for (const p of products) {
        changes.push({
          entityType: 'product',
          entityId: p.id,
          updatedAt: p.updatedAt.toISOString(),
          data: p,
        });
      }
    }

    if (!entityType || entityType === 'customer') {
      const customers = await this.prisma.customer.findMany({
        where: { tenantId, updatedAt: { gt: since } },
        take: 100,
      });
      for (const c of customers) {
        changes.push({
          entityType: 'customer',
          entityId: c.id,
          updatedAt: c.updatedAt.toISOString(),
          data: c,
        });
      }
    }

    if (!entityType || entityType === 'supplier') {
      const suppliers = await this.prisma.supplier.findMany({
        where: { tenantId, updatedAt: { gt: since } },
        take: 100,
      });
      for (const s of suppliers) {
        changes.push({
          entityType: 'supplier',
          entityId: s.id,
          updatedAt: s.updatedAt.toISOString(),
          data: s,
        });
      }
    }

    if (!entityType || entityType === 'warehouse') {
      const warehouses = await this.prisma.warehouse.findMany({
        where: { tenantId, updatedAt: { gt: since } },
        take: 100,
      });
      for (const w of warehouses) {
        changes.push({
          entityType: 'warehouse',
          entityId: w.id,
          updatedAt: w.updatedAt.toISOString(),
          data: w,
        });
      }
    }

    if (!entityType || entityType === 'unit') {
      const units = await this.prisma.unitOfMeasure.findMany({
        where: { tenantId, updatedAt: { gt: since } },
        take: 100,
      });
      for (const u of units) {
        changes.push({
          entityType: 'unit',
          entityId: u.id,
          updatedAt: u.updatedAt.toISOString(),
          data: u,
        });
      }
    }

    if (!entityType || entityType === 'stock_balance') {
      const balances = await this.prisma.stockBalance.findMany({
        where: { tenantId, updatedAt: { gt: since } },
        take: 200,
      });
      for (const b of balances) {
        changes.push({
          entityType: 'stock_balance',
          entityId: b.id,
          updatedAt: b.updatedAt.toISOString(),
          data: b,
        });
      }
    }

    const newCursor = changes.length
      ? changes.reduce((max, c) => (c.updatedAt > max ? c.updatedAt : max), since.toISOString())
      : since.toISOString();

    if (entityType) {
      await this.prisma.syncCursor.upsert({
        where: { tenantId_deviceId_entityType: { tenantId, deviceId, entityType } },
        update: { cursor: newCursor },
        create: { tenantId, deviceId, entityType, cursor: newCursor },
      });
    }

    await this.prisma.syncLog.create({
      data: {
        tenantId,
        deviceId,
        direction: 'pull',
        entityType,
        recordCount: changes.length,
        status: 'completed',
        completedAt: new Date(),
      },
    });

    return { changes, cursor: newCursor };
  }
}
