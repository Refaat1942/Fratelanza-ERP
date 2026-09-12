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
import { TenantAccessService } from '../../common/services/tenant-access.service';
import { TaxEngineService } from '../localization/tax-engine.service';
import { ApprovalsService } from '../approvals/approvals.service';

interface PoLineInput {
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  taxCategoryId?: string;
}

interface ReceiveLineInput {
  lineId: string;
  quantity: number;
}

@Injectable()
export class PurchasingService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
    private inventoryLedger: InventoryLedgerService,
    private accounting: AccountingEngineService,
    private financialPosting: FinancialPostingService,
    private partyLegacy: PartyLegacyAdapterService,
    private audit: AuditService,
    private tenantAccess: TenantAccessService,
    private taxEngine: TaxEngineService,
    private approvals: ApprovalsService,
  ) {}

  async findAll(tenantId: string, branchWhere: { branchId?: string | { in: string[] } } = {}) {
    return this.prisma.purchaseOrder.findMany({
      where: { tenantId, ...branchWhere },
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        lines: true,
      },
      orderBy: { orderDate: 'desc' },
    });
  }

  async findById(tenantId: string, id: string, branchWhere: { branchId?: string | { in: string[] } } = {}) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId, ...branchWhere },
      include: {
        supplier: true,
        warehouse: true,
        lines: { include: { product: { select: { id: true, sku: true, name: true } } } },
      },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    return order;
  }

  async updateOrder(
    tenantId: string,
    id: string,
    data: {
      supplierId?: string;
      warehouseId?: string;
      orderDate?: string;
      expectedDate?: string;
      notes?: string;
      lines?: PoLineInput[];
    },
  ) {
    const order = await this.findById(tenantId, id);
    if (order.status !== 'draft') {
      throw new BadRequestException('Only draft purchase orders can be edited');
    }

    if (data.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: data.supplierId, tenantId, deletedAt: null },
      });
      if (!supplier) throw new BadRequestException('Supplier not found');
    }
    if (data.warehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: data.warehouseId, tenantId, deletedAt: null },
      });
      if (!warehouse) throw new BadRequestException('Warehouse not found');
    }

    let lineUpdate: Prisma.PurchaseOrderUpdateInput['lines'];
    let subtotal = order.subtotal;
    let taxAmount = order.taxAmount;
    let total = order.total;

    if (data.lines) {
      if (data.lines.length === 0) {
        throw new BadRequestException('Purchase order must have at least one line');
      }
      subtotal = new Prisma.Decimal(0);
      taxAmount = new Prisma.Decimal(0);
      const lineData: Array<{
        productId: string;
        description: string;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        taxRate: Prisma.Decimal;
        lineTotal: Prisma.Decimal;
      }> = [];
      for (const line of data.lines) {
        const calc = await this.taxEngine.calculateLineTax(tenantId, {
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxCategoryId: line.taxCategoryId,
          taxRateOverride: line.taxRate,
        });
        subtotal = subtotal.add(calc.gross);
        taxAmount = taxAmount.add(calc.taxAmount);
        lineData.push({
          productId: line.productId,
          description: line.description,
          quantity: new Prisma.Decimal(line.quantity),
          unitPrice: new Prisma.Decimal(line.unitPrice),
          taxRate: new Prisma.Decimal(calc.taxRate),
          lineTotal: new Prisma.Decimal(calc.lineTotal),
        });
      }
      total = subtotal.add(taxAmount);
      lineUpdate = { deleteMany: {}, create: lineData };
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: data.supplierId,
        warehouseId: data.warehouseId,
        orderDate: data.orderDate ? new Date(data.orderDate) : undefined,
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : undefined,
        notes: data.notes,
        subtotal,
        taxAmount,
        total,
        lines: lineUpdate,
      },
      include: { lines: true, supplier: true, warehouse: true },
    });
  }

  async cancelOrder(tenantId: string, id: string, actorUserId?: string) {
    const order = await this.findById(tenantId, id);
    if (order.status !== 'draft') {
      throw new BadRequestException('Only draft purchase orders can be cancelled');
    }

    const cancelled = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'cancelled' },
      include: { lines: true, supplier: true },
    });

    await this.audit.log({
      tenantId,
      branchId: order.branchId,
      userId: actorUserId,
      entity: 'purchase_order',
      entityId: order.id,
      action: 'purchasing.order.cancelled',
      newValue: { status: 'cancelled' },
    });

    return cancelled;
  }

  async createOrder(
    tenantId: string,
    data: {
      branchId: string;
      supplierId: string;
      warehouseId: string;
      orderDate?: string;
      expectedDate?: string;
      notes?: string;
      lines: PoLineInput[];
      createdById?: string;
    },
  ) {
    if (!data.lines.length) {
      throw new BadRequestException('Purchase order must have at least one line');
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: data.supplierId, tenantId, deletedAt: null },
    });
    if (!supplier) {
      throw new BadRequestException('Supplier not found');
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: data.warehouseId, tenantId, deletedAt: null },
    });
    if (!warehouse) {
      throw new BadRequestException('Warehouse not found');
    }

    await this.tenantAccess.assertBranchExists(tenantId, data.branchId);
    if (warehouse.branchId !== data.branchId) {
      throw new BadRequestException('Warehouse does not belong to the specified branch');
    }

    let subtotal = new Prisma.Decimal(0);
    let taxAmount = new Prisma.Decimal(0);

    const lineData: Array<{
      productId: string;
      description: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }> = [];
    for (const line of data.lines) {
      const calc = await this.taxEngine.calculateLineTax(tenantId, {
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxCategoryId: line.taxCategoryId,
        taxRateOverride: line.taxRate,
      });
      const gross = new Prisma.Decimal(calc.gross);
      const tax = new Prisma.Decimal(calc.taxAmount);
      const lineTotal = new Prisma.Decimal(calc.lineTotal);
      const taxRate = new Prisma.Decimal(calc.taxRate);
      subtotal = subtotal.add(gross);
      taxAmount = taxAmount.add(tax);
      lineData.push({
        productId: line.productId,
        description: line.description,
        quantity: new Prisma.Decimal(line.quantity),
        unitPrice: new Prisma.Decimal(line.unitPrice),
        taxRate,
        lineTotal,
      });
    }

    const total = subtotal.add(taxAmount);

    const order = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.nextNumber(
        tenantId, 'PO', 'PO', data.branchId, tx,
      );

      return tx.purchaseOrder.create({
        data: {
          tenantId,
          branchId: data.branchId,
          supplierId: data.supplierId,
          warehouseId: data.warehouseId,
          number,
          status: 'draft',
          orderDate: data.orderDate ? new Date(data.orderDate) : new Date(),
          expectedDate: data.expectedDate ? new Date(data.expectedDate) : undefined,
          notes: data.notes,
          subtotal,
          taxAmount,
          total,
          lines: { create: lineData },
        },
        include: { lines: true, supplier: true, warehouse: true },
      });
    });

    await this.maybeSubmitForApproval(tenantId, order.id, Number(order.total), data.createdById);

    return order;
  }

  /**
   * If an active approval workflow matches this PO's amount band, opens an
   * approval request for it. Tenants that never configured a purchasing
   * workflow simply skip this — it's opt-in per tenant, not a hard gate.
   */
  private async maybeSubmitForApproval(
    tenantId: string,
    orderId: string,
    amount: number,
    requestedById?: string,
  ): Promise<void> {
    if (!requestedById) return;
    try {
      await this.approvals.submitForApproval(tenantId, {
        sourceModule: 'purchasing',
        sourceType: 'order',
        sourceId: orderId,
        amount,
        requestedById,
      });
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
    }
  }

  async createOrderFromParty(
    tenantId: string,
    data: {
      partyId: string;
      branchId: string;
      warehouseId: string;
      orderDate?: string;
      expectedDate?: string;
      notes?: string;
      lines: PoLineInput[];
      createdById?: string;
    },
  ) {
    const supplier = await this.partyLegacy.resolveLinkedSupplierForPurchasing(
      tenantId,
      data.partyId,
    );

    const order = await this.createOrder(tenantId, {
      branchId: data.branchId,
      supplierId: supplier.id,
      warehouseId: data.warehouseId,
      orderDate: data.orderDate,
      expectedDate: data.expectedDate,
      notes: data.notes,
      lines: data.lines,
      createdById: data.createdById,
    });

    await this.audit.log({
      tenantId,
      userId: data.createdById,
      entity: 'purchase_order',
      entityId: order.id,
      action: 'purchasing.order.created_from_party',
      newValue: { partyId: data.partyId, supplierId: supplier.id },
    });

    return order;
  }

  async receiveOrder(
    tenantId: string,
    id: string,
    dimensions?: PostingDimensions,
    actorUserId?: string,
    receiveLines?: ReceiveLineInput[],
  ) {
    const order = await this.findById(tenantId, id);
    if (order.status === 'received' || order.status === 'cancelled' || order.status === 'returned') {
      throw new BadRequestException(`Purchase order is ${order.status} and cannot be received`);
    }

    const approvalRequest = await this.approvals.getRequestForSource(tenantId, 'purchasing', 'order', id);
    if (approvalRequest && approvalRequest.status !== 'approved') {
      throw new BadRequestException(`Purchase order requires approval (currently ${approvalRequest.status}) before it can be received`);
    }

    const requestedQtyByLine = new Map((receiveLines ?? []).map((l) => [l.lineId, l.quantity]));
    const useUniversalFinancePilot = getAppConfig().universalFinancePilotEnabled;
    let receivedValue = new Prisma.Decimal(0);
    let allLinesComplete = true;

    const result = await this.prisma.$transaction(async (tx) => {
      for (const line of order.lines) {
        const remaining = Number(line.quantity) - Number(line.receivedQty);
        const requested = requestedQtyByLine.has(line.id) ? requestedQtyByLine.get(line.id)! : remaining;
        const receiveQty = Math.max(0, Math.min(requested, remaining));

        if (receiveQty > 0) {
          await this.inventoryLedger.applyMovement(
            {
              tenantId,
              branchId: order.branchId,
              warehouseId: order.warehouseId,
              productId: line.productId,
              movementType: 'purchase',
              quantity: receiveQty,
              unitCost: Number(line.unitPrice),
              referenceType: 'purchase_order',
              referenceId: order.id,
            },
            tx,
          );

          await tx.purchaseOrderLine.update({
            where: { id: line.id },
            data: { receivedQty: { increment: receiveQty } },
          });

          receivedValue = receivedValue.add(line.unitPrice.mul(receiveQty));
        }

        if (remaining - receiveQty > 0.0001) {
          allLinesComplete = false;
        }
      }

      if (receivedValue.isZero()) {
        throw new BadRequestException('Nothing to receive — all lines are already fully received or zero quantity was requested');
      }

      const receivedValueNum = Number(receivedValue);
      const sourceEvent = `receive:${Date.now()}`;

      if (useUniversalFinancePilot) {
        await this.financialPosting.post(
          {
            mode: 'rule',
            tenantId,
            branchId: order.branchId,
            postingDate: new Date(),
            description: `Purchase order ${order.number}`,
            sourceModule: 'purchasing',
            sourceType: 'order',
            sourceId: order.id,
            sourceEvent,
            amounts: { total: receivedValue.toString() },
            dimensions,
          },
          tx,
        );
      } else {
        await this.accounting.createEntry(
          tenantId,
          order.branchId,
          `Purchase order ${order.number}`,
          [
            { accountCode: '1200', debit: receivedValueNum, credit: 0, description: 'Inventory' },
            { accountCode: '2000', debit: 0, credit: receivedValueNum, description: 'AP' },
          ],
          'purchase_order',
          order.id,
          tx,
        );
      }

      await tx.supplier.update({
        where: { id: order.supplierId },
        data: { balance: { increment: receivedValue } },
      });

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          status: allLinesComplete ? 'received' : 'partially_received',
          receivedAt: allLinesComplete ? new Date() : order.receivedAt,
        },
        include: { lines: true, supplier: true },
      });
    });

    await this.audit.log({
      tenantId,
      branchId: order.branchId,
      userId: actorUserId,
      entity: 'purchase_order',
      entityId: order.id,
      action: 'purchasing.order.received',
      newValue: { receivedValue: Number(receivedValue), supplierId: order.supplierId, status: result.status },
    });

    return result;
  }

  async recordSupplierPayment(
    tenantId: string,
    data: {
      branchId: string;
      supplierId: string;
      purchaseOrderId?: string;
      amount: number;
      method?: string;
      paymentDate?: string;
      reference?: string;
      actorUserId?: string;
    },
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: data.supplierId, tenantId, deletedAt: null },
    });
    if (!supplier) {
      throw new BadRequestException('Supplier not found');
    }

    await this.tenantAccess.assertBranchExists(tenantId, data.branchId);

    if (data.purchaseOrderId) {
      const order = await this.prisma.purchaseOrder.findFirst({
        where: { id: data.purchaseOrderId, tenantId, supplierId: data.supplierId },
      });
      if (!order) {
        throw new BadRequestException('Purchase order not found for supplier');
      }
      if (order.status !== 'received') {
        throw new BadRequestException('Purchase order must be received before payment');
      }
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const number = await this.documentNumbers.nextNumber(
        tenantId,
        'SPY',
        'SPY',
        data.branchId,
        tx,
      );

      const created = await tx.supplierPayment.create({
        data: {
          tenantId,
          supplierId: data.supplierId,
          number,
          amount: new Prisma.Decimal(data.amount),
          method: data.method ?? 'cash',
          paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
          reference: data.reference,
        },
      });

      await tx.supplier.update({
        where: { id: data.supplierId },
        data: { balance: { decrement: data.amount } },
      });

      await this.accounting.createEntry(
        tenantId,
        data.branchId,
        `Supplier payment ${number}`,
        [
          { accountCode: '2000', debit: data.amount, credit: 0, description: 'AP' },
          { accountCode: '1000', debit: 0, credit: data.amount, description: 'Cash' },
        ],
        'supplier_payment',
        created.id,
        tx,
      );

      return created;
    });

    await this.audit.log({
      tenantId,
      branchId: data.branchId,
      userId: data.actorUserId,
      entity: 'supplier_payment',
      entityId: payment.id,
      action: 'purchasing.payment.recorded',
      newValue: {
        supplierId: data.supplierId,
        amount: data.amount,
        purchaseOrderId: data.purchaseOrderId ?? null,
      },
    });

    return payment;
  }

  async returnReceivedOrder(
    tenantId: string,
    id: string,
    actorUserId?: string,
  ) {
    const order = await this.findById(tenantId, id);
    if (order.status !== 'received') {
      throw new BadRequestException('Only received purchase orders can be returned');
    }

    const totalNum = Number(order.total);

    const result = await this.prisma.$transaction(async (tx) => {
      for (const line of order.lines) {
        const qty = Number(line.receivedQty);
        if (qty <= 0) continue;

        await this.inventoryLedger.applyMovement(
          {
            tenantId,
            branchId: order.branchId,
            warehouseId: order.warehouseId,
            productId: line.productId,
            movementType: 'purchase_return',
            quantity: -qty,
            unitCost: Number(line.unitPrice),
            referenceType: 'purchase_order_return',
            referenceId: order.id,
          },
          tx,
        );
      }

      await this.accounting.createEntry(
        tenantId,
        order.branchId,
        `Purchase return ${order.number}`,
        [
          { accountCode: '2000', debit: totalNum, credit: 0, description: 'AP reversal' },
          { accountCode: '1200', debit: 0, credit: totalNum, description: 'Inventory reversal' },
        ],
        'purchase_order_return',
        order.id,
        tx,
      );

      await tx.supplier.update({
        where: { id: order.supplierId },
        data: { balance: { decrement: order.total } },
      });

      return tx.purchaseOrder.update({
        where: { id },
        data: { status: 'returned' },
        include: { lines: true, supplier: true },
      });
    });

    await this.audit.log({
      tenantId,
      branchId: order.branchId,
      userId: actorUserId,
      entity: 'purchase_order',
      entityId: order.id,
      action: 'purchasing.order.returned',
      newValue: { total: totalNum },
    });

    return result;
  }
}
