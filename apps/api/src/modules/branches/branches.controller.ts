import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { BranchesService } from './branches.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

class CreateBranchDto {
  @IsString() name!: string;
  @IsString() code!: string;
  @IsOptional() @IsString() address?: string;
}

class UpdateBranchDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller('branches')
@UseGuards(PermissionsGuard)export class BranchesController {
  constructor(private branchesService: BranchesService) {}

  @Get()
  @RequirePermissions('core:branches:read')
  async findAll(@TenantId() tenantId: string) {
    const data = await this.branchesService.findAll(tenantId);
    return { success: true, data };
  }

  @Get(':id')
  @RequirePermissions('core:branches:read')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.branchesService.findById(tenantId, id);
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('core:branches:create')
  async create(@TenantId() tenantId: string, @Body() dto: CreateBranchDto) {
    const data = await this.branchesService.create(tenantId, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @RequirePermissions('core:branches:update')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    const data = await this.branchesService.update(tenantId, id, dto);
    return { success: true, data };
  }
}
