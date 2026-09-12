import { BadRequestException, Injectable } from '@nestjs/common';
import type { CountryCode, TaxAuthority } from '@fratelanza/shared';
import { PrismaService } from '../../database/prisma.service';
import { CountryConfigService } from './country-config.service';
import { EgyptEtaProvider } from './providers/egypt-eta.provider';
import { SaudiZatcaProvider } from './providers/saudi-zatca.provider';
import type { EInvoicingProvider } from './providers/e-invoicing.provider';

@Injectable()
export class EInvoicingEngineService {
  constructor(
    private countryConfig: CountryConfigService,
    private egyptEtaProvider: EgyptEtaProvider,
    private saudiZatcaProvider: SaudiZatcaProvider,
    private prisma: PrismaService,
  ) {}

  async getTenantIntegrationSummary(tenantId: string) {
    const ctx = await this.countryConfig.getTenantCountryContext(tenantId);
    const provider = this.resolveProvider(ctx.countryCode);
    const status = await provider.getStatus(tenantId);
    return {
      countryCode: ctx.countryCode,
      country: ctx.profile,
      currency: ctx.currency,
      timezone: ctx.timezone,
      integration: status,
    };
  }

  async queueDocument(
    tenantId: string,
    input: { documentType: string; documentId: string; documentNumber: string },
  ) {
    const countryCode = await this.countryConfig.getCountryCode(tenantId);
    const provider = this.resolveProvider(countryCode);
    return provider.queueDocument({
      tenantId,
      countryCode,
      ...input,
    });
  }

  async getLogs(tenantId: string, authority?: TaxAuthority, take = 50) {
    return this.prisma.governmentIntegrationLog.findMany({
      where: {
        tenantId,
        ...(authority ? { authority } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  resolveProvider(countryCode: CountryCode): EInvoicingProvider {
    if (countryCode === 'EG') return this.egyptEtaProvider;
    if (countryCode === 'SA') return this.saudiZatcaProvider;
    throw new BadRequestException(`No e-invoicing provider for country ${countryCode}`);
  }
}
