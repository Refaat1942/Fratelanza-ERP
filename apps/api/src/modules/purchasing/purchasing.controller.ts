import {
  Controller, Get, Post, Param, Body, UseGuards,
} from '@nestjs/common';
import {
  IsString, IsOptional, IsArray, ValidateNested, IsNumber, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PurchasingService } from './purchasing.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

class PoLineDto {
  @IsString() productId!: string;
  @IsString() description!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsNumber() @Min(0) unitPrice!: number;
  @IsOptional() @IsNumber() @Min(0) taxRate?: number;
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

@Controller('purchasing')
@UseGuards(PermissionsGuard)
export class PurchasingController {
  constructor(private purchasingService: PurchasingService) {}

  @Get('orders')
  @RequirePermissions('purchasing:orders:read')
  async listOrders(@TenantId() tenantId: string) {
    const data = await this.purchasingService.findAll(tenantId);
    return { success: true, data };
  }

  @Get('orders/:id')
  @RequirePermissions('purchasing:orders:read')
  async getOrder(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.purchasingService.findById(tenantId, id);
    return { success: true, data };
  }

  @Post('orders')
  @RequirePermissions('purchasing:orders:create')
  async createOrder(@TenantId() tenantId: string, @Body() dto: CreatePoDto) {
    const data = await this.purchasingService.createOrder(tenantId, dto);
    return { success: true, data };
  }

  @Post('orders/:id/receive')
  @RequirePermissions('purchasing:orders:receive')
  async receiveOrder(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.purchasingService.receiveOrder(tenantId, id);
    return { success: true, data };
  }
}
