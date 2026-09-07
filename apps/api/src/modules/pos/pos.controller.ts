import {
  Controller, Post, Body, UseGuards,
} from '@nestjs/common';
import {
  IsString, IsOptional, IsArray, ValidateNested, IsNumber, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PosService } from './pos.service';
import { TenantId, CurrentUser, RequirePermissions, RequireModule } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import type { JwtPayload } from '@fratelanza/types';

class OpenShiftDto {
  @IsString() branchId!: string;
  @IsOptional() @IsString() deviceId?: string;
  @IsOptional() @IsNumber() @Min(0) openingCash?: number;
}

class CloseShiftDto {
  @IsString() shiftId!: string;
  @IsNumber() @Min(0) closingCash!: number;
}

class PosLineDto {
  @IsString() productId!: string;
  @IsString() description!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsNumber() @Min(0) unitPrice!: number;
}

class PosPaymentDto {
  @IsString() method!: string;
  @IsNumber() @Min(0.01) amount!: number;
}

class CreateSaleDto {
  @IsString() branchId!: string;
  @IsString() shiftId!: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PosLineDto)
  lines!: PosLineDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => PosPaymentDto)
  payments!: PosPaymentDto[];
}

@Controller('pos')
@UseGuards(PermissionsGuard)
@RequireModule('pos')
export class PosController {
  constructor(private posService: PosService) {}

  @Post('shifts/open')
  @RequirePermissions('pos:shifts:open')
  async openShift(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: OpenShiftDto,
  ) {
    const data = await this.posService.openShift(tenantId, {
      ...dto,
      userId: user.sub,
    });
    return { success: true, data };
  }

  @Post('shifts/close')
  @RequirePermissions('pos:shifts:close')
  async closeShift(@TenantId() tenantId: string, @Body() dto: CloseShiftDto) {
    const data = await this.posService.closeShift(tenantId, dto.shiftId, dto.closingCash);
    return { success: true, data };
  }

  @Post('sales')
  @RequirePermissions('pos:sales:create')
  async createSale(@TenantId() tenantId: string, @Body() dto: CreateSaleDto) {
    const data = await this.posService.createSale(tenantId, dto);
    return { success: true, data };
  }
}
