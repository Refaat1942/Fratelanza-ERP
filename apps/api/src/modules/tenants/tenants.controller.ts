import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { PlatformService } from '../platform/platform.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

@Controller('tenants')
@UseGuards(PermissionsGuard)
export class TenantsController {
  constructor(
    private tenantsService: TenantsService,
    private platformService: PlatformService,
  ) {}

  @Get('current')
  @RequirePermissions('core:tenants:read')
  async getCurrent(@TenantId() tenantId: string) {
    const data = await this.tenantsService.findById(tenantId);
    return { success: true, data };
  }

  @Get('current/modules')
  @RequirePermissions('core:tenants:read')
  async getCurrentModules(@TenantId() tenantId: string) {
    const data = await this.platformService.getEnabledModuleIds(tenantId);
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
