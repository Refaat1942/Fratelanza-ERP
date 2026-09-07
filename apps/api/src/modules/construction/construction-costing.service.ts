import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConstructionBoqStatus,
  ConstructionCostCategory,
  ConstructionProgressStatus,
  ConstructionVariationStatus,
  ConstructionVariationType,
  Prisma,
} from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';
import { ConstructionContractService } from './construction-contract.service';
import { sumBoqAmounts, toBoqDecimal } from './construction-money.util';
import type {
  ConstructionContractCostingDto,
  ConstructionCostCategoryTotalsDto,
  ConstructionCostCenterCostingDto,
  ConstructionCostingQueryDto,
  ConstructionCostingSnapshotDto,
  ConstructionProjectCostingDto,
  ConstructionRemainingBoqDto,
} from './dto/construction-costing.dto';

const ZERO = new Prisma.Decimal(0);
const ALL_CATEGORIES = Object.values(ConstructionCostCategory);

const QUANTITY_AFFECTING_VARIATION_TYPES: ConstructionVariationType[] = [
  ConstructionVariationType.quantity_change,
  ConstructionVariationType.omission,
  ConstructionVariationType.addition,
];

interface CostEntryFilter {
  tenantId: string;
  projectId: string;
  costCenterId?: string;
  category?: ConstructionCostCategory;
  dateFrom?: string;
  dateTo?: string;
}

interface ContractScope {
  contractId: string;
  contractNumber: string;
  contractTitle: string;
  boqId: string | null;
  contractValue: Prisma.Decimal;
  originalBoqValue: Prisma.Decimal;
  approvedVariationsValue: Prisma.Decimal;
  currentContractValue: Prisma.Decimal;
  progressValuation: Prisma.Decimal;
  remainingBoq: ConstructionRemainingBoqDto;
}

@Injectable()
export class ConstructionCostingService {
  constructor(
    private prisma: PrismaService,
    private contracts: ConstructionContractService,
  ) {}

  async getProjectCosting(
    tenantId: string,
    projectId: string,
    filters: ConstructionCostingQueryDto = {},
  ): Promise<ConstructionProjectCostingDto> {
    await this.assertProjectExists(tenantId, projectId);

    const contractWhere: Prisma.ConstructionContractWhereInput = {
      tenantId,
      projectId,
      ...(filters.contractId ? { id: filters.contractId } : {}),
    };

    const contracts = await this.prisma.constructionContract.findMany({
      where: contractWhere,
      select: {
        id: true,
        number: true,
        title: true,
        originalValue: true,
        revisedValue: true,
      },
      orderBy: { number: 'asc' },
    });

    if (filters.contractId && contracts.length === 0) {
      throw new NotFoundException('Construction contract not found for project');
    }

    const contractScopes = await Promise.all(
      contracts.map((contract) => this.buildContractScope(tenantId, contract)),
    );

    const actualByCategory = await this.aggregateActualCosts({
      tenantId,
      projectId,
      costCenterId: filters.costCenterId,
      category: filters.category,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    });

    const snapshot = this.mergeContractScopes(contractScopes, actualByCategory);

    return {
      projectId,
      filters: {
        contractId: filters.contractId,
        costCenterId: filters.costCenterId,
        category: filters.category,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      },
      ...snapshot,
      contracts: contractScopes.map((scope) =>
        this.toContractCostingDto(scope, actualByCategory),
      ),
    };
  }

  async getContractCosting(
    tenantId: string,
    contractId: string,
  ): Promise<ConstructionContractCostingDto> {
    const contract = await this.contracts.findById(tenantId, contractId);
    const scope = await this.buildContractScope(tenantId, contract);
    const actualByCategory = await this.aggregateActualCosts({
      tenantId,
      projectId: contract.projectId,
    });

    return this.toContractCostingDto(scope, actualByCategory);
  }

  async getCostCenterCosting(
    tenantId: string,
    costCenterId: string,
  ): Promise<ConstructionCostCenterCostingDto> {
    const costCenter = await this.prisma.costCenter.findFirst({
      where: { id: costCenterId, tenantId },
      select: {
        id: true,
        code: true,
        name: true,
        projectId: true,
      },
    });
    if (!costCenter) {
      throw new NotFoundException('Cost center not found');
    }
    if (!costCenter.projectId) {
      throw new BadRequestException(
        'Cost center is not linked to a project; costing unavailable',
      );
    }

    const projectId = costCenter.projectId;
    const contracts = await this.prisma.constructionContract.findMany({
      where: { tenantId, projectId },
      select: {
        id: true,
        number: true,
        title: true,
        originalValue: true,
        revisedValue: true,
      },
      orderBy: { number: 'asc' },
    });

    const contractScopes = await Promise.all(
      contracts.map((contract) =>
        this.buildContractScope(tenantId, contract, costCenterId),
      ),
    );

    const actualByCategory = await this.aggregateActualCosts({
      tenantId,
      projectId,
      costCenterId,
    });

    const snapshot = this.mergeContractScopes(contractScopes, actualByCategory);

    return {
      costCenterId: costCenter.id,
      costCenterCode: costCenter.code,
      costCenterName: costCenter.name,
      projectId,
      ...snapshot,
    };
  }

  private async buildContractScope(
    tenantId: string,
    contract: {
      id: string;
      number: string;
      title: string;
      originalValue: Prisma.Decimal;
      revisedValue: Prisma.Decimal | null;
    },
    costCenterId?: string,
  ): Promise<ContractScope> {
    const latestBoq = await this.prisma.constructionBoq.findFirst({
      where: {
        tenantId,
        contractId: contract.id,
        status: ConstructionBoqStatus.approved,
      },
      orderBy: { revisionNumber: 'desc' },
      select: { id: true, totalOriginalAmount: true },
    });

    const boqId = latestBoq?.id ?? null;
    const originalBoqValue = costCenterId && boqId
      ? await this.sumBoqItemsForCostCenter(tenantId, boqId, costCenterId)
      : toBoqDecimal(latestBoq?.totalOriginalAmount ?? ZERO, 'originalBoqValue');

    const approvedVariationsValue = boqId
      ? await this.sumApprovedVariationDeltas(tenantId, contract.id, boqId, costCenterId)
      : ZERO;

    const contractValue = costCenterId && boqId
      ? originalBoqValue
      : toBoqDecimal(contract.originalValue, 'contractValue');

    const currentContractValue = costCenterId
      ? contractValue.add(approvedVariationsValue)
      : toBoqDecimal(
          contract.revisedValue ?? contract.originalValue.add(approvedVariationsValue),
          'currentContractValue',
        );

    const progressValuation = boqId
      ? await this.getProgressValuation(tenantId, contract.id, boqId, costCenterId)
      : ZERO;

    const remainingBoq = boqId
      ? await this.computeRemainingBoq(tenantId, boqId, costCenterId)
      : this.emptyRemainingBoq();

    return {
      contractId: contract.id,
      contractNumber: contract.number,
      contractTitle: contract.title,
      boqId,
      contractValue,
      originalBoqValue,
      approvedVariationsValue,
      currentContractValue,
      progressValuation,
      remainingBoq,
    };
  }

  private mergeContractScopes(
    scopes: ContractScope[],
    actualByCategory: ConstructionCostCategoryTotalsDto,
  ): ConstructionCostingSnapshotDto {
    const originalBoqValue = sumBoqAmounts(
      scopes.map((scope) => scope.originalBoqValue),
    );
    const contractValue = sumBoqAmounts(
      scopes.map((scope) => scope.contractValue),
    );
    const approvedVariationsValue = sumBoqAmounts(
      scopes.map((scope) => scope.approvedVariationsValue),
    );
    const currentContractValue = sumBoqAmounts(
      scopes.map((scope) => scope.currentContractValue),
    );
    const progressValuation = sumBoqAmounts(
      scopes.map((scope) => scope.progressValuation),
    );
    const remainingBoq = this.mergeRemainingBoq(scopes.map((scope) => scope.remainingBoq));
    const actualTotal = toBoqDecimal(actualByCategory.total, 'actualCostTotal');
    const grossMargin = progressValuation.sub(actualTotal);

    return {
      planned: {
        originalBoqValue: this.decimalToString(originalBoqValue),
      },
      contractual: {
        contractValue: this.decimalToString(contractValue),
        approvedVariationsValue: this.decimalToString(approvedVariationsValue),
        currentContractValue: this.decimalToString(currentContractValue),
      },
      executedValue: {
        progressValuation: this.decimalToString(progressValuation),
      },
      actualCost: {
        byCategory: actualByCategory,
      },
      profitability: {
        grossMargin: this.decimalToString(grossMargin),
        grossMarginPercent: this.marginPercent(grossMargin, progressValuation),
      },
      remainingBoq,
    };
  }

  private toContractCostingDto(
    scope: ContractScope,
    actualByCategory: ConstructionCostCategoryTotalsDto,
  ): ConstructionContractCostingDto {
    const actualTotal = toBoqDecimal(actualByCategory.total, 'actualCostTotal');
    const grossMargin = scope.progressValuation.sub(actualTotal);

    return {
      contractId: scope.contractId,
      contractNumber: scope.contractNumber,
      contractTitle: scope.contractTitle,
      boqId: scope.boqId,
      planned: {
        originalBoqValue: this.decimalToString(scope.originalBoqValue),
      },
      contractual: {
        contractValue: this.decimalToString(scope.contractValue),
        approvedVariationsValue: this.decimalToString(scope.approvedVariationsValue),
        currentContractValue: this.decimalToString(scope.currentContractValue),
      },
      executedValue: {
        progressValuation: this.decimalToString(scope.progressValuation),
      },
      actualCost: {
        byCategory: actualByCategory,
      },
      profitability: {
        grossMargin: this.decimalToString(grossMargin),
        grossMarginPercent: this.marginPercent(grossMargin, scope.progressValuation),
      },
      remainingBoq: scope.remainingBoq,
    };
  }

  private async aggregateActualCosts(
    filter: CostEntryFilter,
  ): Promise<ConstructionCostCategoryTotalsDto> {
    const where: Prisma.ConstructionCostEntryWhereInput = {
      tenantId: filter.tenantId,
      projectId: filter.projectId,
      ...(filter.costCenterId ? { costCenterId: filter.costCenterId } : {}),
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.dateFrom || filter.dateTo
        ? {
            occurredAt: {
              ...(filter.dateFrom ? { gte: new Date(filter.dateFrom) } : {}),
              ...(filter.dateTo ? { lte: new Date(filter.dateTo) } : {}),
            },
          }
        : {}),
    };

    const groups = await this.prisma.constructionCostEntry.groupBy({
      by: ['category'],
      where,
      _sum: { amount: true },
    });

    const amounts = new Map<ConstructionCostCategory, Prisma.Decimal>();
    for (const category of ALL_CATEGORIES) {
      amounts.set(category, ZERO);
    }
    for (const group of groups) {
      amounts.set(group.category, group._sum.amount ?? ZERO);
    }

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

  private async sumApprovedVariationDeltas(
    tenantId: string,
    contractId: string,
    boqId: string,
    costCenterId?: string,
  ): Promise<Prisma.Decimal> {
    if (costCenterId) {
      const items = await this.prisma.constructionVariationItem.findMany({
        where: {
          tenantId,
          variation: {
            contractId,
            boqId,
            status: ConstructionVariationStatus.approved,
          },
          boqItem: { costCenterId },
        },
        select: { amountDelta: true },
      });
      return sumBoqAmounts(items.map((item) => item.amountDelta));
    }

    const variations = await this.prisma.constructionVariation.findMany({
      where: {
        tenantId,
        contractId,
        boqId,
        status: ConstructionVariationStatus.approved,
      },
      select: { totalAmountDelta: true },
    });
    return sumBoqAmounts(variations.map((variation) => variation.totalAmountDelta));
  }

  private async sumBoqItemsForCostCenter(
    tenantId: string,
    boqId: string,
    costCenterId: string,
  ): Promise<Prisma.Decimal> {
    const result = await this.prisma.constructionBoqItem.aggregate({
      where: { tenantId, boqId, costCenterId },
      _sum: { originalAmount: true },
    });
    return result._sum.originalAmount ?? ZERO;
  }

  private async getProgressValuation(
    tenantId: string,
    contractId: string,
    boqId: string,
    costCenterId?: string,
  ): Promise<Prisma.Decimal> {
    if (costCenterId) {
      const progressItems = await this.prisma.constructionProgressItem.findMany({
        where: {
          tenantId,
          costCenterId,
          progress: {
            contractId,
            boqId,
            status: ConstructionProgressStatus.approved,
          },
        },
        orderBy: [
          { progress: { periodTo: 'desc' } },
          { progress: { approvedAt: 'desc' } },
        ],
        select: {
          boqItemId: true,
          cumulativeAmount: true,
        },
      });

      const latestByBoqItem = new Map<string, Prisma.Decimal>();
      for (const item of progressItems) {
        if (!latestByBoqItem.has(item.boqItemId)) {
          latestByBoqItem.set(item.boqItemId, item.cumulativeAmount);
        }
      }
      return sumBoqAmounts([...latestByBoqItem.values()]);
    }

    const latestProgress = await this.prisma.constructionProgress.findFirst({
      where: {
        tenantId,
        contractId,
        boqId,
        status: ConstructionProgressStatus.approved,
      },
      orderBy: [{ periodTo: 'desc' }, { approvedAt: 'desc' }],
      select: { totalCumulativeAmount: true },
    });

    return latestProgress?.totalCumulativeAmount
      ? toBoqDecimal(latestProgress.totalCumulativeAmount, 'progressValuation')
      : ZERO;
  }

  private async computeRemainingBoq(
    tenantId: string,
    boqId: string,
    costCenterId?: string,
  ): Promise<ConstructionRemainingBoqDto> {
    const boqItems = await this.prisma.constructionBoqItem.findMany({
      where: {
        tenantId,
        boqId,
        ...(costCenterId ? { costCenterId } : {}),
      },
      select: {
        id: true,
        description: true,
        plannedQuantity: true,
        originalAmount: true,
        unitRate: true,
      },
      orderBy: { lineNumber: 'asc' },
    });

    if (boqItems.length === 0) {
      return this.emptyRemainingBoq();
    }

    const boqItemIds = boqItems.map((item) => item.id);

    const variationItems = await this.prisma.constructionVariationItem.findMany({
      where: {
        tenantId,
        boqItemId: { in: boqItemIds },
        variationType: { in: QUANTITY_AFFECTING_VARIATION_TYPES },
        variation: {
          boqId,
          status: ConstructionVariationStatus.approved,
        },
      },
      select: {
        boqItemId: true,
        quantityDelta: true,
      },
    });

    const quantityDeltaByItem = new Map<string, Prisma.Decimal>();
    for (const item of variationItems) {
      if (!item.boqItemId) continue;
      const current = quantityDeltaByItem.get(item.boqItemId) ?? ZERO;
      quantityDeltaByItem.set(
        item.boqItemId,
        current.add(item.quantityDelta ?? ZERO),
      );
    }

    const progressItems = await this.prisma.constructionProgressItem.findMany({
      where: {
        tenantId,
        boqItemId: { in: boqItemIds },
        progress: {
          boqId,
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
      const quantityDelta = quantityDeltaByItem.get(boqItem.id) ?? ZERO;
      const effectiveQuantity = boqItem.plannedQuantity.add(quantityDelta);
      const progress = latestProgressByItem.get(boqItem.id);
      const executedQuantity = progress?.cumulativeQuantity ?? ZERO;
      const executedValue = progress?.cumulativeAmount ?? ZERO;
      const remainingQuantity = effectiveQuantity.sub(executedQuantity);
      const remainingValue = effectiveQuantity
        .mul(boqItem.unitRate)
        .sub(executedValue)
        .toDecimalPlaces(4);

      return {
        boqItemId: boqItem.id,
        description: boqItem.description,
        plannedQuantity: this.decimalToString(boqItem.plannedQuantity),
        effectiveQuantity: this.decimalToString(effectiveQuantity),
        executedQuantity: this.decimalToString(executedQuantity),
        remainingQuantity: this.decimalToString(remainingQuantity),
        plannedValue: this.decimalToString(boqItem.originalAmount),
        executedValue: this.decimalToString(executedValue),
        remainingValue: this.decimalToString(
          remainingValue.lt(0) ? ZERO : remainingValue,
        ),
      };
    });

    const totalRemainingValue = sumBoqAmounts(
      items.map((item) => toBoqDecimal(item.remainingValue, 'remainingValue')),
    );

    return {
      totalRemainingValue: this.decimalToString(totalRemainingValue),
      items,
    };
  }

  private mergeRemainingBoq(
    remainingScopes: ConstructionRemainingBoqDto[],
  ): ConstructionRemainingBoqDto {
    const items = remainingScopes.flatMap((scope) => scope.items);
    const totalRemainingValue = sumBoqAmounts(
      remainingScopes.map((scope) =>
        toBoqDecimal(scope.totalRemainingValue, 'totalRemainingValue'),
      ),
    );

    return {
      totalRemainingValue: this.decimalToString(totalRemainingValue),
      items,
    };
  }

  private emptyRemainingBoq(): ConstructionRemainingBoqDto {
    return {
      totalRemainingValue: this.decimalToString(ZERO),
      items: [],
    };
  }

  private marginPercent(
    grossMargin: Prisma.Decimal,
    progressValuation: Prisma.Decimal,
  ): string | null {
    if (progressValuation.lte(0)) {
      return null;
    }
    return grossMargin
      .div(progressValuation)
      .mul(100)
      .toDecimalPlaces(4)
      .toFixed(4);
  }

  private decimalToString(value: Prisma.Decimal): string {
    return value.toDecimalPlaces(4).toFixed(4);
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
}
