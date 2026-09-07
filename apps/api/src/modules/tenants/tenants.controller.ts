import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantId, RequirePermissions, LicenseExempt } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

@Controller('tenants')
@UseGuards(PermissionsGuard)
@LicenseExempt()
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  @Get('current')
  @RequirePermissions('core:tenants:read')
  async getCurrent(@TenantId() tenantId: string) {
    const data = await this.tenantsService.findById(tenantId);
    return { success: true, data };
  }

  @Patch('current/settings')
  @RequirePermissions('core:settings:update')
  async updateSettings(
    @TenantId() tenantId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const data = await this.tenantsService.updateSettings(tenantId, body);
    return { success: true, data };
  }
}
