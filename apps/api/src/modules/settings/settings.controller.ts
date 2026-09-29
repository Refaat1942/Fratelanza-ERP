import { Controller, Get, Post, UseGuards, BadRequestException } from '@nestjs/common';
import { getAppConfig } from '../../config/app-config';
import { TenantsService } from '../tenants/tenants.service';
import { CountryConfigService } from '../localization/country-config.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import { PrismaService } from '../../database/prisma.service';
import { seedDemoTenantVolume } from '../platform/demo-volume.util';

@Controller('settings')
@UseGuards(PermissionsGuard)
export class SettingsController {
  constructor(
    private tenantsService: TenantsService,
    private countryConfig: CountryConfigService,
    private prisma: PrismaService,
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

  @Post('seed-sample-data')
  @RequirePermissions('core:settings:update')
  async seedSampleData(@TenantId() tenantId: string) {
    const branch = await this.prisma.branch.findFirst({ where: { tenantId } });
    if (!branch) throw new BadRequestException('No branch found to seed into');

    const existingProducts = await this.prisma.product.count({ where: { tenantId } });
    if (existingProducts > 0) {
      throw new BadRequestException('This account already has data. Sample data can only be added to an empty account.');
    }

    const data = await seedDemoTenantVolume(this.prisma, tenantId, branch.id);
    return { success: true, data };
  }
}
