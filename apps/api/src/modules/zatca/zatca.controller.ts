import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import { ZatcaService } from './zatca.service';

class UpdateZatcaSettingsDto {
  @IsOptional() @IsIn(['sandbox', 'production']) environment?: 'sandbox' | 'production';
  @IsOptional() @IsString() vatNumber?: string;
  @IsOptional() @IsString() csrCommonName?: string;
}

@Controller('integrations/zatca')
@UseGuards(PermissionsGuard)
export class ZatcaController {
  constructor(private zatcaService: ZatcaService) {}

  @Get('status')
  @RequirePermissions('core:settings:read')
  async status(@TenantId() tenantId: string) {
    const data = await this.zatcaService.getStatus(tenantId);
    return { success: true, data };
  }

  @Get('logs')
  @RequirePermissions('core:settings:read')
  async logs(@TenantId() tenantId: string) {
    const data = await this.zatcaService.getLogs(tenantId);
    return { success: true, data };
  }

  @Patch('settings')
  @RequirePermissions('core:settings:update')
  async updateSettings(@TenantId() tenantId: string, @Body() dto: UpdateZatcaSettingsDto) {
    const data = await this.zatcaService.updateSettings(tenantId, dto);
    return { success: true, data };
  }
}
