import {
  Injectable, BadRequestException,
} from '@nestjs/common';
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
    filters?: { warehouseId?: string; productId?: string },
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
      },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getBalances(tenantId: string, warehouseId?: string) {
    if (warehouseId) {
      await this.assertWarehouseForTenant(tenantId, warehouseId);
    }

    return this.prisma.stockBalance.findMany({
      where: {
        tenantId,
        ...(warehouseId && { warehouseId }),
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
