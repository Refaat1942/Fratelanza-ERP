import { Injectable, ForbiddenException } from '@nestjs/common';
import { CountryConfigService } from '../localization/country-config.service';
import { SaudiZatcaProvider } from '../localization/providers/saudi-zatca.provider';

/** @deprecated Use IntegrationsController / SaudiZatcaProvider directly */
@Injectable()
export class ZatcaService {
  constructor(
    private countryConfig: CountryConfigService,
    private saudiZatcaProvider: SaudiZatcaProvider,
  ) {}

  async getStatus(tenantId: string) {
    await this.countryConfig.assertTenantAuthority(tenantId, 'ZATCA');
    return this.saudiZatcaProvider.getStatus(tenantId);
  }

  async getLogs(tenantId: string) {
    await this.countryConfig.assertTenantAuthority(tenantId, 'ZATCA');
    return this.saudiZatcaProvider.getLogs(tenantId);
  }

  async updateSettings(
    tenantId: string,
    dto: Parameters<SaudiZatcaProvider['updateSettings']>[1],
  ) {
    await this.countryConfig.assertTenantAuthority(tenantId, 'ZATCA');
    return this.saudiZatcaProvider.updateSettings(tenantId, dto);
  }
}
