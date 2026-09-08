import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards,
} from '@nestjs/common';
import { IsString, IsOptional, IsBoolean, IsEmail } from 'class-validator';
import { SuppliersService } from './suppliers.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

class CreateSupplierDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
}

class UpdateSupplierDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller('suppliers')
@UseGuards(PermissionsGuard)export class SuppliersController {
  constructor(private suppliersService: SuppliersService) {}

  @Get()
  @RequirePermissions('suppliers:suppliers:read')
  async findAll(@TenantId() tenantId: string) {
    const data = await this.suppliersService.findAll(tenantId);
    return { success: true, data };
  }

  @Get(':id')
  @RequirePermissions('suppliers:suppliers:read')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.suppliersService.findById(tenantId, id);
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('suppliers:suppliers:create')
  async create(@TenantId() tenantId: string, @Body() dto: CreateSupplierDto) {
    const data = await this.suppliersService.create(tenantId, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @RequirePermissions('suppliers:suppliers:update')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    const data = await this.suppliersService.update(tenantId, id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @RequirePermissions('suppliers:suppliers:delete')
  async remove(@TenantId() tenantId: string, @Param('id') id: string) {
    await this.suppliersService.softDelete(tenantId, id);
    return { success: true };
  }
}
