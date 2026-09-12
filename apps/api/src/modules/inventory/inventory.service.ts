import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { InventoryLedgerService } from '../../common/services/inventory-ledger.service';
import { AuditService } from '../audit/audit.service';
import { PurchasingService } from '../purchasing/purchasing.service';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private inventoryLedger: InventoryLedgerService,
    private audit: AuditService,
    private purchasing: PurchasingService,
  ) {}

  /** Stock-on-hand value (qty × avg cost) per warehouse, and the tenant total. */
  async getStockValuation(
    tenantId: string,
    warehouseFilter?: { warehouseId?: string | { in: string[] } },
  ) {
    const balances = await this.prisma.stockBalance.findMany({
      where: { tenantId, ...(warehouseFilter ?? {}) },
      include: { warehouse: { select: { id: true, name: true } } },
    });

    const byWarehouse = new Map<string, { warehouseId: string; warehouseName: string; value: number }>();
    let totalValue = 0;
    for (const b of balances) {
      const value = Number(b.quantity) * Number(b.avgCost);
      totalValue += value;
      const key = b.warehouseId;
      const current = byWarehouse.get(key) ?? { warehouseId: key, warehouseName: b.warehouse.name, value: 0 };
      current.value += value;
      byWarehouse.set(key, current);
    }

    return { totalValue, byWarehouse: [...byWarehouse.values()].sort((a, b) => b.value - a.value) };
  }

  /** Products at or below their reorder point, scoped to one warehouse (a reorder always targets a receiving warehouse). */
  async getLowStockReport(tenantId: string, warehouseId: string) {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId, deletedAt: null, isActive: true, trackInventory: true, reorderPoint: { gt: 0 },
      },
      include: {
        stockBalances: { where: { tenantId, warehouseId } },
      },
    });

    const supplierIds = [...new Set(products.map((p) => p.preferredSupplierId).filter((id): id is string => Boolean(id)))];
    const suppliers = supplierIds.length
      ? await this.prisma.supplier.findMany({ where: { tenantId, id: { in: supplierIds } } })
      : [];
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));

    return products
      .map((p) => {
        const onHand = p.stockBalances.reduce((sum, b) => sum + Number(b.quantity), 0);
        return {
          productId: p.id,
          sku: p.sku,
          name: p.name,
          onHand,
          reorderPoint: Number(p.reorderPoint),
          reorderQuantity: Number(p.reorderQuantity),
          costPrice: Number(p.costPrice),
          preferredSupplierId: p.preferredSupplierId,
          preferredSupplierName: p.preferredSupplierId ? supplierById.get(p.preferredSupplierId)?.name ?? null : null,
        };
      })
      .filter((p) => p.onHand <= p.reorderPoint)
      .sort((a, b) => (a.onHand - a.reorderPoint) - (b.onHand - b.reorderPoint));
  }

  /**
   * Groups low-stock products by preferred supplier and drafts one purchase
   * order per supplier — the "reorder suggestions -> POs in one click" flow.
   * Products with no preferred supplier are reported back as skipped rather
   * than guessed at.
   */
  async generateReorderPurchaseOrders(
    tenantId: string,
    branchId: string,
    warehouseId: string,
    actorUserId?: string,
  ) {
    const lowStock = await this.getLowStockReport(tenantId, warehouseId);
    const withSupplier = lowStock.filter((p) => p.preferredSupplierId);
    const skipped = lowStock.filter((p) => !p.preferredSupplierId);

    const bySupplier = new Map<string, typeof withSupplier>();
    for (const p of withSupplier) {
      const key = p.preferredSupplierId!;
      bySupplier.set(key, [...(bySupplier.get(key) ?? []), p]);
    }

    const createdOrders = [];
    for (const [supplierId, products] of bySupplier.entries()) {
      const order = await this.purchasing.createOrder(tenantId, {
        branchId,
        supplierId,
        warehouseId,
        notes: 'Auto-generated from low-stock reorder suggestions',
        createdById: actorUserId,
        lines: products.map((p) => ({
          productId: p.productId,
          description: p.name,
          quantity: Math.max(p.reorderQuantity, p.reorderPoint - p.onHand) || p.reorderPoint || 1,
          unitPrice: p.costPrice,
        })),
      });
      createdOrders.push(order);
    }

    return { createdOrders, skipped };
  }

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
