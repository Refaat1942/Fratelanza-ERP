import { Injectable } from '@nestjs/common';
import type { TaxLineInput, TaxLineResult } from '@fratelanza/shared';
import { CountryConfigService } from './country-config.service';
import { EgyptTaxProvider } from './providers/egypt-tax.provider';
import { SaudiTaxProvider } from './providers/saudi-tax.provider';
import type { CountryTaxProvider } from './providers/country-tax.provider';

@Injectable()
export class TaxEngineService {
  constructor(
    private countryConfig: CountryConfigService,
    private egyptTaxProvider: EgyptTaxProvider,
    private saudiTaxProvider: SaudiTaxProvider,
  ) {}

  async calculateLineTax(tenantId: string, input: TaxLineInput): Promise<TaxLineResult> {
    const ctx = await this.countryConfig.getTenantCountryContext(tenantId);
    const provider = this.resolveProvider(ctx.countryCode);
    return provider.calculateLineTax(ctx.taxProfile, input);
  }

  async getTaxProfile(tenantId: string) {
    const ctx = await this.countryConfig.getTenantCountryContext(tenantId);
    return {
      countryCode: ctx.countryCode,
      profile: ctx.profile,
      taxProfile: ctx.taxProfile,
    };
  }

  private resolveProvider(countryCode: string): CountryTaxProvider {
    switch (countryCode) {
      case 'EG':
        return this.egyptTaxProvider;
      case 'SA':
        return this.saudiTaxProvider;
      default:
        return this.saudiTaxProvider;
    }
  }
}
