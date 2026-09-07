import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { InventoryLedgerService } from '../../common/services/inventory-ledger.service';
import { AccountingEngineService } from '../../common/services/accounting-engine.service';
import { getAppConfig } from '../../config/app-config';
import { FinancialPostingService } from '../finance/posting/financial-posting.service';
import type { PostingDimensions } from '../finance/posting/posting.types';
import { AuditService } from '../audit/audit.service';
import { PartyLegacyAdapterService } from '../parties/party-legacy-adapter.service';

interface InvoiceLineInput {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
}

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
    private inventoryLedger: InventoryLedgerService,
    private accounting: AccountingEngineService,
    private financialPosting: FinancialPostingService,
    private partyLegacy: PartyLegacyAdapterService,
    private audit: AuditService,
  ) {}

  async findAll(tenantId: string) {
    return this.prisma.salesInvoice.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        lines: true,
      },
      orderBy: { invoiceDate: 'desc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        customer: true,
        lines: { include: { product: { select: { id: true, sku: true, name: true } } } },
        payments: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  private calcLine(line: InvoiceLineInput) {
    const qty = new Prisma.Decimal(line.quantity);
    const price = new Prisma.Decimal(line.unitPrice);
    const discount = new Prisma.Decimal(line.discount ?? 0);
    const taxRate = new Prisma.Decimal(line.taxRate ?? 0);
    const gross = qty.mul(price).sub(discount);
    const taxAmount = gross.mul(taxRate).div(100);
    const lineTotal = gross.add(taxAmount);
    return { taxAmount, lineTotal, gross };
  }

  async createInvoice(
    tenantId: string,
    data: {
      branchId: string;
      customerId?: string;
      warehouseId?: string;
      invoiceDate?: string;
      dueDate?: string;
      notes?: string;
      lines: InvoiceLineInput[];
      createdById?: string;
    },
  ) {
    if (!data.lines.length) {
      throw new BadRequestException('Invoice must have at least one line');
    }

    let subtotal = new Prisma.Decimal(0);
    let taxAmount = new Prisma.Decimal(0);

    const lineData = data.lines.map((line) => {
      const calc = this.calcLine(line);
      subtotal = subtotal.add(calc.gross);
      taxAmount = taxAmount.add(calc.taxAmount);
      return {
        productId: line.productId,
        description: line.description,
        quantity: new Prisma.Decimal(line.quantity),
        unitPrice: new Prisma.Decimal(line.unitPrice),
        discount: new Prisma.Decimal(line.discount ?? 0),
        taxRate: new Prisma.Decimal(line.taxRate ?? 0),
        taxAmount: calc.taxAmount,
        lineTotal: calc.lineTotal,
      };
    });

    const total = subtotal.add(taxAmount);

    if (data.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: data.customerId, tenantId, deletedAt: null },
      });
      if (!customer) {
        throw new BadRequestException('Customer not found');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.nextNumber(
        tenantId, 'INV', 'INV', data.branchId, tx,
      );

      return tx.salesInvoice.create({
        data: {
          tenantId,
          branchId: data.branchId,
          customerId: data.customerId,
          warehouseId: data.warehouseId,
          number,
          status: 'draft',
          invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          notes: data.notes,
          subtotal,
          taxAmount,
          total,
          createdById: data.createdById,
          lines: { create: lineData },
        },
        include: { lines: true, customer: true },
      });
    });
  }

  async createInvoiceFromParty(
    tenantId: string,
    data: {
      partyId: string;
      branchId: string;
      warehouseId?: string;
      invoiceDate?: string;
      dueDate?: string;
      notes?: string;
      lines: InvoiceLineInput[];
      createdById?: string;
    },
  ) {
    const customer = await this.partyLegacy.resolveLinkedCustomerForSales(
      tenantId,
      data.partyId,
    );

    const invoice = await this.createInvoice(tenantId, {
      branchId: data.branchId,
      customerId: customer.id,
      warehouseId: data.warehouseId,
      invoiceDate: data.invoiceDate,
      dueDate: data.dueDate,
      notes: data.notes,
      lines: data.lines,
      createdById: data.createdById,
    });

    await this.audit.log({
      tenantId,
      userId: data.createdById,
      entity: 'sales_invoice',
      entityId: invoice.id,
      action: 'sales.invoice.created_from_party',
      newValue: { partyId: data.partyId, customerId: customer.id },
    });

    return invoice;
  }

  async recordPaymentFromParty(
    tenantId: string,
    data: {
      partyId: string;
      branchId: string;
      invoiceId?: string;
      amount: number;
      method?: string;
      paymentDate?: string;
      reference?: string;
      actorUserId?: string;
    },
  ) {
    const customer = await this.partyLegacy.resolveLinkedCustomerForSales(
      tenantId,
      data.partyId,
    );

    if (data.invoiceId) {
      const invoice = await this.prisma.salesInvoice.findFirst({
        where: { id: data.invoiceId, tenantId, deletedAt: null },
      });
      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }
    }

    const payment = await this.recordPayment(tenantId, {
      branchId: data.branchId,
      customerId: customer.id,
      invoiceId: data.invoiceId,
      amount: data.amount,
      method: data.method,
      paymentDate: data.paymentDate,
      reference: data.reference,
    });

    await this.audit.log({
      tenantId,
      userId: data.actorUserId,
      entity: 'customer_payment',
      entityId: payment.id,
      action: 'sales.payment.recorded_from_party',
      newValue: { partyId: data.partyId, customerId: customer.id },
    });

    return payment;
  }

  async postInvoice(
    tenantId: string,
    id: string,
    dimensions?: PostingDimensions,
  ) {
    const invoice = await this.findById(tenantId, id);
    if (invoice.status !== 'draft') {
      throw new BadRequestException('Only draft invoices can be posted');
    }
    if (!invoice.warehouseId) {
      throw new BadRequestException('Warehouse is required to post invoice');
    }

    const totalNum = Number(invoice.total);
    let cogsTotal = new Prisma.Decimal(0);
    const useSalesFinancePilot = getAppConfig().universalFinanceSalesPilotEnabled;

    return this.prisma.$transaction(async (tx) => {
      for (const line of invoice.lines) {
        if (!line.productId) continue;
        const product = await tx.product.findFirst({
          where: { id: line.productId, tenantId },
        });
        if (!product?.trackInventory) continue;

        const balance = await tx.stockBalance.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: invoice.warehouseId!,
              productId: line.productId,
            },
          },
        });
        const unitCost = balance ? Number(balance.avgCost) : Number(product.costPrice);
        cogsTotal = cogsTotal.add(
          new Prisma.Decimal(unitCost).mul(line.quantity),
        );

        await this.inventoryLedger.applyMovement(
          {
            tenantId,
            branchId: invoice.branchId,
            warehouseId: invoice.warehouseId!,
            productId: line.productId,
            movementType: 'sale',
            quantity: -Number(line.quantity),
            unitCost,
            referenceType: 'sales_invoice',
            referenceId: invoice.id,
          },
          tx,
        );
      }

      if (useSalesFinancePilot) {
        await this.financialPosting.post(
          {
            mode: 'rule',
            tenantId,
            branchId: invoice.branchId,
            postingDate: new Date(),
            description: `Sales invoice ${invoice.number}`,
            sourceModule: 'sales',
            sourceType: 'invoice',
            sourceId: invoice.id,
            sourceEvent: 'post',
            amounts: {
              total: invoice.total.toString(),
              cogs: cogsTotal.toString(),
            },
            dimensions,
          },
          tx,
        );
      } else {
        const cogsNum = Number(cogsTotal);
        await this.accounting.createEntry(
          tenantId,
          invoice.branchId,
          `Sales invoice ${invoice.number}`,
          [
            { accountCode: '1100', debit: totalNum, credit: 0, description: 'AR' },
            { accountCode: '4000', debit: 0, credit: totalNum, description: 'Revenue' },
            ...(cogsNum > 0
              ? [
                  { accountCode: '5000', debit: cogsNum, credit: 0, description: 'COGS' },
                  { accountCode: '1200', debit: 0, credit: cogsNum, description: 'Inventory' },
                ]
              : []),
          ],
          'sales_invoice',
          invoice.id,
          tx,
        );
      }

      if (invoice.customerId) {
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: { balance: { increment: invoice.total } },
        });
      }

      return tx.salesInvoice.update({
        where: { id },
        data: { status: 'posted', postedAt: new Date() },
        include: { lines: true, customer: true },
      });
    });
  }

  async recordPayment(
    tenantId: string,
    data: {
      branchId: string;
      customerId: string;
      invoiceId?: string;
      amount: number;
      method?: string;
      paymentDate?: string;
      reference?: string;
    },
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: data.customerId, tenantId, deletedAt: null },
    });
    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.nextNumber(
        tenantId, 'RCP', 'RCP', data.branchId, tx,
      );

      const payment = await tx.customerPayment.create({
        data: {
          tenantId,
          branchId: data.branchId,
          customerId: data.customerId,
          invoiceId: data.invoiceId,
          number,
          amount: new Prisma.Decimal(data.amount),
          method: data.method ?? 'cash',
          paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
          reference: data.reference,
        },
      });

      await tx.customer.update({
        where: { id: data.customerId },
        data: { balance: { decrement: data.amount } },
      });

      if (data.invoiceId) {
        await tx.salesInvoice.update({
          where: { id: data.invoiceId },
          data: { paidAmount: { increment: data.amount } },
        });
      }

      await this.accounting.createEntry(
        tenantId,
        data.branchId,
        `Customer payment ${number}`,
        [
          { accountCode: '1000', debit: data.amount, credit: 0 },
          { accountCode: '1100', debit: 0, credit: data.amount },
        ],
        'customer_payment',
        payment.id,
        tx,
      );

      return payment;
    });
  }
}
