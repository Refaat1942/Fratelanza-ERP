import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards,
} from '@nestjs/common';
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { CategoriesService } from './categories.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

class CreateCategoryDto {
  @IsString() name!: string;
  @IsString() code!: string;
  @IsOptional() @IsString() parentId?: string;
}

class UpdateCategoryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller('product-categories')
@UseGuards(PermissionsGuard)
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Get()
  @RequirePermissions('products:categories:read')
  async findAll(@TenantId() tenantId: string) {
    const data = await this.categoriesService.findAll(tenantId);
    return { success: true, data };
  }

  @Get(':id')
  @RequirePermissions('products:categories:read')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.categoriesService.findById(tenantId, id);
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('products:categories:create')
  async create(@TenantId() tenantId: string, @Body() dto: CreateCategoryDto) {
    const data = await this.categoriesService.create(tenantId, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @RequirePermissions('products:categories:update')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const data = await this.categoriesService.update(tenantId, id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @RequirePermissions('products:categories:delete')
  async remove(@TenantId() tenantId: string, @Param('id') id: string) {
    await this.categoriesService.softDelete(tenantId, id);
    return { success: true };
  }
}
