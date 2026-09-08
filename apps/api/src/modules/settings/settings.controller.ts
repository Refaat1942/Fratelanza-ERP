import { Controller, Get, UseGuards } from '@nestjs/common';
import { getAppConfig } from '../../config/app-config';
import { TenantsService } from '../tenants/tenants.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

@Controller('settings')
@UseGuards(PermissionsGuard)export class SettingsController {
  constructor(private tenantsService: TenantsService) {}

  @Get()
  @RequirePermissions('core:settings:read')
  async getSettings(@TenantId() tenantId: string) {
    const tenant = await this.tenantsService.findById(tenantId);
    return {
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          code: tenant.code,
          settings: tenant.settings,
        },
        deploymentFlags: {
          partyLegacyRoutingEnabled: getAppConfig().partyLegacyRoutingEnabled,
          purchasingPartyRoutingEnabled: getAppConfig().purchasingPartyRoutingEnabled,
          universalFinancePilotEnabled: getAppConfig().universalFinancePilotEnabled,
          universalFinanceSalesPilotEnabled: getAppConfig().universalFinanceSalesPilotEnabled,
        },
      },
    };
  }
}
