import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  RequireFeature,
  RequireModule,
  RequirePermissions,
  TenantId,
} from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import type { JwtPayload } from '@fratelanza/types';
import { ConstructionCostEntryService } from './construction-cost-entry.service';
import { ConstructionProjectProfileService } from './construction-project-profile.service';
import { CreateConstructionCostEntryDto } from './dto/construction-cost-entry.dto';
import {
  CreateConstructionProfileDto,
  ListConstructionCostEntriesQueryDto,
} from './dto/construction-profile.dto';
import { ProjectsService } from '../projects/projects.service';
import { PrismaService } from '../../database/prisma.service';

@Controller('construction')
@UseGuards(PermissionsGuard)
@RequireModule('construction')
export class ConstructionController {
  constructor(
    private profiles: ConstructionProjectProfileService,
    private costEntries: ConstructionCostEntryService,
    private projects: ProjectsService,
    private prisma: PrismaService,
  ) {}

  @Post('projects/:projectId/profile')
  @RequireFeature('construction.foundation')
  @RequirePermissions('construction:foundation:manage')
  async createProfile(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: CreateConstructionProfileDto,
  ) {
    const data = await this.profiles.create(
      tenantId,
      projectId,
      user.sub,
      dto.notes,
    );
    return { success: true, data };
  }

  @Get('projects/:projectId/profile')
  @RequireFeature('construction.foundation')
  @RequirePermissions('construction:foundation:read')
  async getProfile(
    @TenantId() tenantId: string,
    @Param('projectId') projectId: string,
  ) {
    const data = await this.profiles.getByProjectId(tenantId, projectId);
    return { success: true, data };
  }

  @Get('projects/:projectId/cost-entries')
  @RequireFeature('construction.foundation')
  @RequirePermissions('construction:foundation:read')
  async listCostEntries(
    @TenantId() tenantId: string,
    @Param('projectId') projectId: string,
    @Query() query: ListConstructionCostEntriesQueryDto,
  ) {
    await this.projects.findById(tenantId, projectId);
    const data = await this.costEntries.listByProject(tenantId, projectId, query);
    return {
      success: true,
      data: data.items,
      meta: {
        page: data.page,
        limit: data.limit,
        total: data.total,
        totalPages: data.totalPages,
      },
    };
  }

  @Post('projects/:projectId/cost-entries')
  @RequireFeature('construction.foundation')
  @RequirePermissions('construction:foundation:manage')
  async createCostEntry(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: CreateConstructionCostEntryDto,
  ) {
    const project = await this.projects.findById(tenantId, projectId);
    const branchId =
      dto.branchId ??
      project.branchId ??
      (await this.resolveDefaultBranchId(tenantId));

    const result = await this.costEntries.postEntry({
      tenantId,
      projectId,
      branchId,
      costCenterId: dto.costCenterId,
      category: dto.category,
      amount: dto.amount,
      currency: dto.currency,
      sourceModule: dto.sourceModule,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      sourceEvent: dto.sourceEvent,
      description: dto.description,
      occurredAt: new Date(dto.occurredAt),
      createdById: user.sub,
    });

    return {
      success: true,
      data: result.entry,
      meta: { created: result.created },
    };
  }

  @Get('cost-entries/:id')
  @RequireFeature('construction.foundation')
  @RequirePermissions('construction:foundation:read')
  async getCostEntry(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    const data = await this.costEntries.findById(tenantId, id);
    return { success: true, data };
  }

  private async resolveDefaultBranchId(tenantId: string): Promise<string> {
    const branch = await this.prisma.branch.findFirst({
      where: { tenantId, isDefault: true, deletedAt: null, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!branch) {
      throw new Error('No default branch configured for tenant');
    }
    return branch.id;
  }
}
