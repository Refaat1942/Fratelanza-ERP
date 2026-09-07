import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConstructionBoqStatus,
  ConstructionContractStatus,
  Prisma,
} from '../../../../../packages/database/generated/server';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { PostingDimensionService } from '../finance/posting/posting-dimension.service';
import {
  canApproveBoq,
  canManageBoqDraft,
} from './construction-contract-lifecycle';
import { ConstructionContractService } from './construction-contract.service';
import {
  multiplyBoqAmount,
  sumBoqAmounts,
  toBoqDecimal,
} from './construction-money.util';
import type {
  CreateConstructionBoqDto,
  CreateConstructionBoqItemDto,
  CreateConstructionBoqSectionDto,
  ListConstructionBoqsQueryDto,
  UpdateConstructionBoqDto,
  UpdateConstructionBoqItemDto,
  UpdateConstructionBoqSectionDto,
} from './dto/construction-boq.dto';

const boqInclude = {
  contract: {
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      projectId: true,
    },
  },
  project: { select: { id: true, code: true, name: true } },
  sections: { orderBy: { sequence: 'asc' as const } },
  items: { orderBy: { lineNumber: 'asc' as const } },
  supersedes: { select: { id: true, revisionNumber: true, status: true } },
} satisfies Prisma.ConstructionBoqInclude;

@Injectable()
export class ConstructionBoqService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
    private audit: AuditService,
    private contracts: ConstructionContractService,
    private postingDimensions: PostingDimensionService,
  ) {}

  async listByContract(
    tenantId: string,
    contractId: string,
    query: ListConstructionBoqsQueryDto,
  ) {
    await this.contracts.findById(tenantId, contractId);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ConstructionBoqWhereInput = {
      tenantId,
      contractId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.constructionBoq.findMany({
        where,
        include: {
          contract: { select: { id: true, number: true, title: true } },
        },
        orderBy: [{ revisionNumber: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.constructionBoq.count({ where }),
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
    const boq = await this.prisma.constructionBoq.findFirst({
      where: { id, tenantId },
      include: boqInclude,
    });
    if (!boq) {
      throw new NotFoundException('BOQ not found');
    }
    return boq;
  }

  async createForContract(
    tenantId: string,
    contractId: string,
    userId: string,
    dto: CreateConstructionBoqDto,
  ) {
    const contract = await this.contracts.findById(tenantId, contractId);
    if (!canManageBoqDraft(contract.status)) {
      throw new BadRequestException(
        `Cannot create BOQ for contract in ${contract.status} status`,
      );
    }

    const existingDraft = await this.prisma.constructionBoq.findFirst({
      where: {
        tenantId,
        contractId,
        status: ConstructionBoqStatus.draft,
      },
    });
    if (existingDraft) {
      throw new ConflictException(
        'Contract already has a draft BOQ; revise or complete it first',
      );
    }

    const number = await this.documentNumbers.nextNumber(
      tenantId,
      'BOQ',
      'BOQ',
      contract.branchId,
    );

    const boq = await this.prisma.constructionBoq.create({
      data: {
        tenantId,
        projectId: contract.projectId,
        contractId,
        number,
        revisionNumber: 1,
        currency: dto.currency?.trim() || contract.currency,
        notes: dto.notes?.trim(),
        createdById: userId,
      },
      include: boqInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_boq',
      entityId: boq.id,
      action: 'construction.boq.created',
      newValue: {
        number: boq.number,
        revisionNumber: boq.revisionNumber,
        contractId,
      },
    });

    return boq;
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateConstructionBoqDto,
  ) {
    const existing = await this.findById(tenantId, id);
    this.assertBoqEditable(existing.status);

    const boq = await this.prisma.constructionBoq.update({
      where: { id },
      data: {
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency.trim() } : {}),
      },
      include: boqInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_boq',
      entityId: boq.id,
      action: 'construction.boq.updated',
    });

    return boq;
  }

  async approve(tenantId: string, id: string, userId: string) {
    const boq = await this.findById(tenantId, id);
    if (boq.status !== ConstructionBoqStatus.draft) {
      throw new BadRequestException('Only draft BOQ can be approved');
    }

    const contract = await this.contracts.findById(tenantId, boq.contractId);
    if (!canApproveBoq(contract.status)) {
      throw new BadRequestException(
        `Cannot approve BOQ for contract in ${contract.status} status`,
      );
    }

    const total = await this.recalculateTotal(tenantId, id);

    return this.prisma.$transaction(async (tx) => {
      if (boq.supersedesBoqId) {
        const previous = await tx.constructionBoq.findFirst({
          where: { id: boq.supersedesBoqId, tenantId },
        });
        if (previous?.status === ConstructionBoqStatus.approved) {
          await tx.constructionBoq.update({
            where: { id: previous.id },
            data: { status: ConstructionBoqStatus.superseded },
          });
          await this.audit.log({
            tenantId,
            userId,
            entity: 'construction_boq',
            entityId: previous.id,
            action: 'construction.boq.superseded',
            newValue: { supersededById: id },
          });
        }
      }

      const contractUpdate: Prisma.ConstructionContractUpdateInput = {};
      const currentContract = await tx.constructionContract.findFirstOrThrow({
        where: { id: boq.contractId, tenantId },
      });

      const isFirstApproval = !boq.supersedesBoqId
        && currentContract.originalValue.isZero()
        && !currentContract.originalValueLocked;

      if (isFirstApproval) {
        contractUpdate.originalValue = total;
      } else if (boq.supersedesBoqId) {
        contractUpdate.revisedValue = total;
      }

      if (Object.keys(contractUpdate).length > 0) {
        await tx.constructionContract.update({
          where: { id: boq.contractId },
          data: contractUpdate,
        });
      }

      const approved = await tx.constructionBoq.update({
        where: { id },
        data: {
          status: ConstructionBoqStatus.approved,
          totalOriginalAmount: total,
          approvedAt: new Date(),
          approvedById: userId,
        },
        include: boqInclude,
      });

      await this.audit.log({
        tenantId,
        userId,
        entity: 'construction_boq',
        entityId: approved.id,
        action: 'construction.boq.approved',
        newValue: {
          totalOriginalAmount: total.toString(),
          revisionNumber: approved.revisionNumber,
        },
      });

      return approved;
    });
  }

  async revise(tenantId: string, id: string, userId: string) {
    const source = await this.findById(tenantId, id);
    if (source.status !== ConstructionBoqStatus.approved) {
      throw new BadRequestException('Only approved BOQ can be revised');
    }

    const contract = await this.contracts.findById(tenantId, source.contractId);
    if (contract.status === ConstructionContractStatus.suspended) {
      throw new BadRequestException('Cannot revise BOQ while contract is suspended');
    }
    if (
      contract.status === ConstructionContractStatus.completed
      || contract.status === ConstructionContractStatus.cancelled
      || contract.status === ConstructionContractStatus.archived
    ) {
      throw new BadRequestException(
        `Cannot revise BOQ for contract in ${contract.status} status`,
      );
    }

    const existingDraft = await this.prisma.constructionBoq.findFirst({
      where: {
        tenantId,
        contractId: source.contractId,
        status: ConstructionBoqStatus.draft,
      },
    });
    if (existingDraft) {
      throw new ConflictException('Contract already has a draft BOQ revision');
    }

    const revisionId = await this.prisma.$transaction(async (tx) => {
      const revision = await tx.constructionBoq.create({
        data: {
          tenantId,
          projectId: source.projectId,
          contractId: source.contractId,
          number: source.number,
          revisionNumber: source.revisionNumber + 1,
          supersedesBoqId: source.id,
          currency: source.currency,
          notes: source.notes,
          createdById: userId,
        },
      });

      const sections = await tx.constructionBoqSection.findMany({
        where: { tenantId, boqId: source.id },
        orderBy: { sequence: 'asc' },
      });
      const sectionMap = new Map<string, string>();
      for (const section of sections.filter((s) => !s.parentSectionId)) {
        const created = await tx.constructionBoqSection.create({
          data: {
            tenantId,
            boqId: revision.id,
            code: section.code,
            name: section.name,
            sequence: section.sequence,
            description: section.description,
          },
        });
        sectionMap.set(section.id, created.id);
      }
      for (const section of sections.filter((s) => s.parentSectionId)) {
        const created = await tx.constructionBoqSection.create({
          data: {
            tenantId,
            boqId: revision.id,
            parentSectionId: sectionMap.get(section.parentSectionId!) ?? null,
            code: section.code,
            name: section.name,
            sequence: section.sequence,
            description: section.description,
          },
        });
        sectionMap.set(section.id, created.id);
      }

      const items = await tx.constructionBoqItem.findMany({
        where: { tenantId, boqId: source.id },
        orderBy: { lineNumber: 'asc' },
      });
      for (const item of items) {
        await tx.constructionBoqItem.create({
          data: {
            tenantId,
            boqId: revision.id,
            sectionId: item.sectionId ? sectionMap.get(item.sectionId) ?? null : null,
            lineNumber: item.lineNumber,
            itemCode: item.itemCode,
            description: item.description,
            unitId: item.unitId,
            unitCode: item.unitCode,
            plannedQuantity: item.plannedQuantity,
            unitRate: item.unitRate,
            originalAmount: item.originalAmount,
            costCode: item.costCode,
            costCenterId: item.costCenterId,
            productId: item.productId,
            category: item.category,
            notes: item.notes,
          },
        });
      }

      await tx.constructionBoq.update({
        where: { id: revision.id },
        data: { totalOriginalAmount: source.totalOriginalAmount },
      });

      await this.audit.log({
        tenantId,
        userId,
        entity: 'construction_boq',
        entityId: revision.id,
        action: 'construction.boq.revision_created',
        newValue: {
          revisionNumber: revision.revisionNumber,
          supersedesBoqId: source.id,
        },
      });

      return revision.id;
    });

    return this.findById(tenantId, revisionId);
  }

  async createSection(
    tenantId: string,
    boqId: string,
    userId: string,
    dto: CreateConstructionBoqSectionDto,
  ) {
    const boq = await this.findById(tenantId, boqId);
    this.assertBoqEditable(boq.status);

    if (dto.parentSectionId) {
      await this.validateSectionParent(tenantId, boqId, dto.parentSectionId, null);
    }

    const section = await this.prisma.constructionBoqSection.create({
      data: {
        tenantId,
        boqId,
        parentSectionId: dto.parentSectionId,
        code: dto.code.trim(),
        name: dto.name.trim(),
        sequence: dto.sequence ?? 0,
        description: dto.description?.trim(),
      },
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_boq_section',
      entityId: section.id,
      action: 'construction.boq.section_created',
    });

    return section;
  }

  async updateSection(
    tenantId: string,
    sectionId: string,
    userId: string,
    dto: UpdateConstructionBoqSectionDto,
  ) {
    const existing = await this.getSection(tenantId, sectionId);
    const boq = await this.findById(tenantId, existing.boqId);
    this.assertBoqEditable(boq.status);

    if (dto.parentSectionId) {
      await this.validateSectionParent(
        tenantId,
        existing.boqId,
        dto.parentSectionId,
        sectionId,
      );
    }

    const section = await this.prisma.constructionBoqSection.update({
      where: { id: sectionId },
      data: {
        ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sequence !== undefined ? { sequence: dto.sequence } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
        ...(dto.parentSectionId !== undefined
          ? { parentSectionId: dto.parentSectionId }
          : {}),
      },
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_boq_section',
      entityId: section.id,
      action: 'construction.boq.section_updated',
    });

    return section;
  }

  async createItem(
    tenantId: string,
    boqId: string,
    userId: string,
    dto: CreateConstructionBoqItemDto,
  ) {
    const boq = await this.findById(tenantId, boqId);
    this.assertBoqEditable(boq.status);
    const contract = await this.contracts.findById(tenantId, boq.contractId);

    if (dto.sectionId) {
      await this.getSectionForBoq(tenantId, boqId, dto.sectionId);
    }

    await this.validateItemReferences(
      tenantId,
      contract.branchId,
      boq.projectId,
      dto.productId,
      dto.unitId,
      dto.costCenterId,
    );

    const originalAmount = multiplyBoqAmount(dto.plannedQuantity, dto.unitRate);

    const item = await this.prisma.constructionBoqItem.create({
      data: {
        tenantId,
        boqId,
        sectionId: dto.sectionId,
        lineNumber: dto.lineNumber ?? 1,
        itemCode: dto.itemCode?.trim(),
        description: dto.description.trim(),
        unitId: dto.unitId,
        unitCode: dto.unitCode?.trim(),
        plannedQuantity: toBoqDecimal(dto.plannedQuantity, 'plannedQuantity'),
        unitRate: toBoqDecimal(dto.unitRate, 'unitRate'),
        originalAmount,
        costCode: dto.costCode?.trim(),
        costCenterId: dto.costCenterId,
        productId: dto.productId,
        category: dto.category,
        notes: dto.notes?.trim(),
      },
    });

    await this.recalculateTotal(tenantId, boqId);
    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_boq_item',
      entityId: item.id,
      action: 'construction.boq.item_created',
    });

    return item;
  }

  async updateItem(
    tenantId: string,
    itemId: string,
    userId: string,
    dto: UpdateConstructionBoqItemDto,
  ) {
    const existing = await this.getItem(tenantId, itemId);
    const boq = await this.findById(tenantId, existing.boqId);
    this.assertBoqEditable(boq.status);
    const contract = await this.contracts.findById(tenantId, boq.contractId);

    if (dto.sectionId) {
      await this.getSectionForBoq(tenantId, existing.boqId, dto.sectionId);
    }

    await this.validateItemReferences(
      tenantId,
      contract.branchId,
      boq.projectId,
      dto.productId ?? existing.productId ?? undefined,
      dto.unitId ?? existing.unitId ?? undefined,
      dto.costCenterId ?? existing.costCenterId ?? undefined,
    );

    const plannedQuantity = dto.plannedQuantity
      ? toBoqDecimal(dto.plannedQuantity, 'plannedQuantity')
      : existing.plannedQuantity;
    const unitRate = dto.unitRate
      ? toBoqDecimal(dto.unitRate, 'unitRate')
      : existing.unitRate;
    const originalAmount = multiplyBoqAmount(plannedQuantity, unitRate);

    const item = await this.prisma.constructionBoqItem.update({
      where: { id: itemId },
      data: {
        ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId } : {}),
        ...(dto.lineNumber !== undefined ? { lineNumber: dto.lineNumber } : {}),
        ...(dto.itemCode !== undefined ? { itemCode: dto.itemCode?.trim() ?? null } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.unitId !== undefined ? { unitId: dto.unitId } : {}),
        ...(dto.unitCode !== undefined ? { unitCode: dto.unitCode?.trim() ?? null } : {}),
        plannedQuantity,
        unitRate,
        originalAmount,
        ...(dto.costCode !== undefined ? { costCode: dto.costCode?.trim() ?? null } : {}),
        ...(dto.costCenterId !== undefined ? { costCenterId: dto.costCenterId } : {}),
        ...(dto.productId !== undefined ? { productId: dto.productId } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
      },
    });

    await this.recalculateTotal(tenantId, existing.boqId);
    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_boq_item',
      entityId: item.id,
      action: 'construction.boq.item_updated',
    });

    return item;
  }

  private assertBoqEditable(status: ConstructionBoqStatus): void {
    if (status !== ConstructionBoqStatus.draft) {
      throw new BadRequestException(`BOQ in ${status} status is not editable`);
    }
  }

  private async recalculateTotal(
    tenantId: string,
    boqId: string,
  ): Promise<Prisma.Decimal> {
    const items = await this.prisma.constructionBoqItem.findMany({
      where: { tenantId, boqId },
      select: { originalAmount: true },
    });
    const total = sumBoqAmounts(items.map((item) => item.originalAmount));
    await this.prisma.constructionBoq.update({
      where: { id: boqId },
      data: { totalOriginalAmount: total },
    });
    return total;
  }

  private async getSection(tenantId: string, sectionId: string) {
    const section = await this.prisma.constructionBoqSection.findFirst({
      where: { id: sectionId, tenantId },
    });
    if (!section) {
      throw new NotFoundException('BOQ section not found');
    }
    return section;
  }

  private async getSectionForBoq(
    tenantId: string,
    boqId: string,
    sectionId: string,
  ) {
    const section = await this.prisma.constructionBoqSection.findFirst({
      where: { id: sectionId, tenantId, boqId },
    });
    if (!section) {
      throw new BadRequestException('Section does not belong to this BOQ');
    }
    return section;
  }

  private async getItem(tenantId: string, itemId: string) {
    const item = await this.prisma.constructionBoqItem.findFirst({
      where: { id: itemId, tenantId },
    });
    if (!item) {
      throw new NotFoundException('BOQ item not found');
    }
    return item;
  }

  private async validateSectionParent(
    tenantId: string,
    boqId: string,
    parentSectionId: string,
    sectionId: string | null,
  ): Promise<void> {
    if (sectionId && parentSectionId === sectionId) {
      throw new BadRequestException('Section cannot be its own parent');
    }

    const parent = await this.getSectionForBoq(tenantId, boqId, parentSectionId);
    if (parent.parentSectionId) {
      throw new BadRequestException('BOQ sections support at most two hierarchy levels');
    }

    if (sectionId) {
      const children = await this.prisma.constructionBoqSection.findMany({
        where: { tenantId, parentSectionId: sectionId },
      });
      if (children.length > 0 && parentSectionId) {
        throw new BadRequestException('Cannot create section hierarchy cycle');
      }
    }
  }

  private async validateItemReferences(
    tenantId: string,
    branchId: string,
    projectId: string,
    productId?: string,
    unitId?: string,
    costCenterId?: string,
  ): Promise<void> {
    if (productId) {
      const product = await this.prisma.product.findFirst({
        where: { id: productId, tenantId, isActive: true, deletedAt: null },
      });
      if (!product) {
        throw new BadRequestException('Invalid or inactive product');
      }
    }

    if (unitId) {
      const unit = await this.prisma.unitOfMeasure.findFirst({
        where: { id: unitId, tenantId, isActive: true },
      });
      if (!unit) {
        throw new BadRequestException('Invalid or inactive unit of measure');
      }
    }

    if (costCenterId) {
      await this.prisma.$transaction((tx) =>
        this.postingDimensions.assertCostEntryDimensions(
          tenantId,
          branchId,
          projectId,
          costCenterId,
          tx,
        ),
      );
    }
  }
}
