import {
  Controller, Get, Post, Param, Body, UseGuards,
} from '@nestjs/common';
import {
  IsString, IsOptional, IsArray, ValidateNested, IsNumber, Min, IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SalesService } from './sales.service';
import {
  TenantId,
  CurrentUser,
  RequirePermissions,
  RequireModule,
  RequireFeature,
} from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import { PartyLegacyRoutingGuard } from './guards/party-legacy-routing.guard';
import type { JwtPayload } from '@fratelanza/types';

class InvoiceLineDto {
  @IsOptional() @IsString() productId?: string;
  @IsString() description!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsNumber() @Min(0) unitPrice!: number;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsNumber() @Min(0) taxRate?: number;
}

class CreateInvoiceDto {
  @IsString() branchId!: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() invoiceDate?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
}

class CreateInvoiceFromPartyDto {
  @IsUUID() partyId!: string;
  @IsString() branchId!: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() invoiceDate?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
}

class RecordPaymentDto {
  @IsString() branchId!: string;
  @IsString() customerId!: string;
  @IsOptional() @IsString() invoiceId?: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() paymentDate?: string;
  @IsOptional() @IsString() reference?: string;
}

class RecordPaymentFromPartyDto {
  @IsUUID() partyId!: string;
  @IsString() branchId!: string;
  @IsOptional() @IsString() invoiceId?: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() paymentDate?: string;
  @IsOptional() @IsString() reference?: string;
}

class PostInvoiceDimensionsDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() costCenterId?: string;
}

class PostSalesInvoiceDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => PostInvoiceDimensionsDto)
  dimensions?: PostInvoiceDimensionsDto;
}

@Controller('sales')
@UseGuards(PermissionsGuard)
@RequireModule('sales')
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Get('invoices')
  @RequireFeature('sales.invoices')
  @RequirePermissions('sales:invoices:read')
  async listInvoices(@TenantId() tenantId: string) {
    const data = await this.salesService.findAll(tenantId);
    return { success: true, data };
  }

  @Get('invoices/:id')
  @RequireFeature('sales.invoices')
  @RequirePermissions('sales:invoices:read')
  async getInvoice(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.salesService.findById(tenantId, id);
    return { success: true, data };
  }

  @Post('invoices')
  @RequireFeature('sales.invoices')
  @RequirePermissions('sales:invoices:create')
  async createInvoice(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateInvoiceDto,
  ) {
    const data = await this.salesService.createInvoice(tenantId, {
      ...dto,
      createdById: user.sub,
    });
    return { success: true, data };
  }

  @Post('invoices/from-party')
  @UseGuards(PartyLegacyRoutingGuard)
  @RequireFeature('sales.invoices')
  @RequirePermissions('sales:invoices:create')
  async createInvoiceFromParty(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateInvoiceFromPartyDto,
  ) {
    const data = await this.salesService.createInvoiceFromParty(tenantId, {
      ...dto,
      createdById: user.sub,
    });
    return { success: true, data };
  }

  @Post('invoices/:id/post')
  @RequireFeature('sales.invoices')
  @RequirePermissions('sales:invoices:post')
  async postInvoice(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto?: PostSalesInvoiceDto,
  ) {
    const dimensions = dto?.dimensions
      ? {
          ...(dto.dimensions.projectId ? { projectId: dto.dimensions.projectId } : {}),
          ...(dto.dimensions.costCenterId ? { costCenterId: dto.dimensions.costCenterId } : {}),
        }
      : undefined;
    const data = await this.salesService.postInvoice(
      tenantId,
      id,
      dimensions && Object.keys(dimensions).length > 0 ? dimensions : undefined,
    );
    return { success: true, data };
  }

  @Post('payments')
  @RequirePermissions('sales:payments:create')
  async recordPayment(@TenantId() tenantId: string, @Body() dto: RecordPaymentDto) {
    const data = await this.salesService.recordPayment(tenantId, dto);
    return { success: true, data };
  }

  @Post('payments/from-party')
  @UseGuards(PartyLegacyRoutingGuard)
  @RequirePermissions('sales:payments:create')
  async recordPaymentFromParty(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecordPaymentFromPartyDto,
  ) {
    const data = await this.salesService.recordPaymentFromParty(tenantId, {
      ...dto,
      actorUserId: user.sub,
    });
    return { success: true, data };
  }
}
