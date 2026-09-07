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
import { ConstructionVariationService } from './construction-variation.service';
import {
  CreateConstructionVariationDto,
  CreateConstructionVariationItemDto,
  ListConstructionVariationsQueryDto,
  RejectConstructionVariationDto,
  UpdateConstructionVariationDto,
  UpdateConstructionVariationItemDto,
} from './dto/construction-variation.dto';

@Controller('construction/variations')
@UseGuards(PermissionsGuard)
@RequireModule('construction')
export class ConstructionVariationController {
  constructor(private variations: ConstructionVariationService) {}

  @Get()
  @RequireFeature('construction.variations')
  @RequirePermissions('construction:variations:read')
  async list(
    @TenantId() tenantId: string,
    @Query() query: ListConstructionVariationsQueryDto,
  ) {
    const data = await this.variations.list(tenantId, query);
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
  @RequireFeature('construction.variations')
  @RequirePermissions('construction:variations:manage')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateConstructionVariationDto,
  ) {
    const data = await this.variations.create(tenantId, user.sub, dto);
    return { success: true, data };
  }

  @Get(':id')
  @RequireFeature('construction.variations')
  @RequirePermissions('construction:variations:read')
  async getById(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.variations.findById(tenantId, id);
    return { success: true, data };
  }

  @Patch(':id')
  @RequireFeature('construction.variations')
  @RequirePermissions('construction:variations:manage')
  async update(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateConstructionVariationDto,
  ) {
    const data = await this.variations.update(tenantId, id, user.sub, dto);
    return { success: true, data };
  }

  @Post(':id/submit')
  @RequireFeature('construction.variations')
  @RequirePermissions('construction:variations:manage')
  async submit(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.variations.submit(tenantId, id, user.sub);
    return { success: true, data };
  }

  @Post(':id/approve')
  @RequireFeature('construction.variations')
  @RequirePermissions('construction:variations:approve')
  async approve(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.variations.approve(tenantId, id, user.sub);
    return { success: true, data };
  }

  @Post(':id/reject')
  @RequireFeature('construction.variations')
  @RequirePermissions('construction:variations:approve')
  async reject(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RejectConstructionVariationDto,
  ) {
    const data = await this.variations.reject(tenantId, id, user.sub, dto);
    return { success: true, data };
  }

  @Post(':id/reopen')
  @RequireFeature('construction.variations')
  @RequirePermissions('construction:variations:manage')
  async reopen(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.variations.returnToDraft(tenantId, id, user.sub);
    return { success: true, data };
  }

  @Post(':id/archive')
  @RequireFeature('construction.variations')
  @RequirePermissions('construction:variations:manage')
  async archive(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.variations.archive(tenantId, id, user.sub);
    return { success: true, data };
  }

  @Post(':variationId/items')
  @RequireFeature('construction.variations')
  @RequirePermissions('construction:variations:manage')
  async createItem(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('variationId') variationId: string,
    @Body() dto: CreateConstructionVariationItemDto,
  ) {
    const data = await this.variations.createItem(
      tenantId,
      variationId,
      user.sub,
      dto,
    );
    return { success: true, data };
  }

  @Patch('items/:itemId')
  @RequireFeature('construction.variations')
  @RequirePermissions('construction:variations:manage')
  async updateItem(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateConstructionVariationItemDto,
  ) {
    const data = await this.variations.updateItem(
      tenantId,
      itemId,
      user.sub,
      dto,
    );
    return { success: true, data };
  }
}
