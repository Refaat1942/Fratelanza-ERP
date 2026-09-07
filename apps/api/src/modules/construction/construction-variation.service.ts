import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConstructionBoqStatus,
  ConstructionContractStatus,
  ConstructionVariationStatus,
  ConstructionVariationType,
  Prisma,
} from '../../../../../packages/database/generated/server';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import {
  assertVariationStatusTransition,
  isVariationEditable,
} from './construction-variation-lifecycle';
import { ConstructionBoqService } from './construction-boq.service';
import { ConstructionContractService } from './construction-contract.service';
import {
  multiplyBoqAmount,
  sumBoqAmounts,
  toBoqDecimal,
  toProgressQuantity,
} from './construction-money.util';
import type {
  CreateConstructionVariationDto,
  CreateConstructionVariationItemDto,
  ListConstructionVariationsQueryDto,
  RejectConstructionVariationDto,
  UpdateConstructionVariationDto,
  UpdateConstructionVariationItemDto,
} from './dto/construction-variation.dto';

const variationInclude = {
  contract: { select: { id: true, number: true, title: true, status: true } },
  boq: { select: { id: true, number: true, revisionNumber: true, status: true } },
  project: { select: { id: true, code: true, name: true } },
  items: { orderBy: { lineNumber: 'asc' as const } },
} satisfies Prisma.ConstructionVariationInclude;

const QUANTITY_AFFECTING_TYPES: ConstructionVariationType[] = [
  ConstructionVariationType.quantity_change,
  ConstructionVariationType.omission,
  ConstructionVariationType.addition,
];

@Injectable()
export class ConstructionVariationService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
    private audit: AuditService,
    private contracts: ConstructionContractService,
    private boqs: ConstructionBoqService,
  ) {}

  async list(tenantId: string, query: ListConstructionVariationsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ConstructionVariationWhereInput = {
      tenantId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(query.boqId ? { boqId: query.boqId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.constructionVariation.findMany({
        where,
        include: variationInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.constructionVariation.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findById(tenantId: string, id: string) {
    const variation = await this.prisma.constructionVariation.findFirst({
      where: { id, tenantId },
      include: variationInclude,
    });
    if (!variation) {
      throw new NotFoundException('Construction variation not found');
    }
    return variation;
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateConstructionVariationDto,
  ) {
    const contract = await this.contracts.findById(tenantId, dto.contractId);
    const boq = await this.boqs.findById(tenantId, dto.boqId);
    this.assertBoqEligibleForVariation(boq, contract);

    const number = await this.documentNumbers.nextNumber(
      tenantId,
      'VAR',
      'VAR',
      contract.branchId,
    );

    const variation = await this.prisma.constructionVariation.create({
      data: {
        tenantId,
        projectId: contract.projectId,
        branchId: contract.branchId,
        contractId: contract.id,
        boqId: boq.id,
        number,
        title: dto.title.trim(),
        description: dto.description?.trim(),
        currency: boq.currency,
        notes: dto.notes?.trim(),
        createdById: userId,
      },
      include: variationInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      branchId: contract.branchId,
      entity: 'construction_variation',
      entityId: variation.id,
      action: 'construction.variation.created',
      newValue: {
        number: variation.number,
        contractId: contract.id,
        boqId: boq.id,
      },
    });

    return variation;
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateConstructionVariationDto,
  ) {
    const existing = await this.findById(tenantId, id);
    if (!isVariationEditable(existing.status)) {
      throw new BadRequestException(
        `Variation in ${existing.status} status is not editable`,
      );
    }

    const variation = await this.prisma.constructionVariation.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
      },
      include: variationInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_variation',
      entityId: variation.id,
      action: 'construction.variation.updated',
    });

    return variation;
  }

  async createItem(
    tenantId: string,
    variationId: string,
    userId: string,
    dto: CreateConstructionVariationItemDto,
  ) {
    const variation = await this.findById(tenantId, variationId);
    if (!isVariationEditable(variation.status)) {
      throw new BadRequestException('Only draft variation items can be edited');
    }

    const boqItem = dto.boqItemId
      ? await this.getBoqItemForVariation(tenantId, variation.boqId, dto.boqItemId)
      : null;

    const amountDelta = await this.calculateAmountDelta(
      dto.variationType,
      boqItem,
      dto.quantityDelta,
      dto.rateDelta,
      dto.lumpSumAmount,
    );

    const item = await this.prisma.constructionVariationItem.create({
      data: {
        tenantId,
        variationId,
        lineNumber: dto.lineNumber ?? variation.items.length + 1,
        variationType: dto.variationType,
        boqItemId: dto.boqItemId ?? null,
        description: dto.description?.trim(),
        quantityDelta: dto.quantityDelta
          ? toProgressQuantity(dto.quantityDelta)
          : null,
        rateDelta: dto.rateDelta ? toBoqDecimal(dto.rateDelta, 'rateDelta') : null,
        lumpSumAmount: dto.lumpSumAmount
          ? toBoqDecimal(dto.lumpSumAmount, 'lumpSumAmount')
          : null,
        amountDelta,
        costCenterId: dto.costCenterId ?? boqItem?.costCenterId ?? null,
        costCode: dto.costCode ?? boqItem?.costCode ?? null,
        notes: dto.notes?.trim(),
      },
    });

    await this.recalculateTotals(tenantId, variationId);
    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_variation',
      entityId: variationId,
      action: 'construction.variation.updated',
    });

    return item;
  }

  async updateItem(
    tenantId: string,
    itemId: string,
    userId: string,
    dto: UpdateConstructionVariationItemDto,
  ) {
    const existing = await this.getItem(tenantId, itemId);
    const variation = await this.findById(tenantId, existing.variationId);
    if (!isVariationEditable(variation.status)) {
      throw new BadRequestException('Only draft variation items can be edited');
    }

    const variationType = dto.variationType ?? existing.variationType;
    const boqItemId = dto.boqItemId ?? existing.boqItemId ?? undefined;
    const boqItem = boqItemId
      ? await this.getBoqItemForVariation(tenantId, variation.boqId, boqItemId)
      : null;

    const quantityDelta = dto.quantityDelta !== undefined
      ? (dto.quantityDelta ? toProgressQuantity(dto.quantityDelta) : null)
      : existing.quantityDelta;
    const rateDelta = dto.rateDelta !== undefined
      ? (dto.rateDelta ? toBoqDecimal(dto.rateDelta, 'rateDelta') : null)
      : existing.rateDelta;
    const lumpSumAmount = dto.lumpSumAmount !== undefined
      ? (dto.lumpSumAmount ? toBoqDecimal(dto.lumpSumAmount, 'lumpSumAmount') : null)
      : existing.lumpSumAmount;

    const amountDelta = await this.calculateAmountDelta(
      variationType,
      boqItem,
      quantityDelta?.toString(),
      rateDelta?.toString(),
      lumpSumAmount?.toString(),
    );

    const item = await this.prisma.constructionVariationItem.update({
      where: { id: itemId },
      data: {
        variationType,
        boqItemId: boqItemId ?? null,
        description: dto.description !== undefined
          ? dto.description?.trim() ?? null
          : undefined,
        quantityDelta,
        rateDelta,
        lumpSumAmount,
        amountDelta,
        ...(dto.lineNumber !== undefined ? { lineNumber: dto.lineNumber } : {}),
        ...(dto.costCenterId !== undefined ? { costCenterId: dto.costCenterId } : {}),
        ...(dto.costCode !== undefined ? { costCode: dto.costCode ?? null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
      },
    });

    await this.recalculateTotals(tenantId, existing.variationId);
    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_variation',
      entityId: existing.variationId,
      action: 'construction.variation.updated',
    });

    return item;
  }

  async submit(tenantId: string, id: string, userId: string) {
    const existing = await this.findById(tenantId, id);
    if (existing.status === ConstructionVariationStatus.submitted) {
      return existing;
    }
    assertVariationStatusTransition(
      existing.status,
      ConstructionVariationStatus.submitted,
    );

    const contract = await this.contracts.findById(tenantId, existing.contractId);
    this.assertContractActiveForVariation(contract.status);

    if (existing.items.length === 0) {
      throw new BadRequestException('Variation must have at least one item');
    }

    await this.validateItemsForSubmit(tenantId, existing);

    const updated = await this.prisma.constructionVariation.updateMany({
      where: {
        id,
        tenantId,
        status: ConstructionVariationStatus.draft,
      },
      data: {
        status: ConstructionVariationStatus.submitted,
        submittedAt: new Date(),
        submittedById: userId,
        rejectedAt: null,
        rejectedById: null,
        rejectionReason: null,
      },
    });

    if (updated.count === 0) {
      throw new ConflictException('Variation submit conflict — refresh and retry');
    }

    const variation = await this.findById(tenantId, id);
    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_variation',
      entityId: variation.id,
      action: 'construction.variation.submitted',
    });

    return variation;
  }

  async approve(tenantId: string, id: string, userId: string) {
    const existing = await this.findById(tenantId, id);
    if (existing.status === ConstructionVariationStatus.approved) {
      return existing;
    }
    assertVariationStatusTransition(
      existing.status,
      ConstructionVariationStatus.approved,
    );

    const contract = await this.contracts.findById(tenantId, existing.contractId);
    this.assertContractActiveForVariation(contract.status);
    await this.validateItemsForSubmit(tenantId, existing);

    const updated = await this.prisma.constructionVariation.updateMany({
      where: {
        id,
        tenantId,
        status: ConstructionVariationStatus.submitted,
      },
      data: {
        status: ConstructionVariationStatus.approved,
        approvedAt: new Date(),
        approvedById: userId,
      },
    });

    if (updated.count === 0) {
      throw new ConflictException('Variation approve conflict — refresh and retry');
    }

    await this.recalculateContractRevisedValue(tenantId, existing.contractId);

    const variation = await this.findById(tenantId, id);
    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_variation',
      entityId: variation.id,
      action: 'construction.variation.approved',
    });

    return variation;
  }

  async reject(
    tenantId: string,
    id: string,
    userId: string,
    dto: RejectConstructionVariationDto,
  ) {
    const existing = await this.findById(tenantId, id);
    assertVariationStatusTransition(
      existing.status,
      ConstructionVariationStatus.rejected,
    );

    const updated = await this.prisma.constructionVariation.updateMany({
      where: {
        id,
        tenantId,
        status: ConstructionVariationStatus.submitted,
      },
      data: {
        status: ConstructionVariationStatus.rejected,
        rejectedAt: new Date(),
        rejectedById: userId,
        rejectionReason: dto.reason?.trim(),
      },
    });

    if (updated.count === 0) {
      throw new ConflictException('Variation reject conflict — refresh and retry');
    }

    const variation = await this.findById(tenantId, id);
    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_variation',
      entityId: variation.id,
      action: 'construction.variation.rejected',
      newValue: { reason: dto.reason ?? null },
    });

    return variation;
  }

  async returnToDraft(tenantId: string, id: string, userId: string) {
    const existing = await this.findById(tenantId, id);
    assertVariationStatusTransition(
      existing.status,
      ConstructionVariationStatus.draft,
    );

    const variation = await this.prisma.constructionVariation.update({
      where: { id, status: ConstructionVariationStatus.rejected },
      data: {
        status: ConstructionVariationStatus.draft,
        submittedAt: null,
        submittedById: null,
        rejectedAt: null,
        rejectedById: null,
        rejectionReason: null,
      },
      include: variationInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_variation',
      entityId: variation.id,
      action: 'construction.variation.updated',
      newValue: { status: ConstructionVariationStatus.draft },
    });

    return variation;
  }

  async archive(tenantId: string, id: string, userId: string) {
    const existing = await this.findById(tenantId, id);
    assertVariationStatusTransition(
      existing.status,
      ConstructionVariationStatus.archived,
    );

    const variation = await this.prisma.constructionVariation.update({
      where: { id },
      data: { status: ConstructionVariationStatus.archived },
      include: variationInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_variation',
      entityId: variation.id,
      action: 'construction.variation.archived',
    });

    return variation;
  }

  async getEffectiveQuantityLimit(
    tenantId: string,
    boqId: string,
    boqItemId: string,
  ): Promise<Prisma.Decimal> {
    const boqItem = await this.prisma.constructionBoqItem.findFirst({
      where: { id: boqItemId, tenantId, boqId },
      select: { plannedQuantity: true },
    });
    if (!boqItem) {
      throw new BadRequestException('BOQ item not found for effective quantity');
    }

    const approvedDeltas = await this.prisma.constructionVariationItem.findMany({
      where: {
        tenantId,
        boqItemId,
        variationType: { in: QUANTITY_AFFECTING_TYPES },
        variation: {
          boqId,
          status: ConstructionVariationStatus.approved,
        },
      },
      select: { quantityDelta: true },
    });

    const deltaSum = approvedDeltas.reduce(
      (sum, item) => sum.add(item.quantityDelta ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );

    return boqItem.plannedQuantity.add(deltaSum);
  }

  private async recalculateContractRevisedValue(
    tenantId: string,
    contractId: string,
  ) {
    const contract = await this.contracts.findById(tenantId, contractId);
    const approvedVariations = await this.prisma.constructionVariation.findMany({
      where: {
        tenantId,
        contractId,
        status: ConstructionVariationStatus.approved,
      },
      select: { totalAmountDelta: true },
    });

    const variationTotal = sumBoqAmounts(
      approvedVariations.map((variation) => variation.totalAmountDelta),
    );
    const revisedValue = contract.originalValue.add(variationTotal);

    await this.prisma.constructionContract.update({
      where: { id: contractId },
      data: { revisedValue },
    });
  }

  private async validateItemsForSubmit(
    tenantId: string,
    variation: Awaited<ReturnType<typeof this.findById>>,
  ) {
    for (const item of variation.items) {
      if (
        QUANTITY_AFFECTING_TYPES.includes(item.variationType)
        && item.boqItemId
      ) {
        const currentEffective = await this.getEffectiveQuantityLimit(
          tenantId,
          variation.boqId,
          item.boqItemId,
        );
        const pendingDelta = item.quantityDelta ?? new Prisma.Decimal(0);
        if (currentEffective.add(pendingDelta).lt(0)) {
          throw new BadRequestException(
            'Variation would make effective quantity negative',
          );
        }
      }
    }
  }

  private async calculateAmountDelta(
    variationType: ConstructionVariationType,
    boqItem: Awaited<ReturnType<typeof this.getBoqItemForVariation>> | null,
    quantityDeltaRaw?: string | null,
    rateDeltaRaw?: string | null,
    lumpSumAmountRaw?: string | null,
  ): Promise<Prisma.Decimal> {
    const quantityDelta = quantityDeltaRaw
      ? toProgressQuantity(quantityDeltaRaw)
      : null;
    const rateDelta = rateDeltaRaw ? toBoqDecimal(rateDeltaRaw, 'rateDelta') : null;
    const lumpSumAmount = lumpSumAmountRaw
      ? toBoqDecimal(lumpSumAmountRaw, 'lumpSumAmount')
      : null;

    switch (variationType) {
      case ConstructionVariationType.quantity_change: {
        if (!boqItem || !quantityDelta) {
          throw new BadRequestException(
            'Quantity change requires BOQ item and quantity delta',
          );
        }
        return multiplyBoqAmount(quantityDelta, boqItem.unitRate);
      }
      case ConstructionVariationType.rate_change: {
        if (!boqItem || !rateDelta) {
          throw new BadRequestException(
            'Rate change requires BOQ item and rate delta',
          );
        }
        return multiplyBoqAmount(boqItem.plannedQuantity, rateDelta);
      }
      case ConstructionVariationType.omission: {
        if (!boqItem || !quantityDelta || quantityDelta.gte(0)) {
          throw new BadRequestException(
            'Omission requires BOQ item and negative quantity delta',
          );
        }
        return multiplyBoqAmount(quantityDelta, boqItem.unitRate);
      }
      case ConstructionVariationType.addition: {
        if (lumpSumAmount) {
          return lumpSumAmount;
        }
        if (quantityDelta && rateDelta) {
          return multiplyBoqAmount(quantityDelta, rateDelta);
        }
        if (boqItem && quantityDelta) {
          return multiplyBoqAmount(quantityDelta, boqItem.unitRate);
        }
        throw new BadRequestException(
          'Addition requires lump sum or quantity with rate',
        );
      }
      case ConstructionVariationType.lump_sum: {
        if (!lumpSumAmount) {
          throw new BadRequestException('Lump sum variation requires amount');
        }
        return lumpSumAmount;
      }
      default:
        throw new BadRequestException(`Unsupported variation type: ${variationType}`);
    }
  }

  private async recalculateTotals(tenantId: string, variationId: string) {
    const items = await this.prisma.constructionVariationItem.findMany({
      where: { tenantId, variationId },
      select: { amountDelta: true },
    });
    await this.prisma.constructionVariation.update({
      where: { id: variationId },
      data: {
        totalAmountDelta: sumBoqAmounts(items.map((item) => item.amountDelta)),
      },
    });
  }

  private async getItem(tenantId: string, itemId: string) {
    const item = await this.prisma.constructionVariationItem.findFirst({
      where: { id: itemId, tenantId },
    });
    if (!item) {
      throw new NotFoundException('Variation item not found');
    }
    return item;
  }

  private async getBoqItemForVariation(
    tenantId: string,
    boqId: string,
    boqItemId: string,
  ) {
    const item = await this.prisma.constructionBoqItem.findFirst({
      where: { id: boqItemId, tenantId, boqId },
    });
    if (!item) {
      throw new BadRequestException('BOQ item does not belong to this variation BOQ revision');
    }
    return item;
  }

  private assertBoqEligibleForVariation(
    boq: Awaited<ReturnType<ConstructionBoqService['findById']>>,
    contract: Awaited<ReturnType<ConstructionContractService['findById']>>,
  ) {
    if (boq.contractId !== contract.id) {
      throw new BadRequestException('BOQ does not belong to contract');
    }
    if (boq.projectId !== contract.projectId) {
      throw new BadRequestException('BOQ project mismatch');
    }
    if (boq.status !== ConstructionBoqStatus.approved) {
      throw new BadRequestException('Variation requires an approved BOQ revision');
    }
  }

  private assertContractActiveForVariation(status: ConstructionContractStatus) {
    if (status !== ConstructionContractStatus.active) {
      throw new BadRequestException(
        `Contract must be active for variation submit/approve (current: ${status})`,
      );
    }
  }
}
