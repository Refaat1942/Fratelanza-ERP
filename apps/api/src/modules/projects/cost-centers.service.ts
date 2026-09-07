import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectStatus } from '../../../../../packages/database/generated/server';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type {
  CreateCostCenterDto,
  ListCostCentersQueryDto,
  UpdateCostCenterDto,
} from './dto/cost-center.dto';
import { ProjectsService } from './projects.service';

const MAX_HIERARCHY_DEPTH = 8;

const costCenterInclude = {
  branch: { select: { id: true, code: true, name: true } },
  parent: { select: { id: true, code: true, name: true } },
  project: { select: { id: true, code: true, name: true, status: true } },
  _count: { select: { children: true } },
} satisfies Prisma.CostCenterInclude;

@Injectable()
export class CostCentersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private projectsService: ProjectsService,
  ) {}

  async list(tenantId: string, query: ListCostCentersQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = this.buildListWhere(tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.costCenter.findMany({
        where,
        include: costCenterInclude,
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.costCenter.count({ where }),
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
    const costCenter = await this.prisma.costCenter.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: costCenterInclude,
    });
    if (!costCenter) {
      throw new NotFoundException('Cost center not found');
    }
    return costCenter;
  }

  async create(tenantId: string, userId: string, dto: CreateCostCenterDto) {
    const code = dto.code.trim();
    await this.validateBranch(tenantId, dto.branchId);
    if (dto.parentId) {
      await this.validateParent(tenantId, dto.parentId);
    }
    if (dto.projectId) {
      const project = await this.projectsService.assertProjectForTenant(
        tenantId,
        dto.projectId,
      );
      this.assertBranchCompatibility(project.branchId, dto.branchId);
    }

    const existing = await this.prisma.costCenter.findUnique({
      where: { tenantId_code: { tenantId, code } },
    });
    if (existing) {
      throw new ConflictException('Cost center code already exists');
    }

    const costCenter = await this.prisma.costCenter.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        parentId: dto.parentId,
        projectId: dto.projectId,
        code,
        name: dto.name.trim(),
        description: dto.description?.trim(),
      },
      include: costCenterInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      branchId: costCenter.branchId,
      entity: 'cost_center',
      entityId: costCenter.id,
      action: 'projects.cost_center.created',
      newValue: {
        code: costCenter.code,
        name: costCenter.name,
        projectId: costCenter.projectId,
        parentId: costCenter.parentId,
      },
    });

    return costCenter;
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateCostCenterDto,
  ) {
    const existing = await this.findById(tenantId, id);
    if (existing.deletedAt) {
      throw new BadRequestException('Archived cost centers cannot be updated');
    }

    if (dto.branchId !== undefined) {
      await this.validateBranch(tenantId, dto.branchId ?? undefined);
    }
    if (dto.parentId !== undefined && dto.parentId) {
      await this.validateParent(tenantId, dto.parentId, id);
    }
    if (dto.projectId !== undefined && dto.projectId) {
      const project = await this.projectsService.assertProjectForTenant(
        tenantId,
        dto.projectId,
      );
      const branchId = dto.branchId === undefined ? existing.branchId : dto.branchId;
      this.assertBranchCompatibility(project.branchId, branchId ?? undefined);
    }

    const costCenter = await this.prisma.costCenter.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description === undefined
          ? undefined
          : dto.description?.trim() ?? null,
        branchId: dto.branchId,
        parentId: dto.parentId,
        projectId: dto.projectId,
        isActive: dto.isActive,
      },
      include: costCenterInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      branchId: costCenter.branchId,
      entity: 'cost_center',
      entityId: costCenter.id,
      action: 'projects.cost_center.updated',
      oldValue: {
        name: existing.name,
        projectId: existing.projectId,
        parentId: existing.parentId,
        isActive: existing.isActive,
      },
      newValue: {
        name: costCenter.name,
        projectId: costCenter.projectId,
        parentId: costCenter.parentId,
        isActive: costCenter.isActive,
      },
    });

    return costCenter;
  }

  async archive(tenantId: string, id: string, userId: string) {
    const existing = await this.findById(tenantId, id);
    if (existing.deletedAt) {
      return existing;
    }

    const activeChildren = await this.prisma.costCenter.count({
      where: {
        tenantId,
        parentId: id,
        deletedAt: null,
        isActive: true,
      },
    });
    if (activeChildren > 0) {
      throw new BadRequestException(
        'Cost center has active child cost centers and cannot be archived',
      );
    }

    const costCenter = await this.prisma.costCenter.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
      include: costCenterInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      branchId: costCenter.branchId,
      entity: 'cost_center',
      entityId: costCenter.id,
      action: 'projects.cost_center.archived',
      oldValue: { isActive: existing.isActive },
      newValue: { isActive: costCenter.isActive },
    });

    return costCenter;
  }

  private buildListWhere(
    tenantId: string,
    query: ListCostCentersQueryDto,
  ): Prisma.CostCenterWhereInput {
    const where: Prisma.CostCenterWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (query.projectId) {
      where.projectId = query.projectId;
    }
    if (query.parentId) {
      where.parentId = query.parentId;
    }
    if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    } else {
      where.isActive = true;
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

  private async validateParent(
    tenantId: string,
    parentId: string,
    selfId?: string,
  ) {
    if (selfId && parentId === selfId) {
      throw new BadRequestException('Cost center cannot be its own parent');
    }

    const parent = await this.prisma.costCenter.findFirst({
      where: {
        id: parentId,
        tenantId,
        deletedAt: null,
        isActive: true,
      },
    });
    if (!parent) {
      throw new BadRequestException('Parent cost center not found');
    }

    if (selfId) {
      await this.assertNoCycle(tenantId, selfId, parentId);
      await this.assertHierarchyDepth(tenantId, parentId);
    }
  }

  private async assertNoCycle(
    tenantId: string,
    selfId: string,
    newParentId: string,
  ) {
    let currentId: string | null = newParentId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === selfId) {
        throw new BadRequestException('Cost center hierarchy cannot contain a cycle');
      }
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const node: { parentId: string | null } | null = await this.prisma.costCenter.findFirst({
        where: { id: currentId, tenantId },
        select: { parentId: true },
      });
      currentId = node?.parentId ?? null;
    }
  }

  private async assertHierarchyDepth(tenantId: string, parentId: string) {
    let depth = 1;
    let currentId: string | null = parentId;

    while (currentId) {
      if (depth >= MAX_HIERARCHY_DEPTH) {
        throw new BadRequestException('Cost center hierarchy depth limit exceeded');
      }
      const node: { parentId: string | null } | null = await this.prisma.costCenter.findFirst({
        where: { id: currentId, tenantId },
        select: { parentId: true },
      });
      currentId = node?.parentId ?? null;
      depth += 1;
    }
  }

  private assertBranchCompatibility(
    projectBranchId: string | null,
    costCenterBranchId?: string,
  ) {
    if (!projectBranchId || !costCenterBranchId) return;
    if (projectBranchId !== costCenterBranchId) {
      throw new BadRequestException(
        'Cost center branch must match project branch or be tenant-wide',
      );
    }
  }
}
