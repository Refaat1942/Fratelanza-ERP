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
import { ConstructionBillingService } from './construction-billing.service';
import {
  CreateConstructionBillingDto,
  ListBillingCandidatesQueryDto,
  ListConstructionBillingQueryDto,
  PostConstructionBillingDto,
} from './dto/construction-billing.dto';

@Controller('construction/billing')
@UseGuards(PermissionsGuard)
@RequireModule('construction')
export class ConstructionBillingController {
  constructor(private billing: ConstructionBillingService) {}

  @Get()
  @RequireFeature('construction.billing')
  @RequirePermissions('construction:billing:read')
  async list(
    @TenantId() tenantId: string,
    @Query() query: ListConstructionBillingQueryDto,
  ) {
    const data = await this.billing.list(tenantId, query);
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

  @Get('candidates')
  @RequireFeature('construction.billing')
  @RequirePermissions('construction:billing:read')
  async listCandidates(
    @TenantId() tenantId: string,
    @Query() query: ListBillingCandidatesQueryDto,
  ) {
    const data = await this.billing.listCandidates(tenantId, query);
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

  @Post()
  @RequireFeature('construction.billing')
  @RequirePermissions('construction:billing:create')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateConstructionBillingDto,
  ) {
    const data = await this.billing.create(tenantId, user.sub, dto);
    return { success: true, data };
  }

  @Get(':id')
  @RequireFeature('construction.billing')
  @RequirePermissions('construction:billing:read')
  async getById(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.billing.findById(tenantId, id);
    return { success: true, data };
  }

  @Post(':id/approve')
  @RequireFeature('construction.billing')
  @RequirePermissions('construction:billing:manage')
  async approve(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.billing.approve(tenantId, id, user.sub);
    return { success: true, data };
  }

  @Post(':id/post')
  @RequireFeature('construction.billing')
  @RequirePermissions('construction:billing:manage')
  async post(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: PostConstructionBillingDto,
  ) {
    const data = await this.billing.post(tenantId, id, user.sub, dto);
    return { success: true, data };
  }

  @Post(':id/cancel')
  @RequireFeature('construction.billing')
  @RequirePermissions('construction:billing:manage')
  async cancel(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.billing.cancel(tenantId, id, user.sub);
    return { success: true, data };
  }
}
