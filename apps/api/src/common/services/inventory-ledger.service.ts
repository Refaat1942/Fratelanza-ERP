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
    const run = async (db: Prisma.TransactionClient) => {
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

      const updated = await db.$queryRaw<Array<{ quantity: Prisma.Decimal; avgCost: Prisma.Decimal }>>`
        INSERT INTO stock_balances (
          id, "tenantId", "warehouseId", "productId", quantity, "avgCost", "updatedAt"
        )
        VALUES (
          gen_random_uuid(),
          ${input.tenantId}::uuid,
          ${input.warehouseId}::uuid,
          ${input.productId}::uuid,
          ${qty},
          ${cost},
          NOW()
        )
        ON CONFLICT ("tenantId", "warehouseId", "productId")
        DO UPDATE SET
          quantity = stock_balances.quantity + ${qty},
          "avgCost" = CASE
            WHEN ${qty} > 0 AND ${cost} <> 0 THEN
              CASE
                WHEN stock_balances.quantity + ${qty} = 0 THEN 0
                ELSE (
                  (stock_balances.quantity * stock_balances."avgCost") + (${qty} * ${cost})
                ) / (stock_balances.quantity + ${qty})
              END
            ELSE stock_balances."avgCost"
          END,
          "updatedAt" = NOW()
        RETURNING quantity, "avgCost"
      `;

      const balance = updated[0];
      if (!balance || new Prisma.Decimal(balance.quantity).lessThan(0)) {
        throw new BadRequestException('Insufficient stock for this movement');
      }

      return movement;
    };

    if (tx) {
      return run(tx);
    }

    return this.prisma.$transaction(run);
  }
}
