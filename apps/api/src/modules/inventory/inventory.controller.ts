import {
  Controller, Get, Post, Body, Query, UseGuards,
} from '@nestjs/common';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { InventoryService } from './inventory.service';
import { TenantId, CurrentUser, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import type { JwtPayload } from '@fratelanza/types';

class AdjustStockDto {
  @IsString() warehouseId!: string;
  @IsString() productId!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsNumber() unitCost?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() branchId?: string;
}

@Controller('inventory')
@UseGuards(PermissionsGuard)
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get('movements')
  @RequirePermissions('inventory:movements:read')
  async listMovements(
    @TenantId() tenantId: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
  ) {
    const data = await this.inventoryService.listMovements(tenantId, {
      warehouseId,
      productId,
    });
    return { success: true, data };
  }

  @Get('balances')
  @RequirePermissions('inventory:stock:read')
  async getBalances(
    @TenantId() tenantId: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const data = await this.inventoryService.getBalances(tenantId, warehouseId);
    return { success: true, data };
  }

  @Post('adjust')
  @RequirePermissions('inventory:stock:adjust')
  async adjustStock(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AdjustStockDto,
  ) {
    const data = await this.inventoryService.adjustStock(tenantId, {
      ...dto,
      branchId: dto.branchId ?? user.branchId,
      createdById: user.sub,
    });
    return { success: true, data };
  }
}
