import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { IsString, IsIn } from 'class-validator';
import { DevicesService } from './devices.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

class UpdateDeviceStatusDto {
  @IsString()
  @IsIn(['active', 'inactive', 'revoked'])
  status!: string;
}

@Controller('devices')
@UseGuards(PermissionsGuard)
export class DevicesController {
  constructor(private devicesService: DevicesService) {}

  @Get()
  @RequirePermissions('core:devices:read')
  async findAll(@TenantId() tenantId: string) {
    const data = await this.devicesService.findAll(tenantId);
    return { success: true, data };
  }

  @Get(':id')
  @RequirePermissions('core:devices:read')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.devicesService.findById(tenantId, id);
    return { success: true, data };
  }

  @Patch(':id/status')
  @RequirePermissions('core:devices:update')
  async updateStatus(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDeviceStatusDto,
  ) {
    const data = await this.devicesService.updateStatus(tenantId, id, dto.status);
    return { success: true, data };
  }
}
