import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConstructionBillingStatus,
  ConstructionContractDirection,
  ConstructionProgressStatus,
  ConstructionSubledgerPartyType,
  Prisma,
} from '../../../../../packages/database/generated/server';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { getAppConfig } from '../../config/app-config';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { PostingDimensions } from '../finance/posting/posting.types';
import { PartyLegacyAdapterService } from '../parties/party-legacy-adapter.service';
import { SalesService } from '../sales/sales.service';
import { ConstructionAdvanceService } from './construction-advance.service';
import { ConstructionContractService } from './construction-contract.service';
import { ConstructionProgressService } from './construction-progress.service';
import { ConstructionRetentionService } from './construction-retention.service';
import { sumBoqAmounts, toBoqDecimal } from './construction-money.util';
import type {
  CreateConstructionBillingDto,
  ListBillingCandidatesQueryDto,
  ListConstructionBillingQueryDto,
  PostConstructionBillingDto,
} from './dto/construction-billing.dto';

const SOURCE_MODULE = 'construction';
const SOURCE_TYPE_PROGRESS = 'progress';

const billingInclude = {
  contract: { select: { id: true, number: true, title: true, partyId: true, direction: true } },
  progress: { select: { id: true, number: true, status: true, periodFrom: true, periodTo: true } },
  boq: { select: { id: true, number: true, revisionNumber: true } },
  project: { select: { id: true, code: true, name: true } },
  salesInvoice: { select: { id: true, number: true, status: true, total: true } },
  lines: { orderBy: { lineNumber: 'asc' as const } },
} satisfies Prisma.ConstructionBillingInclude;

type ProgressItemRow = {
  id: string;
  boqItemId: string;
  lineNumber: number;
  currentPeriodAmount: Prisma.Decimal;
  costCenterId: string | null;
  boqItem: { description: string };
};

@Injectable()
export class ConstructionBillingService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
    private audit: AuditService,
    private contracts: ConstructionContractService,
    private progress: ConstructionProgressService,
    private retention: ConstructionRetentionService,
    private advances: ConstructionAdvanceService,
    private sales: SalesService,
    private partyLegacy: PartyLegacyAdapterService,
  ) {}

  async list(tenantId: string, query: ListConstructionBillingQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ConstructionBillingWhereInput = {
      tenantId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(query.progressId ? { progressId: query.progressId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.constructionBilling.findMany({
        where,
        include: billingInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.constructionBilling.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async listCandidates(tenantId: string, query: ListBillingCandidatesQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const progressWhere: Prisma.ConstructionProgressWhereInput = {
      tenantId,
      status: ConstructionProgressStatus.approved,
      contract: { direction: ConstructionContractDirection.customer },
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.contractId ? { contractId: query.contractId } : {}),
    };

    const approvedProgress = await this.prisma.constructionProgress.findMany({
      where: progressWhere,
      include: {
        contract: { select: { id: true, number: true, title: true } },
        boq: { select: { id: true, number: true, revisionNumber: true } },
        project: { select: { id: true, code: true, name: true } },
        items: {
          orderBy: { lineNumber: 'asc' },
          include: { boqItem: { select: { description: true } } },
        },
      },
      orderBy: [{ periodTo: 'desc' }, { approvedAt: 'desc' }],
    });

    const candidates = [];
    for (const certificate of approvedProgress) {
      const unbilledItems = await this.filterUnbilledItems(tenantId, certificate.items);
      if (unbilledItems.length === 0) {
        continue;
      }
      const grossAmount = sumBoqAmounts(
        unbilledItems.map((item) => item.currentPeriodAmount),
      );
      candidates.push({
        progressId: certificate.id,
        progressNumber: certificate.number,
        periodFrom: certificate.periodFrom,
        periodTo: certificate.periodTo,
        contractId: certificate.contractId,
        contractNumber: certificate.contract.number,
        boqId: certificate.boqId,
        boqNumber: certificate.boq.number,
        boqRevisionNumber: certificate.boq.revisionNumber,
        projectId: certificate.projectId,
        projectCode: certificate.project.code,
        unbilledItemCount: unbilledItems.length,
        unbilledGrossAmount: grossAmount.toFixed(4),
        items: unbilledItems.map((item) => ({
          progressItemId: item.id,
          boqItemId: item.boqItemId,
          description: item.boqItem.description,
          grossAmount: item.currentPeriodAmount.toFixed(4),
          costCenterId: item.costCenterId,
        })),
      });
    }

    const total = candidates.length;
    const items = candidates.slice(skip, skip + limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findById(tenantId: string, id: string) {
    const billing = await this.prisma.constructionBilling.findFirst({
      where: { id, tenantId },
      include: billingInclude,
    });
    if (!billing) {
      throw new NotFoundException('Construction billing not found');
    }
    return billing;
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateConstructionBillingDto,
  ) {
    const progress = await this.prisma.constructionProgress.findFirst({
      where: { id: dto.progressId, tenantId },
      include: {
        items: {
          orderBy: { lineNumber: 'asc' },
          include: { boqItem: { select: { description: true } } },
        },
      },
    });
    if (!progress) {
      throw new NotFoundException('Construction progress not found');
    }
    if (progress.status !== ConstructionProgressStatus.approved) {
      throw new BadRequestException(
        'Billing requires approved progress (not draft, submitted, or rejected)',
      );
    }

    const contract = await this.contracts.findById(tenantId, progress.contractId);
    if (contract.direction !== ConstructionContractDirection.customer) {
      throw new BadRequestException(
        'Sales billing is only supported for customer contracts',
      );
    }

    if (dto.idempotencyKey) {
      const byKey = await this.prisma.constructionBilling.findFirst({
        where: {
          tenantId,
          idempotencyKey: dto.idempotencyKey,
          status: { not: ConstructionBillingStatus.cancelled },
        },
        include: billingInclude,
      });
      if (byKey) {
        return byKey;
      }
    }

    const selectedItems = this.selectProgressItems(progress.items, dto.progressItemIds);
    const sourceEvent = this.buildSourceEvent(selectedItems.map((item) => item.id));

    const existing = await this.prisma.constructionBilling.findFirst({
      where: {
        tenantId,
        sourceModule: SOURCE_MODULE,
        sourceType: SOURCE_TYPE_PROGRESS,
        sourceId: progress.id,
        sourceEvent,
        status: { not: ConstructionBillingStatus.cancelled },
      },
      include: billingInclude,
    });
    if (existing) {
      return existing;
    }

    const unbilledItems = await this.filterUnbilledItems(tenantId, selectedItems);
    if (unbilledItems.length === 0) {
      throw new BadRequestException('No unbilled progress items available');
    }

    const idempotencyKey = dto.idempotencyKey
      ?? `${SOURCE_MODULE}:${SOURCE_TYPE_PROGRESS}:${progress.id}:${sourceEvent}`;

    const amounts = await this.calculateBillingAmounts(
      tenantId,
      contract,
      unbilledItems,
    );

    const number = await this.documentNumbers.nextNumber(
      tenantId,
      'BLG',
      'BLG',
      progress.branchId,
    );

    try {
      const billing = await this.prisma.constructionBilling.create({
        data: {
          tenantId,
          projectId: progress.projectId,
          branchId: progress.branchId,
          contractId: progress.contractId,
          progressId: progress.id,
          boqId: progress.boqId,
          number,
          currency: progress.currency,
          grossAmount: amounts.grossAmount,
          retentionAmount: amounts.retentionAmount,
          advanceRecoveryAmount: amounts.advanceRecoveryAmount,
          netBillableAmount: amounts.netBillableAmount,
          retentionPercent: contract.retentionPercent,
          advanceRecoveryPercent: contract.advancePercent,
          sourceModule: SOURCE_MODULE,
          sourceType: SOURCE_TYPE_PROGRESS,
          sourceId: progress.id,
          sourceEvent,
          idempotencyKey,
          notes: dto.notes?.trim(),
          createdById: userId,
          lines: {
            create: amounts.lines.map((line, index) => ({
              tenantId,
              progressItemId: line.progressItemId,
              boqItemId: line.boqItemId,
              lineNumber: index + 1,
              description: line.description,
              grossAmount: line.grossAmount,
              retentionAmount: line.retentionAmount,
              advanceRecoveryAmount: line.advanceRecoveryAmount,
              netBillableAmount: line.netBillableAmount,
              costCenterId: line.costCenterId,
            })),
          },
        },
        include: billingInclude,
      });

      await this.audit.log({
        tenantId,
        userId,
        branchId: progress.branchId,
        entity: 'construction_billing',
        entityId: billing.id,
        action: 'construction.billing.created',
        newValue: {
          progressId: progress.id,
          contractId: contract.id,
          grossAmount: amounts.grossAmount.toString(),
          netBillableAmount: amounts.netBillableAmount.toString(),
        },
      });

      return billing;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        const raced = await this.prisma.constructionBilling.findFirst({
          where: {
            tenantId,
            sourceModule: SOURCE_MODULE,
            sourceType: SOURCE_TYPE_PROGRESS,
            sourceId: progress.id,
            sourceEvent,
          },
          include: billingInclude,
        });
        if (raced) {
          return raced;
        }
        throw new ConflictException('Duplicate construction billing detected');
      }
      throw error;
    }
  }

  async approve(tenantId: string, id: string, userId: string) {
    const existing = await this.findById(tenantId, id);
    if (existing.status === ConstructionBillingStatus.approved) {
      return existing;
    }
    if (existing.status !== ConstructionBillingStatus.draft) {
      throw new BadRequestException(
        `Billing in ${existing.status} status cannot be approved`,
      );
    }

    const updated = await this.prisma.constructionBilling.updateMany({
      where: {
        id,
        tenantId,
        status: ConstructionBillingStatus.draft,
      },
      data: {
        status: ConstructionBillingStatus.approved,
        approvedAt: new Date(),
        approvedById: userId,
      },
    });

    if (updated.count === 0) {
      throw new ConflictException('Billing approve conflict — refresh and retry');
    }

    const billing = await this.findById(tenantId, id);

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_billing',
      entityId: billing.id,
      action: 'construction.billing.approved',
    });

    return billing;
  }

  async post(
    tenantId: string,
    id: string,
    userId: string,
    dto: PostConstructionBillingDto = {},
  ) {
    if (!getAppConfig().universalFinanceSalesPilotEnabled) {
      throw new BadRequestException(
        'Construction billing requires Universal Finance sales posting (FinancialPostingService)',
      );
    }

    const billing = await this.findById(tenantId, id);
    if (billing.status === ConstructionBillingStatus.posted) {
      return billing;
    }
    if (billing.status !== ConstructionBillingStatus.approved) {
      throw new BadRequestException('Only approved billings can be posted');
    }
    if (billing.netBillableAmount.lte(0)) {
      throw new BadRequestException('Net billable amount must be positive');
    }

    const contract = await this.contracts.findById(tenantId, billing.contractId);
    const customer = await this.partyLegacy.resolveLinkedCustomerForSales(
      tenantId,
      contract.partyId,
    );

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { tenantId, branchId: billing.branchId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!warehouse) {
      throw new BadRequestException('No active warehouse found for billing branch');
    }

    const dimensions = await this.resolvePostingDimensions(
      tenantId,
      billing,
      dto,
    );

    const invoiceLines = billing.lines.map((line) => ({
      description: `${line.description} (Progress billing ${billing.number})`,
      quantity: 1,
      unitPrice: Number(line.netBillableAmount),
    }));

    const invoice = await this.sales.createInvoice(tenantId, {
      branchId: billing.branchId,
      customerId: customer.id,
      warehouseId: warehouse.id,
      notes: `Construction billing ${billing.number} — progress ${billing.progress?.number ?? billing.progressId}`,
      lines: invoiceLines,
      createdById: userId,
    });

    const claimed = await this.prisma.constructionBilling.updateMany({
      where: {
        id,
        tenantId,
        status: ConstructionBillingStatus.approved,
        salesInvoiceId: null,
      },
      data: { salesInvoiceId: invoice.id },
    });

    if (claimed.count === 0) {
      const current = await this.findById(tenantId, id);
      if (current.status === ConstructionBillingStatus.posted && current.salesInvoiceId) {
        return current;
      }
      throw new ConflictException('Billing post conflict — refresh and retry');
    }

    try {
      await this.sales.postInvoice(tenantId, invoice.id, dimensions);

      if (billing.advanceRecoveryAmount.gt(0)) {
        await this.advances.recordRecovered(tenantId, userId, {
          contractId: billing.contractId,
          partyType: ConstructionSubledgerPartyType.customer,
          amount: billing.advanceRecoveryAmount.toString(),
          notes: `Recovered via billing ${billing.number}`,
        });
      }

      const posted = await this.prisma.constructionBilling.update({
        where: { id },
        data: {
          status: ConstructionBillingStatus.posted,
          postedAt: new Date(),
          postedById: userId,
        },
        include: billingInclude,
      });

      await this.audit.log({
        tenantId,
        userId,
        branchId: billing.branchId,
        entity: 'construction_billing',
        entityId: billing.id,
        action: 'construction.billing.posted',
        newValue: {
          salesInvoiceId: invoice.id,
          netBillableAmount: billing.netBillableAmount.toString(),
          retentionAmount: billing.retentionAmount.toString(),
          advanceRecoveryAmount: billing.advanceRecoveryAmount.toString(),
        },
      });

      return posted;
    } catch (error) {
      await this.prisma.constructionBilling.updateMany({
        where: {
          id,
          tenantId,
          status: ConstructionBillingStatus.approved,
          salesInvoiceId: invoice.id,
        },
        data: { salesInvoiceId: null },
      });
      throw error;
    }
  }

  async cancel(tenantId: string, id: string, userId: string) {
    const existing = await this.findById(tenantId, id);
    if (existing.status === ConstructionBillingStatus.cancelled) {
      return existing;
    }
    if (existing.status === ConstructionBillingStatus.posted) {
      throw new BadRequestException('Posted billings cannot be cancelled');
    }

    const billing = await this.prisma.constructionBilling.update({
      where: { id },
      data: {
        status: ConstructionBillingStatus.cancelled,
        cancelledAt: new Date(),
        cancelledById: userId,
      },
      include: billingInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_billing',
      entityId: billing.id,
      action: 'construction.billing.cancelled',
    });

    return billing;
  }

  private selectProgressItems(
    items: ProgressItemRow[],
    progressItemIds?: string[],
  ): ProgressItemRow[] {
    if (!progressItemIds?.length) {
      return items;
    }
    const selected = items.filter((item) => progressItemIds.includes(item.id));
    if (selected.length !== progressItemIds.length) {
      throw new BadRequestException('One or more progress items are invalid');
    }
    return selected;
  }

  private async filterUnbilledItems<T extends { id: string }>(
    tenantId: string,
    items: T[],
  ): Promise<T[]> {
    if (items.length === 0) {
      return [];
    }

    const billedLines = await this.prisma.constructionBillingLine.findMany({
      where: {
        tenantId,
        progressItemId: { in: items.map((item) => item.id) },
        billing: {
          status: {
            in: [
              ConstructionBillingStatus.draft,
              ConstructionBillingStatus.approved,
              ConstructionBillingStatus.posted,
            ],
          },
        },
      },
      select: { progressItemId: true },
    });

    const billedIds = new Set(
      billedLines
        .map((line) => line.progressItemId)
        .filter((id): id is string => Boolean(id)),
    );

    return items.filter((item) => !billedIds.has(item.id));
  }

  private buildSourceEvent(progressItemIds: string[]): string {
    if (progressItemIds.length === 0) {
      return 'bill:empty';
    }
    const sorted = [...progressItemIds].sort();
    return `bill:${sorted.join(',')}`;
  }

  private async calculateBillingAmounts(
    tenantId: string,
    contract: {
      id: string;
      retentionPercent: Prisma.Decimal | null;
      retentionCap: Prisma.Decimal | null;
      advancePercent: Prisma.Decimal | null;
      advanceAmount: Prisma.Decimal | null;
    },
    items: ProgressItemRow[],
  ) {
    const retentionBalance = await this.retention.getBalance(
      tenantId,
      contract.id,
      ConstructionSubledgerPartyType.customer,
    );
    const advanceBalance = await this.advances.getBalance(
      tenantId,
      contract.id,
      ConstructionSubledgerPartyType.customer,
    );

    let grossTotal = new Prisma.Decimal(0);
    let retentionTotal = new Prisma.Decimal(0);
    let advanceTotal = new Prisma.Decimal(0);
    let netTotal = new Prisma.Decimal(0);

    const lines = items.map((item) => {
      const grossAmount = toBoqDecimal(item.currentPeriodAmount, 'grossAmount');
      const retentionAmount = this.retention.calculateHoldAmount(
        contract,
        grossAmount,
        retentionBalance.add(retentionTotal),
      );
      const remainingGross = grossAmount.sub(retentionAmount);
      const advanceRecoveryAmount = this.advances.calculateRecoverableFromProgress(
        contract,
        remainingGross,
        advanceBalance.sub(advanceTotal),
      );
      const netBillableAmount = grossAmount
        .sub(retentionAmount)
        .sub(advanceRecoveryAmount)
        .toDecimalPlaces(4);

      grossTotal = grossTotal.add(grossAmount);
      retentionTotal = retentionTotal.add(retentionAmount);
      advanceTotal = advanceTotal.add(advanceRecoveryAmount);
      netTotal = netTotal.add(netBillableAmount);

      return {
        progressItemId: item.id,
        boqItemId: item.boqItemId,
        description: item.boqItem.description,
        grossAmount,
        retentionAmount,
        advanceRecoveryAmount,
        netBillableAmount,
        costCenterId: item.costCenterId,
      };
    });

    return {
      grossAmount: grossTotal,
      retentionAmount: retentionTotal,
      advanceRecoveryAmount: advanceTotal,
      netBillableAmount: netTotal,
      lines,
    };
  }

  private async resolvePostingDimensions(
    tenantId: string,
    billing: Awaited<ReturnType<typeof this.findById>>,
    dto: PostConstructionBillingDto,
  ): Promise<PostingDimensions> {
    const projectId = dto.projectId ?? billing.projectId;
    let costCenterId = dto.costCenterId;

    if (!costCenterId) {
      const lineWithCc = billing.lines.find((line) => line.costCenterId);
      costCenterId = lineWithCc?.costCenterId ?? undefined;
    }

    if (costCenterId) {
      const costCenter = await this.prisma.costCenter.findFirst({
        where: { id: costCenterId, tenantId },
        select: { projectId: true },
      });
      if (!costCenter) {
        throw new BadRequestException('Cost center not found');
      }
      if (costCenter.projectId && costCenter.projectId !== projectId) {
        throw new BadRequestException('Cost center does not belong to billing project');
      }
    }

    return {
      projectId,
      ...(costCenterId ? { costCenterId } : {}),
    };
  }
}
