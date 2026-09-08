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
import { CurrentUser, RequirePermissions, TenantId } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import type { JwtPayload } from '@fratelanza/types';
import { ConstructionProgressService } from './construction-progress.service';
import {
  CreateConstructionProgressDto,
  CreateConstructionProgressItemDto,
  ListConstructionProgressQueryDto,
  RejectConstructionProgressDto,
  UpdateConstructionProgressDto,
  UpdateConstructionProgressItemDto,
} from './dto/construction-progress.dto';

@Controller('construction/progress')
@UseGuards(PermissionsGuard)export class ConstructionProgressController {
  constructor(private progress: ConstructionProgressService) {}

  @Get()  @RequirePermissions('construction:progress:read')
  async list(
    @TenantId() tenantId: string,
    @Query() query: ListConstructionProgressQueryDto,
  ) {
    const data = await this.progress.list(tenantId, query);
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

  @Post()  @RequirePermissions('construction:progress:manage')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateConstructionProgressDto,
  ) {
    const data = await this.progress.create(tenantId, user.sub, dto);
    return { success: true, data };
  }

  @Get(':id')  @RequirePermissions('construction:progress:read')
  async getById(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.progress.findById(tenantId, id);
    return { success: true, data };
  }

  @Patch(':id')  @RequirePermissions('construction:progress:manage')
  async update(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateConstructionProgressDto,
  ) {
    const data = await this.progress.update(tenantId, id, user.sub, dto);
    return { success: true, data };
  }

  @Post(':id/submit')  @RequirePermissions('construction:progress:submit')
  async submit(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.progress.submit(tenantId, id, user.sub);
    return { success: true, data };
  }

  @Post(':id/approve')  @RequirePermissions('construction:progress:approve')
  async approve(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.progress.approve(tenantId, id, user.sub);
    return { success: true, data };
  }

  @Post(':id/reject')  @RequirePermissions('construction:progress:approve')
  async reject(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RejectConstructionProgressDto,
  ) {
    const data = await this.progress.reject(tenantId, id, user.sub, dto);
    return { success: true, data };
  }

  @Post(':id/reopen')  @RequirePermissions('construction:progress:manage')
  async reopen(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.progress.returnToDraft(tenantId, id, user.sub);
    return { success: true, data };
  }

  @Post(':id/archive')  @RequirePermissions('construction:progress:manage')
  async archive(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.progress.archive(tenantId, id, user.sub);
    return { success: true, data };
  }

  @Post(':progressId/items')  @RequirePermissions('construction:progress:manage')
  async createItem(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('progressId') progressId: string,
    @Body() dto: CreateConstructionProgressItemDto,
  ) {
    const data = await this.progress.createItem(
      tenantId,
      progressId,
      user.sub,
      dto,
    );
    return { success: true, data };
  }

  @Patch('items/:itemId')  @RequirePermissions('construction:progress:manage')
  async updateItem(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateConstructionProgressItemDto,
  ) {
    const data = await this.progress.updateItem(
      tenantId,
      itemId,
      user.sub,
      dto,
    );
    return { success: true, data };
  }
}
