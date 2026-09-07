import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PartyStatus,
  Prisma,
  ProjectStatus,
} from '../../../../../packages/database/generated/server';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type {
  CreateProjectDto,
  ListProjectsQueryDto,
  UpdateProjectDto,
} from './dto/project.dto';
import {
  assertProjectStatusTransition,
  canTransitionToArchived,
} from './project-lifecycle';

const projectInclude = {
  branch: { select: { id: true, code: true, name: true } },
  customerParty: { select: { id: true, code: true, displayName: true } },
  manager: { select: { id: true, firstName: true, lastName: true, email: true } },
  _count: { select: { costCenters: true } },
} satisfies Prisma.ProjectInclude;

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
    private audit: AuditService,
  ) {}

  async list(tenantId: string, query: ListProjectsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = this.buildListWhere(tenantId, query);

    const search = query.search?.trim();
    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: projectInclude,
        orderBy: search
          ? [{ createdAt: 'desc' }, { code: 'asc' }]
          : [{ code: 'asc' }, { name: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.project.count({ where }),
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
    const project = await this.prisma.project.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: projectInclude,
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  async create(tenantId: string, userId: string, dto: CreateProjectDto) {
    await this.validateBranch(tenantId, dto.branchId);
    await this.validateCustomerParty(tenantId, dto.customerPartyId);
    await this.validateManagerUser(tenantId, dto.managerUserId);
    this.validateDateRange(dto.startDate, dto.endDate);

    const status = dto.status ?? ProjectStatus.draft;
    if (status !== ProjectStatus.draft) {
      assertProjectStatusTransition(ProjectStatus.draft, status);
    }

    const numberingBranchId = await this.resolveNumberingBranchId(
      tenantId,
      dto.branchId,
    );
    const code = dto.code?.trim() ?? await this.documentNumbers.nextNumber(
      tenantId,
      'PRJ',
      'PRJ',
      numberingBranchId,
    );

    const existing = await this.prisma.project.findUnique({
      where: { tenantId_code: { tenantId, code } },
    });
    if (existing) {
      throw new ConflictException('Project code already exists');
    }

    const project = await this.prisma.project.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        code,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        status,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        customerPartyId: dto.customerPartyId,
        managerUserId: dto.managerUserId,
      },
      include: projectInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      branchId: project.branchId,
      entity: 'project',
      entityId: project.id,
      action: 'projects.project.created',
      newValue: {
        code: project.code,
        name: project.name,
        status: project.status,
      },
    });

    return project;
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateProjectDto,
  ) {
    const existing = await this.findById(tenantId, id);
    if (existing.status === ProjectStatus.archived) {
      throw new BadRequestException('Archived projects cannot be updated');
    }

    if (dto.branchId !== undefined) {
      await this.validateBranch(tenantId, dto.branchId ?? undefined);
    }
    if (dto.customerPartyId !== undefined) {
      await this.validateCustomerParty(tenantId, dto.customerPartyId ?? undefined);
    }
    if (dto.managerUserId !== undefined) {
      await this.validateManagerUser(tenantId, dto.managerUserId ?? undefined);
    }

    const startDate = dto.startDate === undefined
      ? existing.startDate
      : dto.startDate ? new Date(dto.startDate) : null;
    const endDate = dto.endDate === undefined
      ? existing.endDate
      : dto.endDate ? new Date(dto.endDate) : null;
    this.validateDateRange(
      startDate?.toISOString().slice(0, 10),
      endDate?.toISOString().slice(0, 10),
    );

    if (dto.status && dto.status !== existing.status) {
      assertProjectStatusTransition(existing.status, dto.status);
    }

    const project = await this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description === undefined
          ? undefined
          : dto.description?.trim() ?? null,
        branchId: dto.branchId,
        customerPartyId: dto.customerPartyId,
        managerUserId: dto.managerUserId,
        startDate: dto.startDate === undefined
          ? undefined
          : dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate === undefined
          ? undefined
          : dto.endDate ? new Date(dto.endDate) : null,
        status: dto.status,
      },
      include: projectInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      branchId: project.branchId,
      entity: 'project',
      entityId: project.id,
      action: 'projects.project.updated',
      oldValue: {
        name: existing.name,
        status: existing.status,
        branchId: existing.branchId,
      },
      newValue: {
        name: project.name,
        status: project.status,
        branchId: project.branchId,
      },
    });

    return project;
  }

  async archive(tenantId: string, id: string, userId: string) {
    const existing = await this.findById(tenantId, id);
    if (existing.status === ProjectStatus.archived) {
      return existing;
    }
    if (!canTransitionToArchived(existing.status)) {
      throw new BadRequestException('Project cannot be archived from current status');
    }

    const project = await this.prisma.project.update({
      where: { id },
      data: {
        status: ProjectStatus.archived,
        deletedAt: new Date(),
      },
      include: projectInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      branchId: project.branchId,
      entity: 'project',
      entityId: project.id,
      action: 'projects.project.archived',
      oldValue: { status: existing.status },
      newValue: { status: project.status },
    });

    return project;
  }

  async assertProjectForTenant(
    tenantId: string,
    projectId: string,
    options?: { allowArchived?: boolean },
  ) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        tenantId,
        deletedAt: null,
        ...(options?.allowArchived ? {} : { status: { not: ProjectStatus.archived } }),
      },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  private buildListWhere(
    tenantId: string,
    query: ListProjectsQueryDto,
  ): Prisma.ProjectWhereInput {
    const where: Prisma.ProjectWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    } else {
      where.status = { not: ProjectStatus.archived };
    }

    if (query.branchId) {
      where.branchId = query.branchId;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async validateBranch(tenantId: string, branchId?: string) {
    if (!branchId) return;
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId, deletedAt: null, isActive: true },
    });
    if (!branch) {
      throw new BadRequestException('Branch not found');
    }
  }

  private async validateCustomerParty(tenantId: string, partyId?: string) {
    if (!partyId) return;
    const party = await this.prisma.party.findFirst({
      where: {
        id: partyId,
        tenantId,
        deletedAt: null,
        status: PartyStatus.active,
      },
    });
    if (!party) {
      throw new BadRequestException('Party not found');
    }
  }

  private async validateManagerUser(tenantId: string, userId?: string) {
    if (!userId) return;
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        deletedAt: null,
        isActive: true,
      },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }
  }

  private validateDateRange(startDate?: string, endDate?: string) {
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException('End date cannot be before start date');
    }
  }

  private async resolveNumberingBranchId(
    tenantId: string,
    branchId?: string,
  ): Promise<string> {
    if (branchId) return branchId;
    const branch = await this.prisma.branch.findFirst({
      where: { tenantId, isDefault: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (!branch) {
      throw new BadRequestException('No default branch configured for tenant');
    }
    return branch.id;
  }
}
