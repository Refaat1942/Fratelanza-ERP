import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';

export interface StockMovementInput {
  tenantId: string;
  branchId?: string | null;
  warehouseId: string;
  productId: string;
  movementType: string;
  quantity: number;
  unitCost?: number;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
  createdById?: string;
}

@Injectable()
export class InventoryLedgerService {
  constructor(private prisma: PrismaService) {}

  async applyMovement(input: StockMovementInput, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const qty = new Prisma.Decimal(input.quantity);
    const cost = new Prisma.Decimal(input.unitCost ?? 0);

    if (qty.isZero()) {
      throw new BadRequestException('Movement quantity cannot be zero');
    }

    const movement = await db.inventoryMovement.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        movementType: input.movementType,
        quantity: qty,
        unitCost: cost,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        notes: input.notes,
        createdById: input.createdById,
      },
    });

    const existing = await db.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: input.tenantId,
          warehouseId: input.warehouseId,
          productId: input.productId,
        },
      },
    });

    const currentQty = existing?.quantity ?? new Prisma.Decimal(0);
    const newQty = currentQty.add(qty);

    if (newQty.lessThan(0)) {
      throw new BadRequestException('Insufficient stock for this movement');
    }

    let newAvgCost = existing?.avgCost ?? new Prisma.Decimal(0);
    if (qty.greaterThan(0) && !cost.isZero()) {
      const totalValue = currentQty.mul(newAvgCost).add(qty.mul(cost));
      newAvgCost = newQty.isZero() ? new Prisma.Decimal(0) : totalValue.div(newQty);
    }

    await db.stockBalance.upsert({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: input.tenantId,
          warehouseId: input.warehouseId,
          productId: input.productId,
        },
      },
      update: { quantity: newQty, avgCost: newAvgCost },
      create: {
        tenantId: input.tenantId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        quantity: newQty,
        avgCost: newAvgCost,
      },
    });

    return movement;
  }
}
