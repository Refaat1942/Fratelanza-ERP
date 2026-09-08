import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(tenantId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [salesToday, salesMonth, purchasesMonth, receivables, payables, stockBalances, activeProjects] =
      await Promise.all([
        this.prisma.salesInvoice.aggregate({
          where: {
            tenantId,
            status: 'posted',
            invoiceDate: { gte: startOfDay },
            deletedAt: null,
          },
          _sum: { total: true },
        }),
        this.prisma.salesInvoice.aggregate({
          where: {
            tenantId,
            status: 'posted',
            invoiceDate: { gte: startOfMonth },
            deletedAt: null,
          },
          _sum: { total: true },
        }),
        this.prisma.purchaseOrder.aggregate({
          where: {
            tenantId,
            status: { in: ['received', 'partially_received', 'approved'] },
            orderDate: { gte: startOfMonth },
          },
          _sum: { total: true },
        }),
        this.prisma.customer.aggregate({
          where: { tenantId, deletedAt: null, isActive: true },
          _sum: { balance: true },
        }),
        this.prisma.supplier.aggregate({
          where: { tenantId, deletedAt: null, isActive: true },
          _sum: { balance: true },
        }),
        this.prisma.stockBalance.findMany({
          where: { tenantId },
          select: { quantity: true, avgCost: true },
        }),
        this.prisma.project.count({
          where: { tenantId, status: 'active', deletedAt: null },
        }),
      ]);

    let inventoryValue = new Prisma.Decimal(0);
    let lowStockCount = 0;
    const lowStockThreshold = new Prisma.Decimal(10);

    for (const bal of stockBalances) {
      inventoryValue = inventoryValue.add(bal.quantity.mul(bal.avgCost));
      if (bal.quantity.lessThanOrEqualTo(lowStockThreshold)) {
        lowStockCount++;
      }
    }

    const posToday = await this.prisma.posSale.aggregate({
      where: { tenantId, saleDate: { gte: startOfDay } },
      _sum: { total: true },
    });

    const salesTodayTotal = Number(salesToday._sum.total ?? 0) + Number(posToday._sum.total ?? 0);

    return {
      salesToday: salesTodayTotal,
      salesMonth: Number(salesMonth._sum.total ?? 0),
      purchasesMonth: Number(purchasesMonth._sum.total ?? 0),
      receivables: Number(receivables._sum.balance ?? 0),
      payables: Number(payables._sum.balance ?? 0),
      inventoryValue: Number(inventoryValue),
      lowStockCount,
      activeProjects,
    };
  }
}
