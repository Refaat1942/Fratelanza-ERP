import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards,
} from '@nestjs/common';
import {
  IsString, IsOptional, IsBoolean, IsNumber, Min,
} from 'class-validator';
import { ProductsService } from './products.service';
import { TenantId, RequirePermissions, RequireModule } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

class CreateProductDto {
  @IsString() sku!: string;
  @IsString() name!: string;
  @IsString() unitId!: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsNumber() @Min(0) costPrice?: number;
  @IsOptional() @IsNumber() @Min(0) salePrice?: number;
  @IsOptional() @IsNumber() @Min(0) taxRate?: number;
  @IsOptional() @IsBoolean() trackInventory?: boolean;
}

class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() unitId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsNumber() @Min(0) costPrice?: number;
  @IsOptional() @IsNumber() @Min(0) salePrice?: number;
  @IsOptional() @IsNumber() @Min(0) taxRate?: number;
  @IsOptional() @IsBoolean() trackInventory?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller('products')
@UseGuards(PermissionsGuard)
@RequireModule('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  @RequirePermissions('products:products:read')
  async findAll(@TenantId() tenantId: string) {
    const data = await this.productsService.findAll(tenantId);
    return { success: true, data };
  }

  @Get(':id')
  @RequirePermissions('products:products:read')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.productsService.findById(tenantId, id);
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('products:products:create')
  async create(@TenantId() tenantId: string, @Body() dto: CreateProductDto) {
    const data = await this.productsService.create(tenantId, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @RequirePermissions('products:products:update')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const data = await this.productsService.update(tenantId, id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @RequirePermissions('products:products:delete')
  async remove(@TenantId() tenantId: string, @Param('id') id: string) {
    await this.productsService.softDelete(tenantId, id);
    return { success: true };
  }
}
