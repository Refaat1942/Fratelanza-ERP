import {
  Controller, Get, Post, Patch, Param, Body, UseGuards,
} from '@nestjs/common';
import {
  IsString, IsOptional, IsArray, ValidateNested, IsNumber, Min, IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PurchasingService } from './purchasing.service';
import { TenantId, CurrentUser, RequirePermissions, RequireModule } from '../../common/decorators';
import { PermissionsGuard, ModuleAccessGuard } from '../../common/guards';
import { TenantAccessService } from '../../common/services/tenant-access.service';
import { PurchasingPartyRoutingGuard } from './guards/purchasing-party-routing.guard';
import type { JwtPayload } from '@fratelanza/types';

class PoLineDto {
  @IsString() productId!: string;
  @IsString() description!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsNumber() @Min(0) unitPrice!: number;
  @IsOptional() @IsNumber() @Min(0) taxRate?: number;
  @IsOptional() @IsString() taxCategoryId?: string;
}

class CreatePoDto {
  @IsString() branchId!: string;
  @IsString() supplierId!: string;
  @IsString() warehouseId!: string;
  @IsOptional() @IsString() orderDate?: string;
  @IsOptional() @IsString() expectedDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PoLineDto)
  lines!: PoLineDto[];
}

class CreatePoFromPartyDto {
  @IsUUID() partyId!: string;
  @IsString() branchId!: string;
  @IsString() warehouseId!: string;
  @IsOptional() @IsString() orderDate?: string;
  @IsOptional() @IsString() expectedDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PoLineDto)
  lines!: PoLineDto[];
}

class UpdatePoDto {
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() orderDate?: string;
  @IsOptional() @IsString() expectedDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PoLineDto)
  lines?: PoLineDto[];
}

class ReceiveDimensionsDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() costCenterId?: string;
}

class ReceiveLineDto {
  @IsString() lineId!: string;
  @IsNumber() @Min(0) quantity!: number;
}

class ReceivePurchaseOrderDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ReceiveDimensionsDto)
  dimensions?: ReceiveDimensionsDto;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiveLineDto)
  lines?: ReceiveLineDto[];
}

class RecordSupplierPaymentDto {
  @IsString() branchId!: string;
  @IsString() supplierId!: string;
  @IsOptional() @IsString() purchaseOrderId?: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() paymentDate?: string;
  @IsOptional() @IsString() reference?: string;
}

@Controller('purchasing')
@UseGuards(PermissionsGuard, ModuleAccessGuard)
@RequireModule('purchasing')
export class PurchasingController {
  constructor(
    private purchasingService: PurchasingService,
    private tenantAccess: TenantAccessService,
  ) {}

  @Get('orders')
  @RequirePermissions('purchasing:orders:read')
  async listOrders(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    const data = await this.purchasingService.findAll(
      tenantId,
      this.tenantAccess.buildBranchWhere(user),
    );
    return { success: true, data };
  }

  @Get('orders/:id')
  @RequirePermissions('purchasing:orders:read')
  async getOrder(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.purchasingService.findById(
      tenantId,
      id,
      this.tenantAccess.buildBranchWhere(user),
    );
    return { success: true, data };
  }

  @Post('orders')
  @RequirePermissions('purchasing:orders:create')
  async createOrder(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePoDto,
  ) {
    this.tenantAccess.assertBranchAccess(user, dto.branchId);
    const data = await this.purchasingService.createOrder(tenantId, { ...dto, createdById: user.sub });
    return { success: true, data };
  }

  @Post('orders/from-party')
  @UseGuards(PurchasingPartyRoutingGuard)
  @RequirePermissions('purchasing:orders:create')
  async createOrderFromParty(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePoFromPartyDto,
  ) {
    this.tenantAccess.assertBranchAccess(user, dto.branchId);
    const data = await this.purchasingService.createOrderFromParty(tenantId, {
      ...dto,
      createdById: user.sub,
    });
    return { success: true, data };
  }

  @Patch('orders/:id')
  @RequirePermissions('purchasing:orders:update')
  async updateOrder(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePoDto,
  ) {
    const data = await this.purchasingService.updateOrder(tenantId, id, dto);
    return { success: true, data };
  }

  @Post('orders/:id/cancel')
  @RequirePermissions('purchasing:orders:update')
  async cancelOrder(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.purchasingService.cancelOrder(tenantId, id, user.sub);
    return { success: true, data };
  }

  @Post('orders/:id/receive')
  @RequirePermissions('purchasing:orders:receive')
  async receiveOrder(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto?: ReceivePurchaseOrderDto,
  ) {
    await this.tenantAccess.assertPurchaseOrderAccess(tenantId, user, id);
    const dimensions = dto?.dimensions
      ? {
          ...(dto.dimensions.projectId ? { projectId: dto.dimensions.projectId } : {}),
          ...(dto.dimensions.costCenterId ? { costCenterId: dto.dimensions.costCenterId } : {}),
        }
      : undefined;
    const data = await this.purchasingService.receiveOrder(
      tenantId,
      id,
      dimensions && Object.keys(dimensions).length > 0 ? dimensions : undefined,
      user.sub,
      dto?.lines,
    );
    return { success: true, data };
  }

  @Post('payments')
  @RequirePermissions('purchasing:orders:receive')
  async recordPayment(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecordSupplierPaymentDto,
  ) {
    this.tenantAccess.assertBranchAccess(user, dto.branchId);
    const data = await this.purchasingService.recordSupplierPayment(tenantId, {
      ...dto,
      actorUserId: user.sub,
    });
    return { success: true, data };
  }

  @Post('orders/:id/return')
  @RequirePermissions('purchasing:orders:receive')
  async returnOrder(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    await this.tenantAccess.assertPurchaseOrderAccess(tenantId, user, id);
    const data = await this.purchasingService.returnReceivedOrder(tenantId, id, user.sub);
    return { success: true, data };
  }
}
