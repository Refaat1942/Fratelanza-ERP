import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConstructionBoqStatus,
  ConstructionContractStatus,
  ConstructionProgressStatus,
  Prisma,
} from '../../../../../packages/database/generated/server';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import {
  assertProgressStatusTransition,
  isProgressEditable,
} from './construction-progress-lifecycle';
import { ConstructionBoqService } from './construction-boq.service';
import { ConstructionContractService } from './construction-contract.service';
import {
  multiplyProgressAmount,
  sumBoqAmounts,
  toCumulativeQuantity,
  toProgressQuantity,
} from './construction-money.util';
import type {
  CreateConstructionProgressDto,
  CreateConstructionProgressItemDto,
  ListConstructionProgressQueryDto,
  RejectConstructionProgressDto,
  UpdateConstructionProgressDto,
  UpdateConstructionProgressItemDto,
} from './dto/construction-progress.dto';

const progressInclude = {
  contract: { select: { id: true, number: true, title: true, status: true } },
  boq: { select: { id: true, number: true, revisionNumber: true, status: true } },
  project: { select: { id: true, code: true, name: true } },
  items: { orderBy: { lineNumber: 'asc' as const } },
} satisfies Prisma.ConstructionProgressInclude;

@Injectable()
export class ConstructionProgressService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
    private audit: AuditService,
    private contracts: ConstructionContractService,
    private boqs: ConstructionBoqService,
  ) {}

  async list(tenantId: string, query: ListConstructionProgressQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ConstructionProgressWhereInput = {
      tenantId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(query.boqId ? { boqId: query.boqId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.constructionProgress.findMany({
        where,
        include: progressInclude,
        orderBy: [{ periodFrom: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.constructionProgress.count({ where }),
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
    const progress = await this.prisma.constructionProgress.findFirst({
      where: { id, tenantId },
      include: progressInclude,
    });
    if (!progress) {
      throw new NotFoundException('Construction progress not found');
    }
    return progress;
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateConstructionProgressDto,
  ) {
    const contract = await this.contracts.findById(tenantId, dto.contractId);
    const boq = await this.boqs.findById(tenantId, dto.boqId);
    this.assertBoqEligibleForProgress(boq, contract);
    this.validatePeriod(dto.periodFrom, dto.periodTo);

    const number = await this.documentNumbers.nextNumber(
      tenantId,
      'PRG',
      'PRG',
      contract.branchId,
    );

    try {
      const progress = await this.prisma.constructionProgress.create({
        data: {
          tenantId,
          projectId: contract.projectId,
          branchId: contract.branchId,
          contractId: contract.id,
          boqId: boq.id,
          number,
          periodFrom: new Date(dto.periodFrom),
          periodTo: new Date(dto.periodTo),
          currency: boq.currency,
          notes: dto.notes?.trim(),
          createdById: userId,
        },
        include: progressInclude,
      });

      await this.audit.log({
        tenantId,
        userId,
        branchId: contract.branchId,
        entity: 'construction_progress',
        entityId: progress.id,
        action: 'construction.progress.created',
        newValue: {
          number: progress.number,
          contractId: contract.id,
          boqId: boq.id,
        },
      });

      return progress;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Progress already exists for this contract, BOQ revision, and period',
        );
      }
      throw error;
    }
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateConstructionProgressDto,
  ) {
    const existing = await this.findById(tenantId, id);
    if (!isProgressEditable(existing.status)) {
      throw new BadRequestException(
        `Progress in ${existing.status} status is not editable`,
      );
    }

    const periodFrom = dto.periodFrom ?? existing.periodFrom.toISOString().slice(0, 10);
    const periodTo = dto.periodTo ?? existing.periodTo.toISOString().slice(0, 10);
    this.validatePeriod(periodFrom, periodTo);

    const progress = await this.prisma.constructionProgress.update({
      where: { id },
      data: {
        ...(dto.periodFrom !== undefined
          ? { periodFrom: new Date(dto.periodFrom) }
          : {}),
        ...(dto.periodTo !== undefined
          ? { periodTo: new Date(dto.periodTo) }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
      },
      include: progressInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_progress',
      entityId: progress.id,
      action: 'construction.progress.updated',
    });

    return progress;
  }

  async createItem(
    tenantId: string,
    progressId: string,
    userId: string,
    dto: CreateConstructionProgressItemDto,
  ) {
    const progress = await this.findById(tenantId, progressId);
    if (!isProgressEditable(progress.status)) {
      throw new BadRequestException('Only draft progress items can be edited');
    }

    const boqItem = await this.getBoqItemForProgress(
      tenantId,
      progress.boqId,
      dto.boqItemId,
    );

    const currentPeriodQuantity = toProgressQuantity(dto.currentPeriodQuantity);
    const previousCumulativeQuantity = await this.getApprovedCumulativeQuantity(
      tenantId,
      progress.boqId,
      dto.boqItemId,
    );
    const cumulativeQuantity = toCumulativeQuantity(
      previousCumulativeQuantity.add(currentPeriodQuantity),
    );

    if (cumulativeQuantity.gt(boqItem.plannedQuantity)) {
      throw new BadRequestException(
        'Cumulative quantity exceeds BOQ planned quantity',
      );
    }

    const unitRateSnapshot = boqItem.unitRate;
    const currentPeriodAmount = multiplyProgressAmount(
      currentPeriodQuantity,
      unitRateSnapshot,
    );
    const cumulativeAmount = multiplyProgressAmount(
      cumulativeQuantity,
      unitRateSnapshot,
    );

    const item = await this.prisma.constructionProgressItem.create({
      data: {
        tenantId,
        progressId,
        boqItemId: dto.boqItemId,
        lineNumber: dto.lineNumber ?? boqItem.lineNumber,
        currentPeriodQuantity,
        previousCumulativeQuantity,
        cumulativeQuantity,
        unitRateSnapshot,
        currentPeriodAmount,
        cumulativeAmount,
        costCenterId: boqItem.costCenterId,
        costCode: boqItem.costCode,
        notes: dto.notes?.trim(),
      },
    });

    await this.recalculateTotals(tenantId, progressId);
    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_progress',
      entityId: progressId,
      action: 'construction.progress.updated',
    });

    return item;
  }

  async updateItem(
    tenantId: string,
    itemId: string,
    userId: string,
    dto: UpdateConstructionProgressItemDto,
  ) {
    const existing = await this.getItem(tenantId, itemId);
    const progress = await this.findById(tenantId, existing.progressId);
    if (!isProgressEditable(progress.status)) {
      throw new BadRequestException('Only draft progress items can be edited');
    }

    const boqItem = await this.getBoqItemForProgress(
      tenantId,
      progress.boqId,
      existing.boqItemId,
    );

    const currentPeriodQuantity = dto.currentPeriodQuantity
      ? toProgressQuantity(dto.currentPeriodQuantity)
      : existing.currentPeriodQuantity;

    const previousCumulativeQuantity = await this.getApprovedCumulativeQuantity(
      tenantId,
      progress.boqId,
      existing.boqItemId,
    );
    const cumulativeQuantity = toCumulativeQuantity(
      previousCumulativeQuantity.add(currentPeriodQuantity),
    );

    if (cumulativeQuantity.gt(boqItem.plannedQuantity)) {
      throw new BadRequestException(
        'Cumulative quantity exceeds BOQ planned quantity',
      );
    }

    const unitRateSnapshot = existing.unitRateSnapshot;
    const item = await this.prisma.constructionProgressItem.update({
      where: { id: itemId },
      data: {
        currentPeriodQuantity,
        previousCumulativeQuantity,
        cumulativeQuantity,
        currentPeriodAmount: multiplyProgressAmount(
          currentPeriodQuantity,
          unitRateSnapshot,
        ),
        cumulativeAmount: multiplyProgressAmount(
          cumulativeQuantity,
          unitRateSnapshot,
        ),
        ...(dto.lineNumber !== undefined ? { lineNumber: dto.lineNumber } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
      },
    });

    await this.recalculateTotals(tenantId, existing.progressId);
    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_progress',
      entityId: existing.progressId,
      action: 'construction.progress.updated',
    });

    return item;
  }

  async submit(tenantId: string, id: string, userId: string) {
    const existing = await this.findById(tenantId, id);
    if (existing.status === ConstructionProgressStatus.submitted) {
      return existing;
    }
    assertProgressStatusTransition(
      existing.status,
      ConstructionProgressStatus.submitted,
    );

    const contract = await this.contracts.findById(tenantId, existing.contractId);
    this.assertContractActiveForProgress(contract.status);

    if (existing.items.length === 0) {
      throw new BadRequestException('Progress must have at least one item');
    }

    await this.validateItemsForSubmit(tenantId, existing);

    const updated = await this.prisma.constructionProgress.updateMany({
      where: {
        id,
        tenantId,
        status: ConstructionProgressStatus.draft,
      },
      data: {
        status: ConstructionProgressStatus.submitted,
        submittedAt: new Date(),
        submittedById: userId,
        rejectedAt: null,
        rejectedById: null,
        rejectionReason: null,
      },
    });

    if (updated.count === 0) {
      throw new ConflictException('Progress submit conflict — refresh and retry');
    }

    const progress = await this.findById(tenantId, id);

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_progress',
      entityId: progress.id,
      action: 'construction.progress.submitted',
    });

    return progress;
  }

  async approve(tenantId: string, id: string, userId: string) {
    const existing = await this.findById(tenantId, id);
    if (existing.status === ConstructionProgressStatus.approved) {
      return existing;
    }
    assertProgressStatusTransition(
      existing.status,
      ConstructionProgressStatus.approved,
    );

    const contract = await this.contracts.findById(tenantId, existing.contractId);
    this.assertContractActiveForProgress(contract.status);

    await this.validateItemsForSubmit(tenantId, existing);

    const updated = await this.prisma.constructionProgress.updateMany({
      where: {
        id,
        tenantId,
        status: ConstructionProgressStatus.submitted,
      },
      data: {
        status: ConstructionProgressStatus.approved,
        approvedAt: new Date(),
        approvedById: userId,
      },
    });

    if (updated.count === 0) {
      throw new ConflictException('Progress approve conflict — refresh and retry');
    }

    const progress = await this.findById(tenantId, id);

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_progress',
      entityId: progress.id,
      action: 'construction.progress.approved',
    });

    return progress;
  }

  async reject(
    tenantId: string,
    id: string,
    userId: string,
    dto: RejectConstructionProgressDto,
  ) {
    const existing = await this.findById(tenantId, id);
    assertProgressStatusTransition(
      existing.status,
      ConstructionProgressStatus.rejected,
    );

    const updated = await this.prisma.constructionProgress.updateMany({
      where: {
        id,
        tenantId,
        status: ConstructionProgressStatus.submitted,
      },
      data: {
        status: ConstructionProgressStatus.rejected,
        rejectedAt: new Date(),
        rejectedById: userId,
        rejectionReason: dto.reason?.trim(),
      },
    });

    if (updated.count === 0) {
      throw new ConflictException('Progress reject conflict — refresh and retry');
    }

    const progress = await this.findById(tenantId, id);

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_progress',
      entityId: progress.id,
      action: 'construction.progress.rejected',
      newValue: { reason: dto.reason ?? null },
    });

    return progress;
  }

  async returnToDraft(tenantId: string, id: string, userId: string) {
    const existing = await this.findById(tenantId, id);
    assertProgressStatusTransition(
      existing.status,
      ConstructionProgressStatus.draft,
    );

    const progress = await this.prisma.constructionProgress.update({
      where: { id, status: ConstructionProgressStatus.rejected },
      data: {
        status: ConstructionProgressStatus.draft,
        submittedAt: null,
        submittedById: null,
        rejectedAt: null,
        rejectedById: null,
        rejectionReason: null,
      },
      include: progressInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_progress',
      entityId: progress.id,
      action: 'construction.progress.updated',
      newValue: { status: ConstructionProgressStatus.draft },
    });

    return progress;
  }

  async archive(tenantId: string, id: string, userId: string) {
    const existing = await this.findById(tenantId, id);
    assertProgressStatusTransition(
      existing.status,
      ConstructionProgressStatus.archived,
    );

    const progress = await this.prisma.constructionProgress.update({
      where: { id },
      data: { status: ConstructionProgressStatus.archived },
      include: progressInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_progress',
      entityId: progress.id,
      action: 'construction.progress.archived',
    });

    return progress;
  }

  private async getApprovedCumulativeQuantity(
    tenantId: string,
    boqId: string,
    boqItemId: string,
  ): Promise<Prisma.Decimal> {
    const lastApproved = await this.prisma.constructionProgressItem.findFirst({
      where: {
        tenantId,
        boqItemId,
        progress: {
          boqId,
          status: ConstructionProgressStatus.approved,
        },
      },
      orderBy: [{ progress: { periodTo: 'desc' } }, { progress: { approvedAt: 'desc' } }],
      select: { cumulativeQuantity: true },
    });

    return lastApproved?.cumulativeQuantity ?? new Prisma.Decimal(0);
  }

  private async validateItemsForSubmit(
    tenantId: string,
    progress: Awaited<ReturnType<typeof this.findById>>,
  ) {
    for (const item of progress.items) {
      const boqItem = await this.getBoqItemForProgress(
        tenantId,
        progress.boqId,
        item.boqItemId,
      );
      const expectedPrevious = await this.getApprovedCumulativeQuantity(
        tenantId,
        progress.boqId,
        item.boqItemId,
      );
      if (!item.previousCumulativeQuantity.eq(expectedPrevious)) {
        throw new BadRequestException(
          'Progress item cumulative baseline is stale — refresh draft lines',
        );
      }
      const expectedCumulative = expectedPrevious.add(item.currentPeriodQuantity);
      if (!item.cumulativeQuantity.eq(expectedCumulative)) {
        throw new BadRequestException('Progress item cumulative quantity is inconsistent');
      }
      if (item.cumulativeQuantity.gt(boqItem.plannedQuantity)) {
        throw new BadRequestException(
          'Cumulative quantity exceeds BOQ planned quantity',
        );
      }
    }
  }

  private async recalculateTotals(tenantId: string, progressId: string) {
    const items = await this.prisma.constructionProgressItem.findMany({
      where: { tenantId, progressId },
      select: { currentPeriodAmount: true, cumulativeAmount: true },
    });
    await this.prisma.constructionProgress.update({
      where: { id: progressId },
      data: {
        totalCurrentAmount: sumBoqAmounts(
          items.map((item) => item.currentPeriodAmount),
        ),
        totalCumulativeAmount: sumBoqAmounts(
          items.map((item) => item.cumulativeAmount),
        ),
      },
    });
  }

  private async getItem(tenantId: string, itemId: string) {
    const item = await this.prisma.constructionProgressItem.findFirst({
      where: { id: itemId, tenantId },
    });
    if (!item) {
      throw new NotFoundException('Progress item not found');
    }
    return item;
  }

  private async getBoqItemForProgress(
    tenantId: string,
    boqId: string,
    boqItemId: string,
  ) {
    const item = await this.prisma.constructionBoqItem.findFirst({
      where: { id: boqItemId, tenantId, boqId },
    });
    if (!item) {
      throw new BadRequestException('BOQ item does not belong to this progress BOQ revision');
    }
    return item;
  }

  private assertBoqEligibleForProgress(
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
      throw new BadRequestException('Progress requires an approved BOQ revision');
    }
  }

  private assertContractActiveForProgress(status: ConstructionContractStatus) {
    if (status !== ConstructionContractStatus.active) {
      throw new BadRequestException(
        `Contract must be active for progress submit/approve (current: ${status})`,
      );
    }
  }

  private validatePeriod(periodFrom: string, periodTo: string) {
    if (new Date(periodFrom) > new Date(periodTo)) {
      throw new BadRequestException('periodFrom must be before or equal to periodTo');
    }
  }
}
