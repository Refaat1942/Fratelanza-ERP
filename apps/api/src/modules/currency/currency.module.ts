import { Module } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { ExchangeRateService } from './exchange-rate.service';
import { CurrencyController } from './currency.controller';

@Module({
  providers: [CurrencyService, ExchangeRateService],
  controllers: [CurrencyController],
  exports: [CurrencyService, ExchangeRateService],
})
export class CurrencyModule {}
