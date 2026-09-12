import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import {
  IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min,
} from 'class-validator';
import { CurrencyService } from './currency.service';
import { ExchangeRateService } from './exchange-rate.service';
import { TenantId, RequirePermissions, RequireModule } from '../../common/decorators';
import { PermissionsGuard, ModuleAccessGuard } from '../../common/guards';

class UpsertCurrencyDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() symbol?: string;
  @IsOptional() @IsInt() @Min(0) decimalPlaces?: number;
  @IsOptional() @IsBoolean() isBase?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class RecordExchangeRateDto {
  @IsString() fromCurrency!: string;
  @IsString() toCurrency!: string;
  @IsNumber() @Min(0.00000001) rate!: number;
  @IsOptional() @IsString() asOfDate?: string;
}

@Controller('currency')
@UseGuards(PermissionsGuard, ModuleAccessGuard)
@RequireModule('currency')
export class CurrencyController {
  constructor(
    private currencies: CurrencyService,
    private exchangeRates: ExchangeRateService,
  ) {}

  @Get()
  @RequirePermissions('currency:currencies:read')
  async list(@TenantId() tenantId: string) {
    const data = await this.currencies.list(tenantId);
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('currency:currencies:manage')
  async create(@TenantId() tenantId: string, @Body() dto: UpsertCurrencyDto) {
    const data = await this.currencies.create(tenantId, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @RequirePermissions('currency:currencies:manage')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: Partial<UpsertCurrencyDto>,
  ) {
    const data = await this.currencies.update(tenantId, id, dto);
    return { success: true, data };
  }

  @Get('rates')
  @RequirePermissions('currency:rates:read')
  async listRates(
    @TenantId() tenantId: string,
    @Query('fromCurrency') fromCurrency?: string,
    @Query('toCurrency') toCurrency?: string,
  ) {
    const data = await this.exchangeRates.list(tenantId, { fromCurrency, toCurrency });
    return { success: true, data };
  }

  @Post('rates')
  @RequirePermissions('currency:rates:manage')
  async recordRate(@TenantId() tenantId: string, @Body() dto: RecordExchangeRateDto) {
    const data = await this.exchangeRates.record(tenantId, dto);
    return { success: true, data };
  }

  @Get('rates/trend')
  @RequirePermissions('currency:rates:read')
  async trend(
    @TenantId() tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const data = await this.exchangeRates.trend(tenantId, from, to);
    return { success: true, data };
  }

  @Delete('rates/:id')
  @RequirePermissions('currency:rates:manage')
  async deleteRate(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.exchangeRates.delete(tenantId, id);
    return { success: true, data };
  }

  @Get('rates/convert')
  @RequirePermissions('currency:rates:read')
  async convert(
    @TenantId() tenantId: string,
    @Query('amount') amount: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const data = await this.exchangeRates.convert(tenantId, amount, from, to);
    return { success: true, data: { amount: data.toString() } };
  }
}
