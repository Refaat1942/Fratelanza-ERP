import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConstructionAdvanceEntryType,
  ConstructionBillingStatus,
  ConstructionBoqStatus,
  ConstructionContractStatus,
  ConstructionCostCategory,
  ConstructionProgressStatus,
  ConstructionRetentionDirection,
  ConstructionVariationStatus,
  Prisma,
} from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';
import { ConstructionCostingService } from './construction-costing.service';
import { sumBoqAmounts, toBoqDecimal } from './construction-money.util';
import type {
  ConstructionActualCostReportDto,
  ConstructionAdvanceReportDto,
  ConstructionBoqStatusReportDto,
  ConstructionContractSummaryReportDto,
  ConstructionCostByCostCenterReportDto,
  ConstructionProgressVsBoqReportDto,
  ConstructionProfitabilityReportDto,
  ConstructionProjectSummaryReportDto,
  ConstructionRemainingWorkReportDto,
  ConstructionReportingFiltersDto,
  ConstructionReportingQueryDto,
  ConstructionRetentionReportDto,
  ConstructionRevenueBillingReportDto,
  ConstructionRevenueBillingStatusTotalsDto,
  ConstructionVariationImpactReportDto,
} from './dto/construction-reporting.dto';
import type {
  ConstructionCostCategoryTotalsDto,
  ConstructionCostingQueryDto,
} from './dto/construction-costing.dto';

const ZERO = new Prisma.Decimal(0);
const ALL_CATEGORIES = Object.values(ConstructionCostCategory);

@Injectable()
export class ConstructionReportingService {
  constructor(
    private prisma: PrismaService,
    private costing: ConstructionCostingService,
  ) {}

  async getProjectSummary(
    tenantId: string,
    query: ConstructionReportingQueryDto,
  ): Promise<ConstructionProjectSummaryReportDto> {
    const projectId = this.requireProjectId(query);
    await this.assertProjectExists(tenantId, projectId);

    const filters = this.toFilters(query);
    const [project, profile, counts, snapshot] = await Promise.all([
      this.prisma.project.findFirstOrThrow({
        where: { id: projectId, tenantId, deletedAt: null },
        select: { id: true, code: true, name: true, status: true },
      }),
      this.prisma.constructionProjectProfile.findFirst({
        where: { tenantId, projectId },
        select: { id: true },
      }),
      this.loadProjectCounts(tenantId, projectId, filters),
      this.costing.getProjectCosting(
        tenantId,
        projectId,
        this.toCostingQuery(query),
      ),
    ]);

    return {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      projectStatus: project.status,
      hasConstructionProfile: profile !== null,
      counts,
      snapshot: {
        planned: snapshot.planned,
        contractual: snapshot.contractual,
        executedValue: snapshot.executedValue,
        actualCost: snapshot.actualCost,
        profitability: snapshot.profitability,
        remainingBoq: snapshot.remainingBoq,
      },
      filters,
    };
  }

  async getContractSummary(
    tenantId: string,
    query: ConstructionReportingQueryDto,
  ): Promise<ConstructionContractSummaryReportDto> {
    if (!query.projectId && !query.contractId) {
      throw new BadRequestException('projectId or contractId is required');
    }

    const filters = this.toFilters(query);
    const where: Prisma.ConstructionContractWhereInput = {
      tenantId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.contractId ? { id: query.contractId } : {}),
      ...(query.status
        ? { status: query.status as ConstructionContractStatus }
        : {}),
    };

    if (query.projectId) {
      await this.assertProjectExists(tenantId, query.projectId);
    }

    const contracts = await this.prisma.constructionContract.findMany({
      where,
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        direction: true,
        originalValue: true,
        revisedValue: true,
        party: { select: { displayName: true } },
        boqs: {
          where: { status: ConstructionBoqStatus.approved },
          select: { status: true, revisionNumber: true },
          orderBy: { revisionNumber: 'desc' },
          take: 1,
        },
        _count: {
          select: {
            progress: true,
            variations: true,
            billings: true,
            boqs: true,
          },
        },
      },
      orderBy: [{ number: 'asc' }],
    });

    if (query.contractId && contracts.length === 0) {
      throw new NotFoundException('Construction contract not found');
    }

    return {
      filters,
      contracts: contracts.map((contract) => ({
        contractId: contract.id,
        contractNumber: contract.number,
        contractTitle: contract.title,
        status: contract.status,
        direction: contract.direction,
        partyName: contract.party.displayName,
        originalValue: this.decimalToString(contract.originalValue),
        revisedValue: contract.revisedValue
          ? this.decimalToString(contract.revisedValue)
          : null,
        approvedBoqCount: contract._count.boqs,
        latestBoqStatus: contract.boqs[0]?.status ?? null,
        progressCertificateCount: contract._count.progress,
        variationCount: contract._count.variations,
        billingCount: contract._count.billings,
      })),
    };
  }

  async getBoqStatus(
    tenantId: string,
    query: ConstructionReportingQueryDto,
  ): Promise<ConstructionBoqStatusReportDto> {
    if (!query.projectId && !query.contractId) {
      throw new BadRequestException('projectId or contractId is required');
    }

    if (query.projectId) {
      await this.assertProjectExists(tenantId, query.projectId);
    }

    const filters = this.toFilters(query);
    const boqs = await this.prisma.constructionBoq.findMany({
      where: {
        tenantId,
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.contractId ? { contractId: query.contractId } : {}),
        ...(query.status ? { status: query.status as ConstructionBoqStatus } : {}),
      },
      select: {
        id: true,
        number: true,
        revisionNumber: true,
        status: true,
        contractId: true,
        totalOriginalAmount: true,
        approvedAt: true,
        contract: { select: { number: true } },
        _count: { select: { items: true } },
      },
      orderBy: [{ contractId: 'asc' }, { revisionNumber: 'desc' }],
    });

    return {
      filters,
      boqs: boqs.map((boq) => ({
        boqId: boq.id,
        boqNumber: boq.number,
        revisionNumber: boq.revisionNumber,
        status: boq.status,
        contractId: boq.contractId,
        contractNumber: boq.contract.number,
        totalOriginalAmount: this.decimalToString(boq.totalOriginalAmount),
        itemCount: boq._count.items,
        approvedAt: boq.approvedAt?.toISOString() ?? null,
      })),
    };
  }

  async getProgressVsBoq(
    tenantId: string,
    query: ConstructionReportingQueryDto,
  ): Promise<ConstructionProgressVsBoqReportDto> {
    const projectId = this.requireProjectId(query);
    await this.assertProjectExists(tenantId, projectId);

    const filters = this.toFilters(query);
    const contractScope = await this.resolveContractBoqScope(tenantId, query);

    const boqItems = await this.prisma.constructionBoqItem.findMany({
      where: {
        tenantId,
        boqId: contractScope.boqId,
        ...(query.costCenterId ? { costCenterId: query.costCenterId } : {}),
      },
      select: {
        id: true,
        description: true,
        costCenterId: true,
        plannedQuantity: true,
        originalAmount: true,
      },
      orderBy: { lineNumber: 'asc' },
    });

    const boqItemIds = boqItems.map((item) => item.id);
    const progressItems =
      boqItemIds.length === 0
        ? []
        : await this.prisma.constructionProgressItem.findMany({
            where: {
              tenantId,
              boqItemId: { in: boqItemIds },
              progress: {
                boqId: contractScope.boqId,
                status: ConstructionProgressStatus.approved,
              },
            },
            orderBy: [
              { progress: { periodTo: 'desc' } },
              { progress: { approvedAt: 'desc' } },
            ],
            select: {
              boqItemId: true,
              cumulativeQuantity: true,
              cumulativeAmount: true,
            },
          });

    const latestProgressByItem = new Map<
      string,
      { cumulativeQuantity: Prisma.Decimal; cumulativeAmount: Prisma.Decimal }
    >();
    for (const item of progressItems) {
      if (!latestProgressByItem.has(item.boqItemId)) {
        latestProgressByItem.set(item.boqItemId, {
          cumulativeQuantity: item.cumulativeQuantity,
          cumulativeAmount: item.cumulativeAmount,
        });
      }
    }

    const items = boqItems.map((boqItem) => {
      const progress = latestProgressByItem.get(boqItem.id);
      const executedQuantity = progress?.cumulativeQuantity ?? ZERO;
      const executedValue = progress?.cumulativeAmount ?? ZERO;
      const remainingQuantity = boqItem.plannedQuantity.sub(executedQuantity);
      const remainingValue = boqItem.originalAmount.sub(executedValue);
      const safeRemainingValue = remainingValue.lt(0) ? ZERO : remainingValue;
      const completionPercent = boqItem.originalAmount.gt(0)
        ? executedValue
            .div(boqItem.originalAmount)
            .mul(100)
            .toDecimalPlaces(4)
            .toFixed(4)
        : null;

      return {
        boqItemId: boqItem.id,
        description: boqItem.description,
        costCenterId: boqItem.costCenterId,
        plannedQuantity: this.decimalToString(boqItem.plannedQuantity),
        plannedValue: this.decimalToString(boqItem.originalAmount),
        executedQuantity: this.decimalToString(executedQuantity),
        executedValue: this.decimalToString(executedValue),
        completionPercent,
        remainingQuantity: this.decimalToString(
          remainingQuantity.lt(0) ? ZERO : remainingQuantity,
        ),
        remainingValue: this.decimalToString(safeRemainingValue),
      };
    });

    const totalPlannedValue = sumBoqAmounts(
      boqItems.map((item) => item.originalAmount),
    );
    const totalExecutedValue = sumBoqAmounts(
      items.map((item) => toBoqDecimal(item.executedValue, 'executedValue')),
    );
    const totalRemainingValue = sumBoqAmounts(
      items.map((item) => toBoqDecimal(item.remainingValue, 'remainingValue')),
    );

    return {
      filters,
      contractId: contractScope.contractId,
      boqId: contractScope.boqId,
      totalPlannedValue: this.decimalToString(totalPlannedValue),
      totalExecutedValue: this.decimalToString(totalExecutedValue),
      totalRemainingValue: this.decimalToString(totalRemainingValue),
      items,
    };
  }

  async getVariationImpact(
    tenantId: string,
    query: ConstructionReportingQueryDto,
  ): Promise<ConstructionVariationImpactReportDto> {
    if (!query.projectId && !query.contractId) {
      throw new BadRequestException('projectId or contractId is required');
    }

    if (query.projectId) {
      await this.assertProjectExists(tenantId, query.projectId);
    }

    const filters = this.toFilters(query);
    const variations = await this.prisma.constructionVariation.findMany({
      where: {
        tenantId,
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.contractId ? { contractId: query.contractId } : {}),
        ...(query.status
          ? { status: query.status as ConstructionVariationStatus }
          : {}),
      },
      select: {
        id: true,
        number: true,
        status: true,
        contractId: true,
        boqId: true,
        totalAmountDelta: true,
        approvedAt: true,
        contract: { select: { number: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    let approvedDeltaTotal = ZERO;
    let pendingDeltaTotal = ZERO;
    for (const variation of variations) {
      if (variation.status === ConstructionVariationStatus.approved) {
        approvedDeltaTotal = approvedDeltaTotal.add(variation.totalAmountDelta);
      } else if (
        variation.status === ConstructionVariationStatus.submitted ||
        variation.status === ConstructionVariationStatus.draft
      ) {
        pendingDeltaTotal = pendingDeltaTotal.add(variation.totalAmountDelta);
      }
    }

    return {
      filters,
      approvedDeltaTotal: this.decimalToString(approvedDeltaTotal),
      pendingDeltaTotal: this.decimalToString(pendingDeltaTotal),
      variations: variations.map((variation) => ({
        variationId: variation.id,
        variationNumber: variation.number,
        status: variation.status,
        contractId: variation.contractId,
        contractNumber: variation.contract.number,
        boqId: variation.boqId,
        totalAmountDelta: this.decimalToString(variation.totalAmountDelta),
        approvedAt: variation.approvedAt?.toISOString() ?? null,
      })),
    };
  }

  async getActualCost(
    tenantId: string,
    query: ConstructionReportingQueryDto,
  ): Promise<ConstructionActualCostReportDto> {
    const projectId = this.requireProjectId(query);
    await this.assertProjectExists(tenantId, projectId);

    const filters = this.toFilters(query);
    const where = this.buildCostEntryWhere(tenantId, projectId, query);
    const [groups, entryCount] = await Promise.all([
      this.prisma.constructionCostEntry.groupBy({
        by: ['category'],
        where,
        _sum: { amount: true },
      }),
      this.prisma.constructionCostEntry.count({ where }),
    ]);

    return {
      filters,
      byCategory: this.toCategoryTotals(groups),
      entryCount,
    };
  }

  async getCostByCostCenter(
    tenantId: string,
    query: ConstructionReportingQueryDto,
  ): Promise<ConstructionCostByCostCenterReportDto> {
    const projectId = this.requireProjectId(query);
    await this.assertProjectExists(tenantId, projectId);

    const filters = this.toFilters(query);
    const where = this.buildCostEntryWhere(tenantId, projectId, query);
    const groups = await this.prisma.constructionCostEntry.groupBy({
      by: ['costCenterId', 'category'],
      where,
      _sum: { amount: true },
    });

    const costCenterIds = [
      ...new Set(
        groups
          .map((group) => group.costCenterId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const costCenters =
      costCenterIds.length === 0
        ? []
        : await this.prisma.costCenter.findMany({
            where: { tenantId, id: { in: costCenterIds } },
            select: { id: true, code: true, name: true },
          });
    const costCenterById = new Map(costCenters.map((cc) => [cc.id, cc]));

    const byCostCenter = new Map<string, Map<ConstructionCostCategory, Prisma.Decimal>>();
    const unassigned = new Map<ConstructionCostCategory, Prisma.Decimal>();
    for (const category of ALL_CATEGORIES) {
      unassigned.set(category, ZERO);
    }

    for (const group of groups) {
      const category = group.category;
      const amount = group._sum.amount ?? ZERO;
      if (!group.costCenterId) {
        unassigned.set(category, (unassigned.get(category) ?? ZERO).add(amount));
        continue;
      }
      const bucket =
        byCostCenter.get(group.costCenterId) ??
        new Map(
          ALL_CATEGORIES.map((cat) => [cat, ZERO] as const),
        );
      bucket.set(category, (bucket.get(category) ?? ZERO).add(amount));
      byCostCenter.set(group.costCenterId, bucket);
    }

    return {
      filters,
      costCenters: [...byCostCenter.entries()].map(([costCenterId, amounts]) => {
        const cc = costCenterById.get(costCenterId)!;
        return {
          costCenterId,
          costCenterCode: cc.code,
          costCenterName: cc.name,
          byCategory: this.mapToCategoryTotals(amounts),
        };
      }),
      unassigned: this.mapToCategoryTotals(unassigned),
    };
  }

  async getRevenueBilling(
    tenantId: string,
    query: ConstructionReportingQueryDto,
  ): Promise<ConstructionRevenueBillingReportDto> {
    if (!query.projectId && !query.contractId) {
      throw new BadRequestException('projectId or contractId is required');
    }

    if (query.projectId) {
      await this.assertProjectExists(tenantId, query.projectId);
    }

    const filters = this.toFilters(query);
    const where: Prisma.ConstructionBillingWhereInput = {
      tenantId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(query.status
        ? { status: query.status as ConstructionBillingStatus }
        : {}),
      ...(this.buildDateRangeFilter(query, 'createdAt') ?? {}),
    };

    const billings = await this.prisma.constructionBilling.findMany({
      where,
      select: {
        id: true,
        number: true,
        status: true,
        contractId: true,
        grossAmount: true,
        retentionAmount: true,
        advanceRecoveryAmount: true,
        netBillableAmount: true,
        postedAt: true,
        contract: { select: { number: true } },
        salesInvoice: { select: { id: true, number: true, total: true, status: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const byStatus = new Map<string, ConstructionRevenueBillingStatusTotalsDto>();
    const totals = this.emptyBillingTotals();

    for (const billing of billings) {
      const bucket =
        byStatus.get(billing.status) ?? this.emptyBillingTotals();
      this.accumulateBillingTotals(bucket, billing);
      byStatus.set(billing.status, bucket);
      this.accumulateBillingTotals(totals, billing);
    }

    return {
      filters,
      totals,
      byStatus: Object.fromEntries(byStatus.entries()),
      billings: billings.map((billing) => ({
        billingId: billing.id,
        billingNumber: billing.number,
        status: billing.status,
        contractId: billing.contractId,
        contractNumber: billing.contract.number,
        grossAmount: this.decimalToString(billing.grossAmount),
        netBillableAmount: this.decimalToString(billing.netBillableAmount),
        salesInvoiceId: billing.salesInvoice?.id ?? null,
        salesInvoiceNumber: billing.salesInvoice?.number ?? null,
        salesInvoiceTotal: billing.salesInvoice
          ? this.decimalToString(billing.salesInvoice.total)
          : null,
        postedAt: billing.postedAt?.toISOString() ?? null,
      })),
    };
  }

  async getRetention(
    tenantId: string,
    query: ConstructionReportingQueryDto,
  ): Promise<ConstructionRetentionReportDto> {
    if (!query.projectId && !query.contractId) {
      throw new BadRequestException('projectId or contractId is required');
    }

    if (query.projectId) {
      await this.assertProjectExists(tenantId, query.projectId);
    }

    const filters = this.toFilters(query);
    const entries = await this.prisma.constructionRetentionEntry.findMany({
      where: {
        tenantId,
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.contractId ? { contractId: query.contractId } : {}),
      },
      select: {
        contractId: true,
        partyType: true,
        direction: true,
        amount: true,
        balanceAfter: true,
        createdAt: true,
        contract: { select: { number: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return this.buildRetentionReport(filters, entries);
  }

  async getAdvances(
    tenantId: string,
    query: ConstructionReportingQueryDto,
  ): Promise<ConstructionAdvanceReportDto> {
    if (!query.projectId && !query.contractId) {
      throw new BadRequestException('projectId or contractId is required');
    }

    if (query.projectId) {
      await this.assertProjectExists(tenantId, query.projectId);
    }

    const filters = this.toFilters(query);
    const entries = await this.prisma.constructionAdvanceEntry.findMany({
      where: {
        tenantId,
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.contractId ? { contractId: query.contractId } : {}),
      },
      select: {
        contractId: true,
        partyType: true,
        entryType: true,
        amount: true,
        balanceAfter: true,
        createdAt: true,
        contract: { select: { number: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return this.buildAdvanceReport(filters, entries);
  }

  async getProfitability(
    tenantId: string,
    query: ConstructionReportingQueryDto,
  ): Promise<ConstructionProfitabilityReportDto> {
    const filters = this.toFilters(query);
    const costingQuery = this.toCostingQuery(query);

    let snapshot;
    if (query.contractId) {
      const contractCosting = await this.costing.getContractCosting(
        tenantId,
        query.contractId,
      );
      snapshot = contractCosting;
    } else {
      const projectId = this.requireProjectId(query);
      snapshot = await this.costing.getProjectCosting(
        tenantId,
        projectId,
        costingQuery,
      );
    }

    const financial = query.projectId
      ? await this.loadFinancialLayer(tenantId, query.projectId, query)
      : undefined;

    return {
      filters,
      projectId: query.projectId ?? null,
      contractId: query.contractId ?? null,
      planned: snapshot.planned,
      contractual: snapshot.contractual,
      executedValue: snapshot.executedValue,
      actualCost: snapshot.actualCost,
      profitability: snapshot.profitability,
      remainingBoq: snapshot.remainingBoq,
      financial,
    };
  }

  async getRemainingWork(
    tenantId: string,
    query: ConstructionReportingQueryDto,
  ): Promise<ConstructionRemainingWorkReportDto> {
    const filters = this.toFilters(query);
    const costingQuery = this.toCostingQuery(query);

    if (query.contractId) {
      const contractCosting = await this.costing.getContractCosting(
        tenantId,
        query.contractId,
      );
      return {
        filters,
        projectId: null,
        contractId: query.contractId,
        remainingBoq: contractCosting.remainingBoq,
        profitability: contractCosting.profitability,
      };
    }

    const projectId = this.requireProjectId(query);
    const projectCosting = await this.costing.getProjectCosting(
      tenantId,
      projectId,
      costingQuery,
    );

    return {
      filters,
      projectId,
      contractId: query.contractId ?? null,
      remainingBoq: projectCosting.remainingBoq,
      profitability: projectCosting.profitability,
    };
  }

  private async loadProjectCounts(
    tenantId: string,
    projectId: string,
    filters: ConstructionReportingFiltersDto,
  ) {
    const contractFilter = filters.contractId ? { contractId: filters.contractId } : {};
    const [contracts, boqs, progress, variations, costEntries, billings, materialIssues] =
      await Promise.all([
        this.prisma.constructionContract.count({ where: { tenantId, projectId } }),
        this.prisma.constructionBoq.count({
          where: { tenantId, projectId, ...contractFilter },
        }),
        this.prisma.constructionProgress.count({
          where: { tenantId, projectId, ...contractFilter },
        }),
        this.prisma.constructionVariation.count({
          where: { tenantId, projectId, ...contractFilter },
        }),
        this.prisma.constructionCostEntry.count({ where: { tenantId, projectId } }),
        this.prisma.constructionBilling.count({
          where: { tenantId, projectId, ...contractFilter },
        }),
        this.prisma.constructionMaterialIssue.count({ where: { tenantId, projectId } }),
      ]);

    return {
      contracts,
      boqs,
      progressCertificates: progress,
      variations,
      costEntries,
      billings,
      materialIssues,
    };
  }

  private async resolveContractBoqScope(
    tenantId: string,
    query: ConstructionReportingQueryDto,
  ): Promise<{ contractId: string; boqId: string }> {
    if (query.contractId) {
      const contract = await this.prisma.constructionContract.findFirst({
        where: { id: query.contractId, tenantId },
        select: { id: true, projectId: true },
      });
      if (!contract) {
        throw new NotFoundException('Construction contract not found');
      }
      if (query.projectId && contract.projectId !== query.projectId) {
        throw new BadRequestException('Contract does not belong to the specified project');
      }
    }

    const latestBoq = await this.prisma.constructionBoq.findFirst({
      where: {
        tenantId,
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.contractId ? { contractId: query.contractId } : {}),
        status: ConstructionBoqStatus.approved,
      },
      orderBy: [{ contractId: 'asc' }, { revisionNumber: 'desc' }],
      select: { id: true, contractId: true },
    });

    if (!latestBoq) {
      throw new NotFoundException('No approved BOQ found for the requested scope');
    }

    return { contractId: latestBoq.contractId, boqId: latestBoq.id };
  }

  private buildCostEntryWhere(
    tenantId: string,
    projectId: string,
    query: ConstructionReportingQueryDto,
  ): Prisma.ConstructionCostEntryWhereInput {
    return {
      tenantId,
      projectId,
      ...(query.costCenterId ? { costCenterId: query.costCenterId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(this.buildDateRangeFilter(query, 'occurredAt') ?? {}),
    };
  }

  private buildDateRangeFilter(
    query: ConstructionReportingQueryDto,
    field: 'occurredAt' | 'createdAt',
  ): Record<string, unknown> | undefined {
    if (!query.dateFrom && !query.dateTo) {
      return undefined;
    }
    return {
      [field]: {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      },
    };
  }

  private toCategoryTotals(
    groups: Array<{
      category: ConstructionCostCategory;
      _sum: { amount: Prisma.Decimal | null };
    }>,
  ): ConstructionCostCategoryTotalsDto {
    const amounts = new Map<ConstructionCostCategory, Prisma.Decimal>();
    for (const category of ALL_CATEGORIES) {
      amounts.set(category, ZERO);
    }
    for (const group of groups) {
      amounts.set(group.category, group._sum.amount ?? ZERO);
    }
    return this.mapToCategoryTotals(amounts);
  }

  private mapToCategoryTotals(
    amounts: Map<ConstructionCostCategory, Prisma.Decimal>,
  ): ConstructionCostCategoryTotalsDto {
    const categoryValues = ALL_CATEGORIES.map((category) => amounts.get(category)!);
    const total = sumBoqAmounts(categoryValues);
    return {
      material: this.decimalToString(amounts.get(ConstructionCostCategory.material)!),
      labor: this.decimalToString(amounts.get(ConstructionCostCategory.labor)!),
      subcontract: this.decimalToString(
        amounts.get(ConstructionCostCategory.subcontract)!,
      ),
      equipment: this.decimalToString(amounts.get(ConstructionCostCategory.equipment)!),
      other: this.decimalToString(amounts.get(ConstructionCostCategory.other)!),
      total: this.decimalToString(total),
    };
  }

  private emptyBillingTotals(): ConstructionRevenueBillingStatusTotalsDto {
    return {
      count: 0,
      grossAmount: this.decimalToString(ZERO),
      retentionAmount: this.decimalToString(ZERO),
      advanceRecoveryAmount: this.decimalToString(ZERO),
      netBillableAmount: this.decimalToString(ZERO),
      postedSalesInvoiceTotal: this.decimalToString(ZERO),
    };
  }

  private accumulateBillingTotals(
    bucket: ConstructionRevenueBillingStatusTotalsDto,
    billing: {
      grossAmount: Prisma.Decimal;
      retentionAmount: Prisma.Decimal;
      advanceRecoveryAmount: Prisma.Decimal;
      netBillableAmount: Prisma.Decimal;
      salesInvoice: { total: Prisma.Decimal } | null;
    },
  ) {
    bucket.count += 1;
    bucket.grossAmount = this.decimalToString(
      toBoqDecimal(bucket.grossAmount, 'grossAmount').add(billing.grossAmount),
    );
    bucket.retentionAmount = this.decimalToString(
      toBoqDecimal(bucket.retentionAmount, 'retentionAmount').add(
        billing.retentionAmount,
      ),
    );
    bucket.advanceRecoveryAmount = this.decimalToString(
      toBoqDecimal(bucket.advanceRecoveryAmount, 'advanceRecoveryAmount').add(
        billing.advanceRecoveryAmount,
      ),
    );
    bucket.netBillableAmount = this.decimalToString(
      toBoqDecimal(bucket.netBillableAmount, 'netBillableAmount').add(
        billing.netBillableAmount,
      ),
    );
    if (billing.salesInvoice) {
      bucket.postedSalesInvoiceTotal = this.decimalToString(
        toBoqDecimal(bucket.postedSalesInvoiceTotal, 'postedSalesInvoiceTotal').add(
          billing.salesInvoice.total,
        ),
      );
    }
  }

  private buildRetentionReport(
    filters: ConstructionReportingFiltersDto,
    entries: Array<{
      contractId: string;
      partyType: string;
      direction: ConstructionRetentionDirection;
      amount: Prisma.Decimal;
      balanceAfter: Prisma.Decimal;
      createdAt: Date;
      contract: { number: string };
    }>,
  ): ConstructionRetentionReportDto {
    type Bucket = {
      contractNumber: string;
      totalHeld: Prisma.Decimal;
      totalReleased: Prisma.Decimal;
      latestBalance: Prisma.Decimal | null;
      latestAt: Date | null;
    };

    const buckets = new Map<string, Bucket>();
    for (const entry of entries) {
      const key = `${entry.contractId}:${entry.partyType}`;
      const bucket =
        buckets.get(key) ??
        ({
          contractNumber: entry.contract.number,
          totalHeld: ZERO,
          totalReleased: ZERO,
          latestBalance: null,
          latestAt: null,
        } satisfies Bucket);

      if (entry.direction === ConstructionRetentionDirection.hold) {
        bucket.totalHeld = bucket.totalHeld.add(entry.amount);
      } else {
        bucket.totalReleased = bucket.totalReleased.add(entry.amount);
      }

      if (!bucket.latestAt || entry.createdAt > bucket.latestAt) {
        bucket.latestAt = entry.createdAt;
        bucket.latestBalance = entry.balanceAfter;
      }

      buckets.set(key, bucket);
    }

    const contracts = [...buckets.entries()].map(([key, bucket]) => {
      const [contractId, partyType] = key.split(':');
      return {
        contractId,
        contractNumber: bucket.contractNumber,
        partyType,
        totalHeld: this.decimalToString(bucket.totalHeld),
        totalReleased: this.decimalToString(bucket.totalReleased),
        currentBalance: this.decimalToString(bucket.latestBalance ?? ZERO),
      };
    });

    const totals = contracts.reduce(
      (acc, row) => ({
        totalHeld: acc.totalHeld.add(toBoqDecimal(row.totalHeld, 'totalHeld')),
        totalReleased: acc.totalReleased.add(
          toBoqDecimal(row.totalReleased, 'totalReleased'),
        ),
        currentBalance: acc.currentBalance.add(
          toBoqDecimal(row.currentBalance, 'currentBalance'),
        ),
      }),
      {
        totalHeld: ZERO,
        totalReleased: ZERO,
        currentBalance: ZERO,
      },
    );

    return {
      filters,
      totals: {
        totalHeld: this.decimalToString(totals.totalHeld),
        totalReleased: this.decimalToString(totals.totalReleased),
        currentBalance: this.decimalToString(totals.currentBalance),
      },
      contracts,
    };
  }

  private buildAdvanceReport(
    filters: ConstructionReportingFiltersDto,
    entries: Array<{
      contractId: string;
      partyType: string;
      entryType: ConstructionAdvanceEntryType;
      amount: Prisma.Decimal;
      balanceAfter: Prisma.Decimal;
      createdAt: Date;
      contract: { number: string };
    }>,
  ): ConstructionAdvanceReportDto {
    type Bucket = {
      contractNumber: string;
      totalReceived: Prisma.Decimal;
      totalRecovered: Prisma.Decimal;
      latestBalance: Prisma.Decimal | null;
      latestAt: Date | null;
    };

    const buckets = new Map<string, Bucket>();
    for (const entry of entries) {
      const key = `${entry.contractId}:${entry.partyType}`;
      const bucket =
        buckets.get(key) ??
        ({
          contractNumber: entry.contract.number,
          totalReceived: ZERO,
          totalRecovered: ZERO,
          latestBalance: null,
          latestAt: null,
        } satisfies Bucket);

      if (entry.entryType === ConstructionAdvanceEntryType.received) {
        bucket.totalReceived = bucket.totalReceived.add(entry.amount);
      } else if (entry.entryType === ConstructionAdvanceEntryType.recovered) {
        bucket.totalRecovered = bucket.totalRecovered.add(entry.amount);
      }

      if (!bucket.latestAt || entry.createdAt > bucket.latestAt) {
        bucket.latestAt = entry.createdAt;
        bucket.latestBalance = entry.balanceAfter;
      }

      buckets.set(key, bucket);
    }

    const contracts = [...buckets.entries()].map(([key, bucket]) => {
      const [contractId, partyType] = key.split(':');
      return {
        contractId,
        contractNumber: bucket.contractNumber,
        partyType,
        totalReceived: this.decimalToString(bucket.totalReceived),
        totalRecovered: this.decimalToString(bucket.totalRecovered),
        currentBalance: this.decimalToString(bucket.latestBalance ?? ZERO),
      };
    });

    const totals = contracts.reduce(
      (acc, row) => ({
        totalReceived: acc.totalReceived.add(
          toBoqDecimal(row.totalReceived, 'totalReceived'),
        ),
        totalRecovered: acc.totalRecovered.add(
          toBoqDecimal(row.totalRecovered, 'totalRecovered'),
        ),
        currentBalance: acc.currentBalance.add(
          toBoqDecimal(row.currentBalance, 'currentBalance'),
        ),
      }),
      {
        totalReceived: ZERO,
        totalRecovered: ZERO,
        currentBalance: ZERO,
      },
    );

    return {
      filters,
      totals: {
        totalReceived: this.decimalToString(totals.totalReceived),
        totalRecovered: this.decimalToString(totals.totalRecovered),
        currentBalance: this.decimalToString(totals.currentBalance),
      },
      contracts,
    };
  }

  private async loadFinancialLayer(
    tenantId: string,
    projectId: string,
    query: ConstructionReportingQueryDto,
  ) {
    const entryDateFilter =
      query.dateFrom || query.dateTo
        ? {
            entryDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {};

    const where: Prisma.JournalLineWhereInput = {
      projectId,
      entry: {
        tenantId,
        ...entryDateFilter,
      },
    };

    const [aggregate, journalLineCount] = await Promise.all([
      this.prisma.journalLine.aggregate({
        where,
        _sum: { debit: true, credit: true },
      }),
      this.prisma.journalLine.count({ where }),
    ]);

    return {
      journalLineCount,
      totalDebits: this.decimalToString(aggregate._sum.debit ?? ZERO),
      totalCredits: this.decimalToString(aggregate._sum.credit ?? ZERO),
    };
  }

  private toCostingQuery(
    query: ConstructionReportingQueryDto,
  ): ConstructionCostingQueryDto {
    return {
      contractId: query.contractId,
      costCenterId: query.costCenterId,
      category: query.category,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    };
  }

  private toFilters(
    query: ConstructionReportingQueryDto,
  ): ConstructionReportingFiltersDto {
    return {
      projectId: query.projectId,
      contractId: query.contractId,
      costCenterId: query.costCenterId,
      category: query.category,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      status: query.status,
    };
  }

  private requireProjectId(query: ConstructionReportingQueryDto): string {
    if (!query.projectId) {
      throw new BadRequestException('projectId is required');
    }
    return query.projectId;
  }

  private async assertProjectExists(tenantId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }

  private decimalToString(value: Prisma.Decimal): string {
    return value.toDecimalPlaces(4).toFixed(4);
  }
}
