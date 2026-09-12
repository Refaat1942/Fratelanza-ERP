import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards,
} from '@nestjs/common';
import {
  IsString, IsOptional, IsBoolean, IsNumber, Min, IsEmail,
} from 'class-validator';
import { CustomersService } from './customers.service';
import { TenantAccessService } from '../../common/services/tenant-access.service';
import { TenantId, CurrentUser, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import type { JwtPayload } from '@fratelanza/types';

class CreateCustomerDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsNumber() @Min(0) creditLimit?: number;
}

class UpdateCustomerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsNumber() @Min(0) creditLimit?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller('customers')
@UseGuards(PermissionsGuard)
export class CustomersController {
  constructor(
    private customersService: CustomersService,
    private tenantAccess: TenantAccessService,
  ) {}

  @Get()
  @RequirePermissions('customers:customers:read')
  async findAll(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    const branchWhere = this.tenantAccess.buildCustomerListWhere(user);
    const data = await this.customersService.findAll(tenantId, branchWhere);
    return { success: true, data };
  }

  @Get(':id')
  @RequirePermissions('customers:customers:read')
  async findOne(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.customersService.findById(tenantId, id);
    this.tenantAccess.assertBranchInScope(user, data.branchId);
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('customers:customers:create')
  async create(@TenantId() tenantId: string, @Body() dto: CreateCustomerDto) {
    const data = await this.customersService.create(tenantId, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @RequirePermissions('customers:customers:update')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    const data = await this.customersService.update(tenantId, id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @RequirePermissions('customers:customers:delete')
  async remove(@TenantId() tenantId: string, @Param('id') id: string) {
    await this.customersService.softDelete(tenantId, id);
    return { success: true };
  }
}
