import {
  BadRequestException, Controller, Get, Post, Body, Query, UseGuards,
} from '@nestjs/common';
import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { InventoryService } from './inventory.service';
import { TenantAccessService } from '../../common/services/tenant-access.service';
import { TenantId, CurrentUser, RequirePermissions, RequireModule } from '../../common/decorators';
import { PermissionsGuard, ModuleAccessGuard } from '../../common/guards';
import type { JwtPayload } from '@fratelanza/types';

class AdjustStockDto {
  @IsString() warehouseId!: string;
  @IsString() productId!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsNumber() unitCost?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() branchId?: string;
}

class TransferStockDto {
  @IsString() fromWarehouseId!: string;
  @IsString() toWarehouseId!: string;
  @IsString() productId!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() notes?: string;
}

class GenerateReorderDto {
  @IsString() branchId!: string;
  @IsString() warehouseId!: string;
}

@Controller('inventory')
@UseGuards(PermissionsGuard, ModuleAccessGuard)
@RequireModule('inventory')
export class InventoryController {
  constructor(
    private inventoryService: InventoryService,
    private tenantAccess: TenantAccessService,
  ) {}

  @Get('movements')
  @RequirePermissions('inventory:movements:read')
  async listMovements(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
  ) {
    if (warehouseId) {
      const warehouse = await this.tenantAccess.assertWarehouseForTenant(tenantId, warehouseId);
      this.tenantAccess.assertWarehouseAccess(user, warehouseId);
      this.tenantAccess.assertBranchInScope(user, warehouse.branchId);
    }
    const warehouseFilter = await this.tenantAccess.buildInventoryWarehouseFilter(tenantId, user);
    const data = await this.inventoryService.listMovements(tenantId, {
      warehouseId,
      productId,
      warehouseFilter,
    });
    return { success: true, data };
  }

  @Get('balances')
  @RequirePermissions('inventory:stock:read')
  async getBalances(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Query('warehouseId') warehouseId?: string,
  ) {
    if (warehouseId) {
      const warehouse = await this.tenantAccess.assertWarehouseForTenant(tenantId, warehouseId);
      this.tenantAccess.assertWarehouseAccess(user, warehouseId);
      this.tenantAccess.assertBranchInScope(user, warehouse.branchId);
    }
    const warehouseFilter = await this.tenantAccess.buildInventoryWarehouseFilter(tenantId, user);
    const data = await this.inventoryService.getBalances(tenantId, warehouseId, warehouseFilter);
    return { success: true, data };
  }

  @Get('valuation')
  @RequirePermissions('inventory:stock:read')
  async getValuation(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const warehouseFilter = await this.tenantAccess.buildInventoryWarehouseFilter(tenantId, user);
    const data = await this.inventoryService.getStockValuation(tenantId, warehouseFilter);
    return { success: true, data };
  }

  @Get('low-stock')
  @RequirePermissions('inventory:stock:read')
  async getLowStock(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Query('warehouseId') warehouseId: string,
  ) {
    const warehouse = await this.tenantAccess.assertWarehouseForTenant(tenantId, warehouseId);
    this.tenantAccess.assertWarehouseAccess(user, warehouseId);
    this.tenantAccess.assertBranchInScope(user, warehouse.branchId);
    const data = await this.inventoryService.getLowStockReport(tenantId, warehouseId);
    return { success: true, data };
  }

  @Post('reorder/generate')
  @RequirePermissions('purchasing:orders:create')
  async generateReorder(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateReorderDto,
  ) {
    const warehouse = await this.tenantAccess.assertWarehouseForTenant(tenantId, dto.warehouseId);
    this.tenantAccess.assertBranchAccess(user, dto.branchId);
    this.tenantAccess.assertWarehouseAccess(user, dto.warehouseId);
    if (warehouse.branchId !== dto.branchId) {
      throw new BadRequestException('Warehouse does not belong to the specified branch');
    }
    const data = await this.inventoryService.generateReorderPurchaseOrders(
      tenantId,
      dto.branchId,
      dto.warehouseId,
      user.sub,
    );
    return { success: true, data };
  }

  @Post('adjust')
  @RequirePermissions('inventory:stock:adjust')
  async adjustStock(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AdjustStockDto,
  ) {
    const warehouse = await this.tenantAccess.assertWarehouseForTenant(tenantId, dto.warehouseId);
    this.tenantAccess.assertBranchAccess(user, warehouse.branchId);
    this.tenantAccess.assertWarehouseAccess(user, dto.warehouseId);
    const data = await this.inventoryService.adjustStock(tenantId, {
      ...dto,
      branchId: dto.branchId ?? user.branchId,
      createdById: user.sub,
    });
    return { success: true, data };
  }

  @Post('transfer')
  @RequirePermissions('inventory:stock:adjust')
  async transferStock(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: TransferStockDto,
  ) {
    const fromWarehouse = await this.tenantAccess.assertWarehouseForTenant(tenantId, dto.fromWarehouseId);
    const toWarehouse = await this.tenantAccess.assertWarehouseForTenant(tenantId, dto.toWarehouseId);
    this.tenantAccess.assertBranchAccess(user, fromWarehouse.branchId);
    this.tenantAccess.assertBranchAccess(user, toWarehouse.branchId);
    this.tenantAccess.assertWarehouseAccess(user, dto.fromWarehouseId);
    this.tenantAccess.assertWarehouseAccess(user, dto.toWarehouseId);
    const data = await this.inventoryService.transferStock(tenantId, {
      ...dto,
      branchId: dto.branchId ?? user.branchId,
      createdById: user.sub,
    });
    return { success: true, data };
  }
}
