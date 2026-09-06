import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { InventoryLedgerService } from '../../common/services/inventory-ledger.service';
import { AccountingEngineService } from '../../common/services/accounting-engine.service';

interface SaleLineInput {
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface PaymentInput {
  method: string;
  amount: number;
}

@Injectable()
export class PosService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
    private inventoryLedger: InventoryLedgerService,
    private accounting: AccountingEngineService,
  ) {}

  async openShift(
    tenantId: string,
    data: { branchId: string; userId: string; deviceId?: string; openingCash?: number },
  ) {
    const existing = await this.prisma.posShift.findFirst({
      where: { tenantId, branchId: data.branchId, userId: data.userId, status: 'open' },
    });
    if (existing) return existing;

    return this.prisma.posShift.create({
      data: {
        tenantId,
        branchId: data.branchId,
        userId: data.userId,
        deviceId: data.deviceId,
        openingCash: new Prisma.Decimal(data.openingCash ?? 0),
        status: 'open',
      },
    });
  }

  async closeShift(tenantId: string, shiftId: string, closingCash: number) {
    const shift = await this.prisma.posShift.findFirst({
      where: { id: shiftId, tenantId, status: 'open' },
    });
    if (!shift) throw new NotFoundException('Open shift not found');

    return this.prisma.posShift.update({
      where: { id: shiftId },
      data: {
        status: 'closed',
        closedAt: new Date(),
        closingCash: new Prisma.Decimal(closingCash),
      },
    });
  }

  async createSale(
    tenantId: string,
    data: {
      branchId: string;
      shiftId: string;
      customerId?: string;
      warehouseId?: string;
      lines: SaleLineInput[];
      payments: PaymentInput[];
    },
  ) {
    const shift = await this.prisma.posShift.findFirst({
      where: { id: data.shiftId, tenantId, status: 'open' },
    });
    if (!shift) throw new BadRequestException('Shift is not open');
    if (!data.lines.length) throw new BadRequestException('Sale must have lines');
    if (!data.payments.length) throw new BadRequestException('Sale must have payments');

    const number = await this.documentNumbers.nextNumber(
      tenantId, 'POS', 'POS', data.branchId,
    );

    let subtotal = new Prisma.Decimal(0);
    const lineData = data.lines.map((line) => {
      const lineTotal = new Prisma.Decimal(line.quantity).mul(line.unitPrice);
      subtotal = subtotal.add(lineTotal);
      return {
        productId: line.productId,
        description: line.description,
        quantity: new Prisma.Decimal(line.quantity),
        unitPrice: new Prisma.Decimal(line.unitPrice),
        lineTotal,
      };
    });

    const total = subtotal;
    const totalNum = Number(total);

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.posSale.create({
        data: {
          tenantId,
          branchId: data.branchId,
          shiftId: data.shiftId,
          customerId: data.customerId,
          number,
          subtotal,
          total,
          lines: { create: lineData },
          payments: {
            create: data.payments.map((p) => ({
              method: p.method,
              amount: new Prisma.Decimal(p.amount),
            })),
          },
        },
        include: { lines: true, payments: true },
      });

      if (data.warehouseId) {
        for (const line of data.lines) {
          const product = await tx.product.findFirst({
            where: { id: line.productId, tenantId },
          });
          if (!product?.trackInventory) continue;

          const balance = await tx.stockBalance.findUnique({
            where: {
              tenantId_warehouseId_productId: {
                tenantId,
                warehouseId: data.warehouseId,
                productId: line.productId,
              },
            },
          });
          const unitCost = balance ? Number(balance.avgCost) : Number(product.costPrice);

          await this.inventoryLedger.applyMovement(
            {
              tenantId,
              branchId: data.branchId,
              warehouseId: data.warehouseId,
              productId: line.productId,
              movementType: 'pos_sale',
              quantity: -line.quantity,
              unitCost,
              referenceType: 'pos_sale',
              referenceId: sale.id,
            },
            tx,
          );
        }
      }

      const cashPayment = data.payments
        .filter((p) => p.method === 'cash')
        .reduce((s, p) => s + p.amount, 0);

      await this.accounting.createEntry(
        tenantId,
        data.branchId,
        `POS sale ${number}`,
        [
          { accountCode: '1000', debit: cashPayment, credit: 0 },
          { accountCode: '4000', debit: 0, credit: totalNum },
        ],
        'pos_sale',
        sale.id,
        tx,
      );

      await tx.posShift.update({
        where: { id: data.shiftId },
        data: { totalSales: { increment: total } },
      });

      return sale;
    });
  }
}
