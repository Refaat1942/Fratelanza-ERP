import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConstructionContractDirection,
  ConstructionContractStatus,
  PartyRoleType,
  Prisma,
} from '../../../../../packages/database/generated/server';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { PartyRolesService } from '../parties/party-roles.service';
import { PartiesService } from '../parties/parties.service';
import { ProjectsService } from '../projects/projects.service';
import {
  assertContractStatusTransition,
  isContractEditable,
  isContractLimitedEditable,
} from './construction-contract-lifecycle';
import { toBoqDecimal } from './construction-money.util';
import type {
  CreateConstructionContractDto,
  ListConstructionContractsQueryDto,
  UpdateConstructionContractDto,
} from './dto/construction-contract.dto';

const contractInclude = {
  project: { select: { id: true, code: true, name: true, status: true } },
  branch: { select: { id: true, code: true, name: true } },
  party: { select: { id: true, code: true, displayName: true } },
  _count: { select: { boqs: true } },
} satisfies Prisma.ConstructionContractInclude;

@Injectable()
export class ConstructionContractService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
    private audit: AuditService,
    private projects: ProjectsService,
    private parties: PartiesService,
    private partyRoles: PartyRolesService,
  ) {}

  async list(tenantId: string, query: ListConstructionContractsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const search = query.search?.trim();

    const where: Prisma.ConstructionContractWhereInput = {
      tenantId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.direction ? { direction: query.direction } : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              { title: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.constructionContract.findMany({
        where,
        include: contractInclude,
        orderBy: [{ createdAt: 'desc' }, { number: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.constructionContract.count({ where }),
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
    const contract = await this.prisma.constructionContract.findFirst({
      where: { id, tenantId },
      include: contractInclude,
    });
    if (!contract) {
      throw new NotFoundException('Construction contract not found');
    }
    return contract;
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateConstructionContractDto,
  ) {
    const project = await this.projects.findById(tenantId, dto.projectId);
    await this.assertConstructionProfile(tenantId, dto.projectId);
    await this.parties.assertActiveParty(tenantId, dto.partyId);
    await this.validatePartyDirection(tenantId, dto.partyId, dto.direction);
    this.validateDateRange(dto.startDate, dto.endDate);

    const branchId = await this.resolveBranchId(tenantId, project.branchId);
    const number = await this.documentNumbers.nextNumber(
      tenantId,
      'CNT',
      'CNT',
      branchId,
    );

    const contract = await this.prisma.constructionContract.create({
      data: {
        tenantId,
        projectId: dto.projectId,
        branchId,
        number,
        title: dto.title.trim(),
        description: dto.description?.trim(),
        direction: dto.direction,
        partyId: dto.partyId,
        pricingModel: dto.pricingModel,
        originalValue: dto.originalValue
          ? toBoqDecimal(dto.originalValue, 'originalValue')
          : new Prisma.Decimal(0),
        originalValueLocked: dto.originalValueLocked ?? false,
        currency: dto.currency?.trim() || 'EGP',
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        retentionPercent: dto.retentionPercent
          ? toBoqDecimal(dto.retentionPercent, 'retentionPercent')
          : null,
        retentionCap: dto.retentionCap
          ? toBoqDecimal(dto.retentionCap, 'retentionCap')
          : null,
        advanceAmount: dto.advanceAmount
          ? toBoqDecimal(dto.advanceAmount, 'advanceAmount')
          : null,
        advancePercent: dto.advancePercent
          ? toBoqDecimal(dto.advancePercent, 'advancePercent')
          : null,
        paymentTerms: dto.paymentTerms?.trim(),
        createdById: userId,
      },
      include: contractInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      branchId,
      entity: 'construction_contract',
      entityId: contract.id,
      action: 'construction.contract.created',
      newValue: {
        number: contract.number,
        direction: contract.direction,
        projectId: contract.projectId,
      },
    });

    return contract;
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateConstructionContractDto,
  ) {
    const existing = await this.findById(tenantId, id);
    if (existing.status === ConstructionContractStatus.archived) {
      throw new BadRequestException('Archived contracts cannot be updated');
    }

    const limitedOnly = isContractLimitedEditable(existing.status);
    if (!isContractEditable(existing.status) && !limitedOnly) {
      throw new BadRequestException(
        `Contract in ${existing.status} status cannot be updated`,
      );
    }

    if (limitedOnly) {
      const allowedKeys = new Set([
        'description',
        'startDate',
        'endDate',
        'paymentTerms',
        'retentionPercent',
        'retentionCap',
        'advanceAmount',
        'advancePercent',
      ]);
      const invalid = Object.keys(dto).filter(
        (key) => dto[key as keyof UpdateConstructionContractDto] !== undefined
          && !allowedKeys.has(key),
      );
      if (invalid.length > 0) {
        throw new BadRequestException(
          `Active contracts only allow limited field updates: ${invalid.join(', ')}`,
        );
      }
    }

    if (dto.startDate || dto.endDate) {
      this.validateDateRange(
        dto.startDate ?? existing.startDate?.toISOString().slice(0, 10),
        dto.endDate ?? existing.endDate?.toISOString().slice(0, 10),
      );
    }

    const contract = await this.prisma.constructionContract.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
        ...(dto.pricingModel !== undefined
          ? { pricingModel: dto.pricingModel }
          : {}),
        ...(dto.originalValue !== undefined
          ? { originalValue: toBoqDecimal(dto.originalValue, 'originalValue') }
          : {}),
        ...(dto.originalValueLocked !== undefined
          ? { originalValueLocked: dto.originalValueLocked }
          : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency.trim() } : {}),
        ...(dto.startDate !== undefined
          ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
          : {}),
        ...(dto.retentionPercent !== undefined
          ? {
              retentionPercent: dto.retentionPercent
                ? toBoqDecimal(dto.retentionPercent, 'retentionPercent')
                : null,
            }
          : {}),
        ...(dto.retentionCap !== undefined
          ? {
              retentionCap: dto.retentionCap
                ? toBoqDecimal(dto.retentionCap, 'retentionCap')
                : null,
            }
          : {}),
        ...(dto.advanceAmount !== undefined
          ? {
              advanceAmount: dto.advanceAmount
                ? toBoqDecimal(dto.advanceAmount, 'advanceAmount')
                : null,
            }
          : {}),
        ...(dto.advancePercent !== undefined
          ? {
              advancePercent: dto.advancePercent
                ? toBoqDecimal(dto.advancePercent, 'advancePercent')
                : null,
            }
          : {}),
        ...(dto.paymentTerms !== undefined
          ? { paymentTerms: dto.paymentTerms?.trim() ?? null }
          : {}),
      },
      include: contractInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      branchId: contract.branchId,
      entity: 'construction_contract',
      entityId: contract.id,
      action: 'construction.contract.updated',
      newValue: { status: contract.status },
    });

    return contract;
  }

  async transitionStatus(
    tenantId: string,
    id: string,
    userId: string,
    toStatus: ConstructionContractStatus,
  ) {
    const existing = await this.findById(tenantId, id);
    assertContractStatusTransition(existing.status, toStatus);

    const contract = await this.prisma.constructionContract.update({
      where: { id },
      data: { status: toStatus },
      include: contractInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      branchId: contract.branchId,
      entity: 'construction_contract',
      entityId: contract.id,
      action: 'construction.contract.status_changed',
      oldValue: { status: existing.status },
      newValue: { status: toStatus },
    });

    return contract;
  }

  async archive(tenantId: string, id: string, userId: string) {
    return this.transitionStatus(
      tenantId,
      id,
      userId,
      ConstructionContractStatus.archived,
    );
  }

  private async assertConstructionProfile(
    tenantId: string,
    projectId: string,
  ): Promise<void> {
    const profile = await this.prisma.constructionProjectProfile.findFirst({
      where: { tenantId, projectId },
    });
    if (!profile) {
      throw new BadRequestException(
        'Construction profile must exist before creating contracts',
      );
    }
  }

  private async validatePartyDirection(
    tenantId: string,
    partyId: string,
    direction: ConstructionContractDirection,
  ): Promise<void> {
    const requiredRole =
      direction === ConstructionContractDirection.customer
        ? PartyRoleType.customer
        : PartyRoleType.subcontractor;
    await this.partyRoles.assertActiveRole(tenantId, partyId, requiredRole);
  }

  private validateDateRange(startDate?: string | null, endDate?: string | null) {
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      throw new BadRequestException('startDate must be before endDate');
    }
  }

  private async resolveBranchId(
    tenantId: string,
    projectBranchId: string | null,
  ): Promise<string> {
    if (projectBranchId) return projectBranchId;
    const branch = await this.prisma.branch.findFirst({
      where: { tenantId, isDefault: true, deletedAt: null, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!branch) {
      throw new BadRequestException('No default branch configured for tenant');
    }
    return branch.id;
  }
}
