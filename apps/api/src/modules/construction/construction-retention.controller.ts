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
import { ConstructionRetentionService } from './construction-retention.service';
import {
  GetRetentionBalanceQueryDto,
  ListConstructionRetentionQueryDto,
  RecordRetentionHoldFromProgressDto,
  RecordRetentionReleaseDto,
} from './dto/construction-retention.dto';

@Controller('construction/retention')
@UseGuards(PermissionsGuard)
@RequireModule('construction')
export class ConstructionRetentionController {
  constructor(private retention: ConstructionRetentionService) {}

  @Get()
  @RequireFeature('construction.retention')
  @RequirePermissions('construction:retention:read')
  async list(
    @TenantId() tenantId: string,
    @Query() query: ListConstructionRetentionQueryDto,
  ) {
    if (!query.contractId) {
      return {
        success: true,
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
      };
    }
    const data = await this.retention.listByContract(
      tenantId,
      query.contractId,
      query,
    );
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

  @Get('balance')
  @RequireFeature('construction.retention')
  @RequirePermissions('construction:retention:read')
  async getBalance(
    @TenantId() tenantId: string,
    @Query() query: GetRetentionBalanceQueryDto,
  ) {
    const balance = await this.retention.getBalance(
      tenantId,
      query.contractId,
      query.partyType,
    );
    return {
      success: true,
      data: {
        contractId: query.contractId,
        partyType: query.partyType,
        balance: balance.toString(),
      },
    };
  }

  @Get('contract/:contractId')
  @RequireFeature('construction.retention')
  @RequirePermissions('construction:retention:read')
  async listByContract(
    @TenantId() tenantId: string,
    @Param('contractId') contractId: string,
    @Query() query: ListConstructionRetentionQueryDto,
  ) {
    const data = await this.retention.listByContract(
      tenantId,
      contractId,
      query,
    );
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

  @Post('release')
  @RequireFeature('construction.retention')
  @RequirePermissions('construction:retention:release')
  async release(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecordRetentionReleaseDto,
  ) {
    const data = await this.retention.recordRelease(tenantId, user.sub, dto);
    return { success: true, data };
  }

  @Post('hold-from-progress')
  @RequireFeature('construction.retention')
  @RequirePermissions('construction:retention:manage')
  async holdFromProgress(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecordRetentionHoldFromProgressDto,
  ) {
    const data = await this.retention.recordHoldFromProgress(
      tenantId,
      user.sub,
      dto.progressId,
      dto.partyType,
    );
    return { success: true, data };
  }
}
