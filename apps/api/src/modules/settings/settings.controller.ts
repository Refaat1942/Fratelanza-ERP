import { Controller, Get, UseGuards } from '@nestjs/common';
import { getAppConfig } from '../../config/app-config';
import { TenantsService } from '../tenants/tenants.service';
import { CountryConfigService } from '../localization/country-config.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

@Controller('settings')
@UseGuards(PermissionsGuard)
export class SettingsController {
  constructor(
    private tenantsService: TenantsService,
    private countryConfig: CountryConfigService,
  ) {}

  @Get()
  @RequirePermissions('core:settings:read')
  async getSettings(@TenantId() tenantId: string) {
    const tenant = await this.tenantsService.findById(tenantId);
    const countryContext = await this.countryConfig.getTenantCountryContext(tenantId);
    return {
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          code: tenant.code,
          country: tenant.country,
          currency: tenant.currency,
          settings: tenant.settings,
        },
        country: {
          code: countryContext.countryCode,
          profile: countryContext.profile,
          currency: countryContext.currency,
          timezone: countryContext.timezone,
          taxProfile: countryContext.taxProfile,
          companyProfile: countryContext.companyProfile,
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
