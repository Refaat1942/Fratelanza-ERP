import {
  Controller, Get, Post, Patch, Param, Body, UseGuards,
} from '@nestjs/common';
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { UnitsService } from './units.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

class CreateUnitDto {
  @IsString() name!: string;
  @IsString() code!: string;
  @IsOptional() @IsString() symbol?: string;
}

class UpdateUnitDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() symbol?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller('units-of-measure')
@UseGuards(PermissionsGuard)export class UnitsController {
  constructor(private unitsService: UnitsService) {}

  @Get()
  @RequirePermissions('products:units:read')
  async findAll(@TenantId() tenantId: string) {
    const data = await this.unitsService.findAll(tenantId);
    return { success: true, data };
  }

  @Get(':id')
  @RequirePermissions('products:units:read')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.unitsService.findById(tenantId, id);
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('products:units:create')
  async create(@TenantId() tenantId: string, @Body() dto: CreateUnitDto) {
    const data = await this.unitsService.create(tenantId, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @RequirePermissions('products:units:update')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUnitDto,
  ) {
    const data = await this.unitsService.update(tenantId, id, dto);
    return { success: true, data };
  }
}
