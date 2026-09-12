import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards,
} from '@nestjs/common';
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { WarehousesService } from './warehouses.service';
import { TenantAccessService } from '../../common/services/tenant-access.service';
import { TenantId, CurrentUser, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import type { JwtPayload } from '@fratelanza/types';

class CreateWarehouseDto {
  @IsString() branchId!: string;
  @IsString() name!: string;
  @IsString() code!: string;
  @IsOptional() @IsString() address?: string;
}

class UpdateWarehouseDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller('warehouses')
@UseGuards(PermissionsGuard)
export class WarehousesController {
  constructor(
    private warehousesService: WarehousesService,
    private tenantAccess: TenantAccessService,
  ) {}

  @Get()
  @RequirePermissions('warehouses:warehouses:read')
  async findAll(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    const scopeWhere = await this.tenantAccess.buildWarehouseListWhere(tenantId, user);
    const data = await this.warehousesService.findAll(tenantId, scopeWhere);
    return { success: true, data };
  }

  @Get(':id')
  @RequirePermissions('warehouses:warehouses:read')
  async findOne(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.warehousesService.findById(tenantId, id);
    this.tenantAccess.assertBranchInScope(user, data.branchId);
    this.tenantAccess.assertWarehouseAccess(user, data.id);
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('warehouses:warehouses:create')
  async create(@TenantId() tenantId: string, @Body() dto: CreateWarehouseDto) {
    const data = await this.warehousesService.create(tenantId, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @RequirePermissions('warehouses:warehouses:update')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    const data = await this.warehousesService.update(tenantId, id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @RequirePermissions('warehouses:warehouses:delete')
  async remove(@TenantId() tenantId: string, @Param('id') id: string) {
    await this.warehousesService.softDelete(tenantId, id);
    return { success: true };
  }
}
