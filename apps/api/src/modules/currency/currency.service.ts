import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface UpsertCurrencyInput {
  code: string;
  name: string;
  symbol?: string;
  decimalPlaces?: number;
  isBase?: boolean;
  isActive?: boolean;
}

@Injectable()
export class CurrencyService {
  constructor(private prisma: PrismaService) {}

  async list(tenantId: string) {
    return this.prisma.currency.findMany({
      where: { tenantId },
      orderBy: [{ isBase: 'desc' }, { code: 'asc' }],
    });
  }

  async create(tenantId: string, dto: UpsertCurrencyInput) {
    if (dto.isBase) {
      await this.prisma.currency.updateMany({
        where: { tenantId, isBase: true },
        data: { isBase: false },
      });
    }

    return this.prisma.currency.create({
      data: {
        tenantId,
        code: dto.code.toUpperCase(),
        name: dto.name,
        symbol: dto.symbol,
        decimalPlaces: dto.decimalPlaces ?? 2,
        isBase: dto.isBase ?? false,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(tenantId: string, id: string, dto: Partial<UpsertCurrencyInput>) {
    const existing = await this.prisma.currency.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Currency not found');
    }

    if (dto.isBase) {
      await this.prisma.currency.updateMany({
        where: { tenantId, isBase: true, id: { not: id } },
        data: { isBase: false },
      });
    }

    return this.prisma.currency.update({
      where: { id },
      data: {
        name: dto.name,
        symbol: dto.symbol,
        decimalPlaces: dto.decimalPlaces,
        isBase: dto.isBase,
        isActive: dto.isActive,
      },
    });
  }

  async seedDefaults(tenantId: string, baseCurrencyCode: string) {
    const count = await this.prisma.currency.count({ where: { tenantId } });
    if (count > 0) {
      return { created: 0 };
    }

    await this.prisma.currency.create({
      data: {
        tenantId,
        code: baseCurrencyCode.toUpperCase(),
        name: baseCurrencyCode.toUpperCase(),
        isBase: true,
        isActive: true,
      },
    });

    return { created: 1 };
  }

  async getBaseCurrency(tenantId: string): Promise<string> {
    const base = await this.prisma.currency.findFirst({
      where: { tenantId, isBase: true },
    });
    if (base) {
      return base.code;
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }
    return tenant.currency;
  }
}
