import {
  Body, Controller, Get, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import {
  IsIn, IsNumber, IsOptional, IsString, Min,
} from 'class-validator';
import { AssetsService } from './assets.service';
import { TenantId, CurrentUser, RequirePermissions, RequireModule } from '../../common/decorators';
import { PermissionsGuard, ModuleAccessGuard } from '../../common/guards';
import { TenantAccessService } from '../../common/services/tenant-access.service';
import type { JwtPayload } from '@fratelanza/types';

class CreateAssetCategoryDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsNumber() @Min(1) defaultUsefulLifeMonths?: number;
  @IsOptional() @IsIn(['straight_line', 'declining_balance']) defaultDepreciationMethod?: 'straight_line' | 'declining_balance';
  @IsOptional() @IsNumber() @Min(0) defaultDecliningRate?: number;
}

class CreateAssetDto {
  @IsString() categoryId!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() costCenterId?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() code?: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() acquisitionDate!: string;
  @IsNumber() @Min(0.01) acquisitionCost!: number;
  @IsOptional() @IsNumber() @Min(0) salvageValue?: number;
  @IsOptional() @IsNumber() @Min(1) usefulLifeMonths?: number;
  @IsOptional() @IsIn(['straight_line', 'declining_balance']) depreciationMethod?: 'straight_line' | 'declining_balance';
  @IsOptional() @IsNumber() @Min(0) decliningRate?: number;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() location?: string;
}

class UpdateAssetCategoryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(1) defaultUsefulLifeMonths?: number;
  @IsOptional() @IsIn(['straight_line', 'declining_balance']) defaultDepreciationMethod?: 'straight_line' | 'declining_balance';
  @IsOptional() @IsNumber() @Min(0) defaultDecliningRate?: number;
}

class UpdateAssetDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() costCenterId?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() location?: string;
}

class RunDepreciationDto {
  @IsString() periodDate!: string;
  @IsOptional() @IsString() branchId?: string;
}

class DisposeAssetDto {
  @IsString() disposalDate!: string;
  @IsNumber() @Min(0) proceeds!: number;
}

@Controller('assets')
@UseGuards(PermissionsGuard, ModuleAccessGuard)
@RequireModule('assets')
export class AssetsController {
  constructor(
    private assetsService: AssetsService,
    private tenantAccess: TenantAccessService,
  ) {}

  @Get('categories')
  @RequirePermissions('assets:categories:read')
  async listCategories(@TenantId() tenantId: string) {
    const data = await this.assetsService.listCategories(tenantId);
    return { success: true, data };
  }

  @Post('categories')
  @RequirePermissions('assets:categories:manage')
  async createCategory(@TenantId() tenantId: string, @Body() dto: CreateAssetCategoryDto) {
    const data = await this.assetsService.createCategory(tenantId, dto);
    return { success: true, data };
  }

  @Patch('categories/:id')
  @RequirePermissions('assets:categories:manage')
  async updateCategory(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateAssetCategoryDto) {
    const data = await this.assetsService.updateCategory(tenantId, id, dto);
    return { success: true, data };
  }

  @Get()
  @RequirePermissions('assets:assets:read')
  async list(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    const data = await this.assetsService.listAssets(tenantId, this.tenantAccess.buildBranchWhere(user));
    return { success: true, data };
  }

  @Get(':id')
  @RequirePermissions('assets:assets:read')
  async get(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.assetsService.getAsset(tenantId, id);
    return { success: true, data };
  }

  @Get(':id/depreciation-schedule')
  @RequirePermissions('assets:assets:read')
  async depreciationSchedule(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.assetsService.getDepreciationSchedule(tenantId, id);
    return { success: true, data };
  }

  @Patch(':id')
  @RequirePermissions('assets:assets:update')
  async update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateAssetDto) {
    const data = await this.assetsService.updateAsset(tenantId, id, dto);
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('assets:assets:create')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAssetDto,
  ) {
    if (dto.branchId) {
      this.tenantAccess.assertBranchAccess(user, dto.branchId);
    }
    const data = await this.assetsService.createAsset(tenantId, dto, user.sub);
    return { success: true, data };
  }

  @Post('depreciation/run')
  @RequirePermissions('assets:depreciation:run')
  async runDepreciation(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RunDepreciationDto,
  ) {
    if (dto.branchId) {
      this.tenantAccess.assertBranchAccess(user, dto.branchId);
    }
    const data = await this.assetsService.runDepreciation(tenantId, dto.periodDate, dto.branchId, user.sub);
    return { success: true, data };
  }

  @Post(':id/dispose')
  @RequirePermissions('assets:assets:dispose')
  async dispose(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DisposeAssetDto,
  ) {
    const data = await this.assetsService.disposeAsset(tenantId, id, dto.disposalDate, dto.proceeds, user.sub);
    return { success: true, data };
  }
}
