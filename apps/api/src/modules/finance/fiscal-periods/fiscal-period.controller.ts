import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TenantId, RequirePermissions, RequireModule } from '../../../common/decorators';
import { PermissionsGuard } from '../../../common/guards';
import { FiscalPeriodService } from './fiscal-period.service';
import { FiscalPeriodStatus } from '../../../../../../packages/database/generated/server';

class CreateFiscalPeriodDto {
  @IsString() name!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
}

class UpdateFiscalPeriodStatusDto {
  @IsEnum(FiscalPeriodStatus) status!: FiscalPeriodStatus;
}

@Controller('finance/fiscal-periods')
@UseGuards(PermissionsGuard)
@RequireModule('finance')
export class FiscalPeriodController {
  constructor(private fiscalPeriods: FiscalPeriodService) {}

  @Get()
  @RequirePermissions('finance:periods:read')
  async list(@TenantId() tenantId: string) {
    const data = await this.fiscalPeriods.listPeriods(tenantId);
    return { success: true, data };
  }

  @Get(':id')
  @RequirePermissions('finance:periods:read')
  async getOne(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.fiscalPeriods.findById(tenantId, id);
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('finance:periods:manage')
  async create(@TenantId() tenantId: string, @Body() dto: CreateFiscalPeriodDto) {
    const data = await this.fiscalPeriods.createPeriod(tenantId, dto);
    return { success: true, data };
  }

  @Patch(':id/status')
  @RequirePermissions('finance:periods:manage')
  async updateStatus(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFiscalPeriodStatusDto,
  ) {
    let data;
    if (dto.status === FiscalPeriodStatus.closed) {
      data = await this.fiscalPeriods.closePeriod(tenantId, id);
    } else if (dto.status === FiscalPeriodStatus.locked) {
      data = await this.fiscalPeriods.lockPeriod(tenantId, id);
    } else {
      data = await this.fiscalPeriods.reopenPeriod(tenantId, id);
    }
    return { success: true, data };
  }
}
