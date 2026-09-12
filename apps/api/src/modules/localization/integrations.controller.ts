import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import { CountryConfigService } from './country-config.service';
import { TaxEngineService } from './tax-engine.service';
import { EInvoicingEngineService } from './e-invoicing-engine.service';
import { EgyptEtaProvider } from './providers/egypt-eta.provider';
import { SaudiZatcaProvider } from './providers/saudi-zatca.provider';

class UpdateEtaSettingsDto {
  @IsOptional() @IsIn(['sandbox', 'production']) environment?: 'sandbox' | 'production';
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() clientSecret?: string;
  @IsOptional() @IsString() posSerial?: string;
  @IsOptional() @IsString() posOsVersion?: string;
  @IsOptional() @IsString() posModel?: string;
}

class UpdateEtaReceiptSettingsDto {
  @IsOptional() @IsIn(['sandbox', 'production']) environment?: 'sandbox' | 'production';
  @IsOptional() @IsString() posSerial?: string;
  @IsOptional() @IsString() posClientSecret?: string;
}

class UpdateZatcaSettingsDto {
  @IsOptional() @IsIn(['sandbox', 'production']) environment?: 'sandbox' | 'production';
  @IsOptional() @IsString() vatNumber?: string;
  @IsOptional() @IsString() csrCommonName?: string;
}

@Controller('integrations')
@UseGuards(PermissionsGuard)
export class IntegrationsController {
  constructor(
    private countryConfig: CountryConfigService,
    private taxEngine: TaxEngineService,
    private eInvoicingEngine: EInvoicingEngineService,
    private egyptEtaProvider: EgyptEtaProvider,
    private saudiZatcaProvider: SaudiZatcaProvider,
  ) {}

  @Get('country')
  @RequirePermissions('core:settings:read')
  async countryContext(@TenantId() tenantId: string) {
    const data = await this.eInvoicingEngine.getTenantIntegrationSummary(tenantId);
    return { success: true, data };
  }

  @Get('tax/profile')
  @RequirePermissions('core:settings:read')
  async taxProfile(@TenantId() tenantId: string) {
    const data = await this.taxEngine.getTaxProfile(tenantId);
    return { success: true, data };
  }

  @Get('logs')
  @RequirePermissions('core:settings:read')
  async logs(@TenantId() tenantId: string) {
    const data = await this.eInvoicingEngine.getLogs(tenantId);
    return { success: true, data };
  }

  @Get('egypt/status')
  @RequirePermissions('core:settings:read')
  async egyptStatus(@TenantId() tenantId: string) {
    await this.countryConfig.assertTenantAuthority(tenantId, 'ETA');
    const [eInvoice, eReceipt] = await Promise.all([
      this.egyptEtaProvider.getStatus(tenantId),
      this.egyptEtaProvider.getReceiptStatus(tenantId),
    ]);
    return { success: true, data: { eInvoice, eReceipt } };
  }

  @Patch('egypt/settings')
  @RequirePermissions('core:settings:update')
  async updateEgyptSettings(@TenantId() tenantId: string, @Body() dto: UpdateEtaSettingsDto) {
    await this.countryConfig.assertTenantAuthority(tenantId, 'ETA');
    const data = await this.egyptEtaProvider.updateInvoiceSettings(tenantId, dto);
    return { success: true, data };
  }

  @Patch('egypt/ereceipt/settings')
  @RequirePermissions('core:settings:update')
  async updateEgyptReceiptSettings(
    @TenantId() tenantId: string,
    @Body() dto: UpdateEtaReceiptSettingsDto,
  ) {
    await this.countryConfig.assertTenantAuthority(tenantId, 'ETA');
    const data = await this.egyptEtaProvider.updateReceiptSettings(tenantId, dto);
    return { success: true, data };
  }

  @Get('egypt/logs')
  @RequirePermissions('core:settings:read')
  async egyptLogs(@TenantId() tenantId: string) {
    await this.countryConfig.assertTenantAuthority(tenantId, 'ETA');
    const data = await this.eInvoicingEngine.getLogs(tenantId, 'ETA');
    return { success: true, data };
  }

  @Get('saudi/status')
  @RequirePermissions('core:settings:read')
  async saudiStatus(@TenantId() tenantId: string) {
    await this.countryConfig.assertTenantAuthority(tenantId, 'ZATCA');
    const data = await this.saudiZatcaProvider.getStatus(tenantId);
    return { success: true, data };
  }

  @Patch('saudi/settings')
  @RequirePermissions('core:settings:update')
  async updateSaudiSettings(@TenantId() tenantId: string, @Body() dto: UpdateZatcaSettingsDto) {
    await this.countryConfig.assertTenantAuthority(tenantId, 'ZATCA');
    const data = await this.saudiZatcaProvider.updateSettings(tenantId, dto);
    return { success: true, data };
  }

  @Get('saudi/logs')
  @RequirePermissions('core:settings:read')
  async saudiLogs(@TenantId() tenantId: string) {
    await this.countryConfig.assertTenantAuthority(tenantId, 'ZATCA');
    const data = await this.saudiZatcaProvider.getLogs(tenantId);
    return { success: true, data };
  }
}
