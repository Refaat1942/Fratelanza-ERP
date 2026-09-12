import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';
import { CurrencyService } from './currency.service';

interface RecordRateInput {
  fromCurrency: string;
  toCurrency: string;
  rate: number | string;
  asOfDate?: string;
  createdById?: string;
}

@Injectable()
export class ExchangeRateService {
  constructor(
    private prisma: PrismaService,
    private currencies: CurrencyService,
  ) {}

  async list(tenantId: string, pair?: { fromCurrency?: string; toCurrency?: string }) {
    return this.prisma.exchangeRate.findMany({
      where: {
        tenantId,
        fromCurrency: pair?.fromCurrency?.toUpperCase(),
        toCurrency: pair?.toCurrency?.toUpperCase(),
      },
      orderBy: { asOfDate: 'desc' },
    });
  }

  /** Chronological rate history for a currency pair, for the trend chart. */
  async trend(tenantId: string, fromCurrency: string, toCurrency: string) {
    const rows = await this.prisma.exchangeRate.findMany({
      where: { tenantId, fromCurrency: fromCurrency.toUpperCase(), toCurrency: toCurrency.toUpperCase() },
      orderBy: { asOfDate: 'asc' },
    });
    return rows.map((r) => ({ asOfDate: r.asOfDate.toISOString().slice(0, 10), rate: r.rate.toString() }));
  }

  async delete(tenantId: string, id: string) {
    const rate = await this.prisma.exchangeRate.findFirst({ where: { id, tenantId } });
    if (!rate) {
      throw new NotFoundException('Exchange rate not found');
    }
    await this.prisma.exchangeRate.delete({ where: { id } });
    return { deleted: true };
  }

  async record(tenantId: string, dto: RecordRateInput) {
    const fromCurrency = dto.fromCurrency.toUpperCase();
    const toCurrency = dto.toCurrency.toUpperCase();
    if (fromCurrency === toCurrency) {
      throw new BadRequestException('fromCurrency and toCurrency must differ');
    }

    const rate = new Prisma.Decimal(dto.rate);
    if (!rate.isFinite() || rate.isNegative() || rate.isZero()) {
      throw new BadRequestException('rate must be a positive number');
    }

    const asOfDate = dto.asOfDate ? new Date(dto.asOfDate) : new Date();

    return this.prisma.exchangeRate.upsert({
      where: {
        tenantId_fromCurrency_toCurrency_asOfDate: {
          tenantId,
          fromCurrency,
          toCurrency,
          asOfDate,
        },
      },
      update: { rate, createdById: dto.createdById },
      create: {
        tenantId,
        fromCurrency,
        toCurrency,
        rate,
        asOfDate,
        createdById: dto.createdById,
      },
    });
  }

  /**
   * Latest rate on or before asOfDate. Same-currency pairs always resolve to 1.
   * Falls back to the inverse of the reverse pair when a direct rate is missing.
   */
  async getRate(
    tenantId: string,
    fromCurrency: string,
    toCurrency: string,
    asOfDate: Date = new Date(),
  ): Promise<Prisma.Decimal> {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();
    if (from === to) {
      return new Prisma.Decimal(1);
    }

    const direct = await this.prisma.exchangeRate.findFirst({
      where: { tenantId, fromCurrency: from, toCurrency: to, asOfDate: { lte: asOfDate } },
      orderBy: { asOfDate: 'desc' },
    });
    if (direct) {
      return direct.rate;
    }

    const inverse = await this.prisma.exchangeRate.findFirst({
      where: { tenantId, fromCurrency: to, toCurrency: from, asOfDate: { lte: asOfDate } },
      orderBy: { asOfDate: 'desc' },
    });
    if (inverse && !inverse.rate.isZero()) {
      return new Prisma.Decimal(1).dividedBy(inverse.rate);
    }

    throw new NotFoundException(`No exchange rate found for ${from} → ${to}`);
  }

  async convert(
    tenantId: string,
    amount: Prisma.Decimal | string | number,
    fromCurrency: string,
    toCurrency: string,
    asOfDate?: Date,
  ): Promise<Prisma.Decimal> {
    const rate = await this.getRate(tenantId, fromCurrency, toCurrency, asOfDate);
    return new Prisma.Decimal(amount).mul(rate);
  }

  async convertToBase(
    tenantId: string,
    amount: Prisma.Decimal | string | number,
    fromCurrency: string,
    asOfDate?: Date,
  ): Promise<Prisma.Decimal> {
    const base = await this.currencies.getBaseCurrency(tenantId);
    return this.convert(tenantId, amount, fromCurrency, base, asOfDate);
  }
}
