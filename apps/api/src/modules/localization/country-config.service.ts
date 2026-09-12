import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  assertCountryAuthority,
  COUNTRY_PROFILES,
  DEFAULT_TAX_PROFILES,
  getCountryProfile,
  normalizeCountryCode,
  type CountryCode,
  type CountryProfile,
  type CountryTaxProfile,
  type TaxAuthority,
} from '@fratelanza/shared';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CountryConfigService {
  constructor(private prisma: PrismaService) {}

  async getTenantCountryContext(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        code: true,
        country: true,
        currency: true,
        language: true,
        settings: true,
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const countryCode = this.resolveCountryCode(tenant.country);
    const profile = getCountryProfile(countryCode);

    return {
      tenant,
      countryCode,
      profile,
      currency: tenant.currency || profile.currency,
      timezone: this.readTimezone(tenant.settings, profile.timezone),
      taxProfile: this.readTaxProfile(tenant.settings, countryCode),
      companyProfile: this.readCompanyProfile(tenant.settings, countryCode),
    };
  }

  async getCountryCode(tenantId: string): Promise<CountryCode> {
    const ctx = await this.getTenantCountryContext(tenantId);
    return ctx.countryCode;
  }

  async getCountryProfile(tenantId: string): Promise<CountryProfile> {
    const ctx = await this.getTenantCountryContext(tenantId);
    return ctx.profile;
  }

  async getTaxProfile(tenantId: string): Promise<CountryTaxProfile> {
    const ctx = await this.getTenantCountryContext(tenantId);
    return ctx.taxProfile;
  }

  resolveCountryCode(raw?: string | null): CountryCode {
    const code = normalizeCountryCode(raw);
    if (!code) {
      throw new BadRequestException(`Unsupported or missing country configuration: ${raw ?? 'none'}`);
    }
    return code;
  }

  assertAuthorityForTenant(countryCode: CountryCode, authority: TaxAuthority): void {
    try {
      assertCountryAuthority(countryCode, authority);
    } catch {
      throw new ForbiddenException(
        `${authority} integration is not available for ${COUNTRY_PROFILES[countryCode].name} organizations`,
      );
    }
  }

  async assertTenantAuthority(tenantId: string, authority: TaxAuthority): Promise<CountryCode> {
    const countryCode = await this.getCountryCode(tenantId);
    this.assertAuthorityForTenant(countryCode, authority);
    return countryCode;
  }

  async updateTaxProfile(tenantId: string, profile: Partial<CountryTaxProfile>) {
    const ctx = await this.getTenantCountryContext(tenantId);
    const next: CountryTaxProfile = {
      ...ctx.taxProfile,
      ...profile,
      countryCode: ctx.countryCode,
      categories: profile.categories ?? ctx.taxProfile.categories,
    };
    const settings = (ctx.tenant.settings ?? {}) as Record<string, unknown>;
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...settings,
          taxProfile: next,
        } as object,
      },
    });
    return next;
  }

  async updateCompanyProfile(
    tenantId: string,
    company: Record<string, string | undefined>,
  ) {
    const ctx = await this.getTenantCountryContext(tenantId);
    const settings = (ctx.tenant.settings ?? {}) as Record<string, unknown>;
    const current = (settings.companyProfile ?? {}) as Record<string, string>;
    const next = { ...current, ...company };
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...settings,
          companyProfile: next,
        } as object,
      },
    });
    return next;
  }

  private readTimezone(settings: unknown, fallback: string): string {
    const s = (settings ?? {}) as Record<string, unknown>;
    return typeof s.timezone === 'string' ? s.timezone : fallback;
  }

  private readTaxProfile(settings: unknown, countryCode: CountryCode): CountryTaxProfile {
    const s = (settings ?? {}) as Record<string, unknown>;
    const stored = s.taxProfile as CountryTaxProfile | undefined;
    if (stored?.countryCode === countryCode && Array.isArray(stored.categories)) {
      return stored;
    }
    return DEFAULT_TAX_PROFILES[countryCode];
  }

  private readCompanyProfile(settings: unknown, countryCode: CountryCode) {
    const s = (settings ?? {}) as Record<string, unknown>;
    const stored = (s.companyProfile ?? {}) as Record<string, string>;
    return {
      countryCode,
      fields: stored,
    };
  }
}
