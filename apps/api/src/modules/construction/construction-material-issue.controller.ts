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
import { ConstructionMaterialIssueService } from './construction-material-issue.service';
import {
  CreateConstructionMaterialIssueDto,
  ListConstructionMaterialIssuesQueryDto,
} from './dto/construction-material-issue.dto';

@Controller('construction/material-issues')
@UseGuards(PermissionsGuard)
@RequireModule('construction')
export class ConstructionMaterialIssueController {
  constructor(private materialIssues: ConstructionMaterialIssueService) {}

  @Get()
  @RequireFeature('construction.materials')
  @RequirePermissions('construction:materials:read')
  async list(
    @TenantId() tenantId: string,
    @Query() query: ListConstructionMaterialIssuesQueryDto,
  ) {
    const data = await this.materialIssues.list(tenantId, query);
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
  @RequireFeature('construction.materials')
  @RequirePermissions('construction:materials:read')
  async getById(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.materialIssues.findById(tenantId, id);
    return { success: true, data };
  }

  @Post()
  @RequireFeature('construction.materials')
  @RequirePermissions('construction:materials:issue')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateConstructionMaterialIssueDto,
  ) {
    const result = await this.materialIssues.create(tenantId, user.sub, dto);
    return {
      success: true,
      data: result.issue,
      meta: { created: result.created },
    };
  }

  @Post(':id/issue')
  @RequireFeature('construction.materials')
  @RequirePermissions('construction:materials:issue')
  async issue(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const result = await this.materialIssues.issue(tenantId, user.sub, id);
    return {
      success: true,
      data: result.issue,
      meta: { issued: result.issued },
    };
  }

  @Post(':id/cancel')
  @RequireFeature('construction.materials')
  @RequirePermissions('construction:materials:issue')
  async cancel(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.materialIssues.cancel(tenantId, user.sub, id);
    return { success: true, data };
  }
}
