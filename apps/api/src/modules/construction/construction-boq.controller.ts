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
import { ConstructionBoqService } from './construction-boq.service';
import {
  CreateConstructionBoqDto,
  CreateConstructionBoqItemDto,
  CreateConstructionBoqSectionDto,
  ListConstructionBoqsQueryDto,
  UpdateConstructionBoqDto,
  UpdateConstructionBoqItemDto,
  UpdateConstructionBoqSectionDto,
} from './dto/construction-boq.dto';

@Controller('construction')
@UseGuards(PermissionsGuard)export class ConstructionBoqController {
  constructor(private boqs: ConstructionBoqService) {}

  @Get('contracts/:contractId/boqs')  @RequirePermissions('construction:boq:read')
  async listByContract(
    @TenantId() tenantId: string,
    @Param('contractId') contractId: string,
    @Query() query: ListConstructionBoqsQueryDto,
  ) {
    const data = await this.boqs.listByContract(tenantId, contractId, query);
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

  @Post('contracts/:contractId/boqs')  @RequirePermissions('construction:boq:manage')
  async createForContract(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('contractId') contractId: string,
    @Body() dto: CreateConstructionBoqDto,
  ) {
    const data = await this.boqs.createForContract(
      tenantId,
      contractId,
      user.sub,
      dto,
    );
    return { success: true, data };
  }

  @Get('boqs/:id')  @RequirePermissions('construction:boq:read')
  async getById(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.boqs.findById(tenantId, id);
    return { success: true, data };
  }

  @Patch('boqs/:id')  @RequirePermissions('construction:boq:manage')
  async update(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateConstructionBoqDto,
  ) {
    const data = await this.boqs.update(tenantId, id, user.sub, dto);
    return { success: true, data };
  }

  @Post('boqs/:id/approve')  @RequirePermissions('construction:boq:approve')
  async approve(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.boqs.approve(tenantId, id, user.sub);
    return { success: true, data };
  }

  @Post('boqs/:id/revise')  @RequirePermissions('construction:boq:manage')
  async revise(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.boqs.revise(tenantId, id, user.sub);
    return { success: true, data };
  }

  @Post('boqs/:boqId/sections')  @RequirePermissions('construction:boq:manage')
  async createSection(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('boqId') boqId: string,
    @Body() dto: CreateConstructionBoqSectionDto,
  ) {
    const data = await this.boqs.createSection(tenantId, boqId, user.sub, dto);
    return { success: true, data };
  }

  @Patch('boq-sections/:sectionId')  @RequirePermissions('construction:boq:manage')
  async updateSection(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateConstructionBoqSectionDto,
  ) {
    const data = await this.boqs.updateSection(
      tenantId,
      sectionId,
      user.sub,
      dto,
    );
    return { success: true, data };
  }

  @Post('boqs/:boqId/items')  @RequirePermissions('construction:boq:manage')
  async createItem(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('boqId') boqId: string,
    @Body() dto: CreateConstructionBoqItemDto,
  ) {
    const data = await this.boqs.createItem(tenantId, boqId, user.sub, dto);
    return { success: true, data };
  }

  @Patch('boq-items/:itemId')  @RequirePermissions('construction:boq:manage')
  async updateItem(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateConstructionBoqItemDto,
  ) {
    const data = await this.boqs.updateItem(tenantId, itemId, user.sub, dto);
    return { success: true, data };
  }
}
