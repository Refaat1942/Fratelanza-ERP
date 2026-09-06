import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { ProductsService } from '../products/products.service';

@Injectable()
export class SyncProcessorService {
  private readonly logger = new Logger(SyncProcessorService.name);

  constructor(
    private prisma: PrismaService,
    private customers: CustomersService,
    private suppliers: SuppliersService,
    private products: ProductsService,
  ) {}

  async processPending(tenantId: string, deviceId: string) {
    const pending = await this.prisma.syncQueue.findMany({
      where: { tenantId, deviceId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    const results: Array<{ id: string; idempotencyKey: string; status: string; error?: string }> = [];

    for (const item of pending) {
      try {
        await this.processItem(tenantId, item);
        await this.prisma.syncQueue.update({
          where: { id: item.id },
          data: { status: 'completed', processedAt: new Date(), lastError: null },
        });
        results.push({
          id: item.id,
          idempotencyKey: item.idempotencyKey,
          status: 'completed',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Processing failed';
        this.logger.warn(`Sync item ${item.id} failed: ${message}`);
        await this.prisma.syncQueue.update({
          where: { id: item.id },
          data: {
            status: 'failed',
            retryCount: { increment: 1 },
            lastError: message,
          },
        });
        results.push({
          id: item.id,
          idempotencyKey: item.idempotencyKey,
          status: 'failed',
          error: message,
        });
      }
    }

    return results;
  }

  private async processItem(
    tenantId: string,
    item: {
      entityType: string;
      entityId: string;
      operation: string;
      payload: Prisma.JsonValue;
    },
  ) {
    const payload = (item.payload ?? {}) as Record<string, unknown>;

    switch (item.entityType) {
      case 'customer':
        if (item.operation === 'create') {
          const byId = await this.prisma.customer.findFirst({
            where: { id: item.entityId, tenantId },
          });
          if (byId) return;

          const byCode = await this.prisma.customer.findUnique({
            where: { tenantId_code: { tenantId, code: String(payload.code ?? '') } },
          });
          if (byCode) return;

          await this.prisma.customer.create({
            data: {
              id: item.entityId,
              tenantId,
              code: String(payload.code ?? ''),
              name: String(payload.name ?? ''),
              branchId: payload.branchId ? String(payload.branchId) : undefined,
              email: payload.email ? String(payload.email) : undefined,
              phone: payload.phone ? String(payload.phone) : undefined,
              address: payload.address ? String(payload.address) : undefined,
              taxNumber: payload.taxNumber ? String(payload.taxNumber) : undefined,
              creditLimit: new Prisma.Decimal(Number(payload.creditLimit ?? 0)),
            },
          });
        } else if (item.operation === 'update') {
          await this.customers.update(tenantId, item.entityId, {
            name: payload.name ? String(payload.name) : undefined,
            email: payload.email ? String(payload.email) : undefined,
            phone: payload.phone ? String(payload.phone) : undefined,
            address: payload.address ? String(payload.address) : undefined,
            isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : undefined,
          });
        }
        break;

      case 'supplier':
        if (item.operation === 'create') {
          const byId = await this.prisma.supplier.findFirst({
            where: { id: item.entityId, tenantId },
          });
          if (byId) return;

          const byCode = await this.prisma.supplier.findUnique({
            where: { tenantId_code: { tenantId, code: String(payload.code ?? '') } },
          });
          if (byCode) return;

          await this.prisma.supplier.create({
            data: {
              id: item.entityId,
              tenantId,
              code: String(payload.code ?? ''),
              name: String(payload.name ?? ''),
              email: payload.email ? String(payload.email) : undefined,
              phone: payload.phone ? String(payload.phone) : undefined,
              address: payload.address ? String(payload.address) : undefined,
              taxNumber: payload.taxNumber ? String(payload.taxNumber) : undefined,
            },
          });
        } else if (item.operation === 'update') {
          await this.suppliers.update(tenantId, item.entityId, {
            name: payload.name ? String(payload.name) : undefined,
            email: payload.email ? String(payload.email) : undefined,
            phone: payload.phone ? String(payload.phone) : undefined,
            isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : undefined,
          });
        }
        break;

      case 'product':
        if (item.operation === 'create') {
          const byId = await this.prisma.product.findFirst({
            where: { id: item.entityId, tenantId },
          });
          if (byId) return;

          const bySku = await this.prisma.product.findUnique({
            where: { tenantId_sku: { tenantId, sku: String(payload.sku ?? '') } },
          });
          if (bySku) return;

          await this.prisma.product.create({
            data: {
              id: item.entityId,
              tenantId,
              sku: String(payload.sku ?? ''),
              name: String(payload.name ?? ''),
              unitId: String(payload.unitId ?? ''),
              categoryId: payload.categoryId ? String(payload.categoryId) : undefined,
              barcode: payload.barcode ? String(payload.barcode) : undefined,
              costPrice: new Prisma.Decimal(Number(payload.costPrice ?? 0)),
              salePrice: new Prisma.Decimal(Number(payload.salePrice ?? 0)),
            },
          });
        } else if (item.operation === 'update') {
          await this.products.update(tenantId, item.entityId, {
            name: payload.name ? String(payload.name) : undefined,
            barcode: payload.barcode ? String(payload.barcode) : undefined,
            costPrice: payload.costPrice !== undefined ? Number(payload.costPrice) : undefined,
            salePrice: payload.salePrice !== undefined ? Number(payload.salePrice) : undefined,
            isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : undefined,
          });
        }
        break;

      default:
        throw new Error(`Unsupported sync entity: ${item.entityType}`);
    }
  }
}
