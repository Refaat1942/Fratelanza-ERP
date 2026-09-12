import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { InventoryLedgerService } from '../../common/services/inventory-ledger.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private inventoryLedger: InventoryLedgerService,
    private audit: AuditService,
  ) {}

  async listMovements(
    tenantId: string,
    filters?: {
      warehouseId?: string;
      productId?: string;
      warehouseFilter?: { warehouseId?: string | { in: string[] } };
    },
  ) {
    if (filters?.warehouseId) {
      await this.assertWarehouseForTenant(tenantId, filters.warehouseId);
    }
    if (filters?.productId) {
      await this.assertProductForTenant(tenantId, filters.productId);
    }

    return this.prisma.inventoryMovement.findMany({
      where: {
        tenantId,
        ...(filters?.warehouseId && { warehouseId: filters.warehouseId }),
        ...(filters?.productId && { productId: filters.productId }),
        ...(filters?.warehouseFilter && !filters?.warehouseId ? filters.warehouseFilter : {}),
      },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getBalances(
    tenantId: string,
    warehouseId?: string,
    warehouseFilter?: { warehouseId?: string | { in: string[] } },
  ) {
    if (warehouseId) {
      await this.assertWarehouseForTenant(tenantId, warehouseId);
    }

    return this.prisma.stockBalance.findMany({
      where: {
        tenantId,
        ...(warehouseId && { warehouseId }),
        ...(warehouseFilter && !warehouseId ? warehouseFilter : {}),
      },
      include: {
        product: { select: { id: true, sku: true, name: true, salePrice: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: { product: { name: 'asc' } },
    });
  }

  async adjustStock(
    tenantId: string,
    data: {
      warehouseId: string;
      productId: string;
      quantity: number;
      unitCost?: number;
      notes?: string;
      branchId?: string;
      createdById?: string;
    },
  ) {
    const warehouse = await this.assertWarehouseForTenant(tenantId, data.warehouseId);
    await this.assertProductForTenant(tenantId, data.productId);

    if (data.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: data.branchId, tenantId, deletedAt: null },
      });
      if (!branch) {
        throw new BadRequestException('Branch not found');
      }
      if (warehouse.branchId !== data.branchId) {
        throw new BadRequestException('Warehouse does not belong to the specified branch');
      }
    }

    const movementType = data.quantity >= 0 ? 'adjustment_in' : 'adjustment_out';

    const movement = await this.prisma.$transaction((tx) =>
      this.inventoryLedger.applyMovement(
        {
          tenantId,
          branchId: data.branchId ?? warehouse.branchId,
          warehouseId: data.warehouseId,
          productId: data.productId,
          movementType,
          quantity: data.quantity,
          unitCost: data.unitCost,
          notes: data.notes,
          createdById: data.createdById,
          referenceType: 'stock_adjustment',
        },
        tx,
      ),
    );

    await this.audit.log({
      tenantId,
      branchId: data.branchId ?? warehouse.branchId,
      userId: data.createdById,
      entity: 'inventory_movement',
      entityId: movement.id,
      action: 'inventory.adjustment.created',
      newValue: {
        productId: data.productId,
        warehouseId: data.warehouseId,
        movementType,
        quantity: data.quantity,
        notes: data.notes ?? null,
      },
    });

    return movement;
  }

  async transferStock(
    tenantId: string,
    data: {
      fromWarehouseId: string;
      toWarehouseId: string;
      productId: string;
      quantity: number;
      branchId?: string;
      notes?: string;
      createdById?: string;
    },
  ) {
    if (data.fromWarehouseId === data.toWarehouseId) {
      throw new BadRequestException('Source and destination warehouses must differ');
    }
    if (data.quantity <= 0) {
      throw new BadRequestException('Transfer quantity must be positive');
    }

    const fromWarehouse = await this.assertWarehouseForTenant(tenantId, data.fromWarehouseId);
    const toWarehouse = await this.assertWarehouseForTenant(tenantId, data.toWarehouseId);
    await this.assertProductForTenant(tenantId, data.productId);

    const branchId = data.branchId ?? fromWarehouse.branchId;
    if (fromWarehouse.branchId !== branchId || toWarehouse.branchId !== branchId) {
      throw new BadRequestException('Both warehouses must belong to the same branch');
    }

    const balance = await this.prisma.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId,
          warehouseId: data.fromWarehouseId,
          productId: data.productId,
        },
      },
    });
    const unitCost = balance ? Number(balance.avgCost) : 0;

    const transferRef = randomUUID();

    const [outMovement, inMovement] = await this.prisma.$transaction(async (tx) => {
      const outMv = await this.inventoryLedger.applyMovement(
        {
          tenantId,
          branchId,
          warehouseId: data.fromWarehouseId,
          productId: data.productId,
          movementType: 'transfer_out',
          quantity: -data.quantity,
          unitCost,
          referenceType: 'stock_transfer',
          referenceId: transferRef,
          notes: data.notes,
          createdById: data.createdById,
        },
        tx,
      );
      const inMv = await this.inventoryLedger.applyMovement(
        {
          tenantId,
          branchId,
          warehouseId: data.toWarehouseId,
          productId: data.productId,
          movementType: 'transfer_in',
          quantity: data.quantity,
          unitCost,
          referenceType: 'stock_transfer',
          referenceId: transferRef,
          notes: data.notes,
          createdById: data.createdById,
        },
        tx,
      );
      return [outMv, inMv];
    });

    await this.audit.log({
      tenantId,
      branchId,
      userId: data.createdById,
      entity: 'inventory_movement',
      entityId: outMovement.id,
      action: 'inventory.transfer.completed',
      newValue: {
        fromWarehouseId: data.fromWarehouseId,
        toWarehouseId: data.toWarehouseId,
        productId: data.productId,
        quantity: data.quantity,
      },
    });

    return { outMovement, inMovement };
  }

  private async assertWarehouseForTenant(tenantId: string, warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId, deletedAt: null },
    });
    if (!warehouse) {
      throw new BadRequestException('Warehouse not found');
    }
    return warehouse;
  }

  private async assertProductForTenant(tenantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
    });
    if (!product) {
      throw new BadRequestException('Product not found');
    }
    return product;
  }
}
