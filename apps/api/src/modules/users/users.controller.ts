import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsBoolean, MinLength, Matches } from 'class-validator';
import { UsersService } from './users.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

class CreateUserDto {
  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'Username may only contain letters, numbers, dot, dash, underscore' })
  username!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsString() roleId!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() locale?: string;
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  username?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MinLength(8) password?: string;
}

@Controller('users')
@UseGuards(PermissionsGuard)export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @RequirePermissions('core:users:read')
  async findAll(@TenantId() tenantId: string) {
    const data = await this.usersService.findAll(tenantId);
    return { success: true, data };
  }

  @Get(':id')
  @RequirePermissions('core:users:read')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.usersService.findById(tenantId, id);
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('core:users:create')
  async create(@TenantId() tenantId: string, @Body() dto: CreateUserDto) {
    const data = await this.usersService.create(tenantId, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @RequirePermissions('core:users:update')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const data = await this.usersService.update(tenantId, id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @RequirePermissions('core:users:delete')
  async remove(@TenantId() tenantId: string, @Param('id') id: string) {
    await this.usersService.softDelete(tenantId, id);
    return { success: true };
  }
}
