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
  CreateCostCenterDto,
  ListCostCentersQueryDto,
  UpdateCostCenterDto,
} from './dto/cost-center.dto';
import { CostCentersService } from './cost-centers.service';

@Controller('cost-centers')
@UseGuards(PermissionsGuard)
@RequireModule('projects')
export class CostCentersController {
  constructor(private costCentersService: CostCentersService) {}

  @Get()
  @RequireFeature('projects.cost-centers')
  @RequirePermissions('projects:cost-centers:read')
  async list(
    @TenantId() tenantId: string,
    @Query() query: ListCostCentersQueryDto,
  ) {
    const data = await this.costCentersService.list(tenantId, query);
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
  @RequireFeature('projects.cost-centers')
  @RequirePermissions('projects:cost-centers:read')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.costCentersService.findById(tenantId, id);
    return { success: true, data };
  }

  @Post()
  @RequireFeature('projects.cost-centers')
  @RequirePermissions('projects:cost-centers:manage')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCostCenterDto,
  ) {
    const data = await this.costCentersService.create(tenantId, user.sub, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @RequireFeature('projects.cost-centers')
  @RequirePermissions('projects:cost-centers:manage')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateCostCenterDto,
  ) {
    const data = await this.costCentersService.update(tenantId, id, user.sub, dto);
    return { success: true, data };
  }

  @Post(':id/archive')
  @RequireFeature('projects.cost-centers')
  @RequirePermissions('projects:cost-centers:manage')
  async archive(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.costCentersService.archive(tenantId, id, user.sub);
    return { success: true, data };
  }
}
