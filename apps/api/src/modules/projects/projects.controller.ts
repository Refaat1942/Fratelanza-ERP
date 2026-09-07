import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import {
  CreateProjectDto,
  ListProjectsQueryDto,
  UpdateProjectDto,
} from './dto/project.dto';
import { ListCostCentersQueryDto } from './dto/cost-center.dto';
import { CostCentersService } from './cost-centers.service';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(PermissionsGuard)
@RequireModule('projects')
export class ProjectsController {
  constructor(
    private projectsService: ProjectsService,
    private costCentersService: CostCentersService,
  ) {}

  @Get()
  @RequireFeature('projects.projects')
  @RequirePermissions('projects:projects:read')
  async list(
    @TenantId() tenantId: string,
    @Query() query: ListProjectsQueryDto,
  ) {
    const data = await this.projectsService.list(tenantId, query);
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

  @Get(':id/cost-centers')
  @RequireFeature('projects.cost-centers')
  @RequirePermissions('projects:cost-centers:read')
  async listCostCenters(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Query() query: ListCostCentersQueryDto,
  ) {
    await this.projectsService.findById(tenantId, id);
    const data = await this.costCentersService.list(tenantId, {
      ...query,
      projectId: id,
    });
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

  @Get(':id')
  @RequireFeature('projects.projects')
  @RequirePermissions('projects:projects:read')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.projectsService.findById(tenantId, id);
    return { success: true, data };
  }

  @Post()
  @RequireFeature('projects.projects')
  @RequirePermissions('projects:projects:create')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateProjectDto,
  ) {
    const data = await this.projectsService.create(tenantId, user.sub, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @RequireFeature('projects.projects')
  @RequirePermissions('projects:projects:update')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProjectDto,
  ) {
    const data = await this.projectsService.update(tenantId, id, user.sub, dto);
    return { success: true, data };
  }

  @Post(':id/archive')
  @RequireFeature('projects.projects')
  @RequirePermissions('projects:projects:archive')
  async archive(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.projectsService.archive(tenantId, id, user.sub);
    return { success: true, data };
  }
}
