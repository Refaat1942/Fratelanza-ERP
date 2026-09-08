import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsArray } from 'class-validator';
import { RolesService } from './roles.service';
import { PrismaService } from '../../database/prisma.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

class CreateRoleDto {
  @IsString() name!: string;
  @IsString() code!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() permissionIds?: string[];
}

@Controller('roles')
@UseGuards(PermissionsGuard)export class RolesController {
  constructor(
    private rolesService: RolesService,
    private prisma: PrismaService,
  ) {}

  @Get()
  @RequirePermissions('core:roles:read')
  async findAll(@TenantId() tenantId: string) {
    const data = await this.rolesService.findAll(tenantId);
    return { success: true, data };
  }

  @Get('assignable/list')
  @RequirePermissions('core:users:read')
  async findAssignable(@TenantId() tenantId: string) {
    const data = await this.rolesService.findAssignable(tenantId);
    return { success: true, data };
  }

  @Get('permissions')
  @RequirePermissions('core:roles:read')
  async findPermissions() {
    const data = await this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { feature: 'asc' }] });
    return { success: true, data };
  }

  @Get(':id')
  @RequirePermissions('core:roles:read')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.rolesService.findById(tenantId, id);
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('core:roles:create')
  async create(@TenantId() tenantId: string, @Body() dto: CreateRoleDto) {
    const data = await this.rolesService.create(tenantId, dto);
    return { success: true, data };
  }
}
