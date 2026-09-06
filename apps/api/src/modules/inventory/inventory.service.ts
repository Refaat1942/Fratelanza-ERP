import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { InventoryLedgerService } from '../../common/services/inventory-ledger.service';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private inventoryLedger: InventoryLedgerService,
  ) {}

  async listMovements(
    tenantId: string,
    filters?: { warehouseId?: string; productId?: string },
  ) {
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
    const movementType = data.quantity >= 0 ? 'adjustment_in' : 'adjustment_out';
    return this.inventoryLedger.applyMovement({
      tenantId,
      branchId: data.branchId,
      warehouseId: data.warehouseId,
      productId: data.productId,
      movementType,
      quantity: data.quantity,
      unitCost: data.unitCost,
      notes: data.notes,
      createdById: data.createdById,
      referenceType: 'stock_adjustment',
    });
  }
}
