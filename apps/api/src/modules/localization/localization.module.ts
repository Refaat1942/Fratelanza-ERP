import { Module } from '@nestjs/common';
import { CountryConfigService } from './country-config.service';
import { TaxEngineService } from './tax-engine.service';
import { EInvoicingEngineService } from './e-invoicing-engine.service';
import { IntegrationsController } from './integrations.controller';
import { EgyptTaxProvider } from './providers/egypt-tax.provider';
import { SaudiTaxProvider } from './providers/saudi-tax.provider';
import { EgyptEtaProvider } from './providers/egypt-eta.provider';
import { SaudiZatcaProvider } from './providers/saudi-zatca.provider';

@Module({
  controllers: [IntegrationsController],
  providers: [
    CountryConfigService,
    TaxEngineService,
    EInvoicingEngineService,
    EgyptTaxProvider,
    SaudiTaxProvider,
    EgyptEtaProvider,
    SaudiZatcaProvider,
  ],
  exports: [
    CountryConfigService,
    TaxEngineService,
    EInvoicingEngineService,
    EgyptEtaProvider,
    SaudiZatcaProvider,
  ],
})
export class LocalizationModule {}
