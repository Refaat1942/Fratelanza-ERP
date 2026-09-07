import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';

const AMOUNT_SCALE = 4;

export function toBoqDecimal(
  value: Prisma.Decimal | string | number,
  fieldName: string,
): Prisma.Decimal {
  try {
    const decimal =
      value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
    if (!decimal.isFinite()) {
      throw new BadRequestException(`Invalid ${fieldName}: must be finite`);
    }
    return decimal.toDecimalPlaces(AMOUNT_SCALE);
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(`Invalid ${fieldName}: not a valid decimal value`);
  }
}

export function multiplyBoqAmount(
  plannedQuantity: Prisma.Decimal | string | number,
  unitRate: Prisma.Decimal | string | number,
): Prisma.Decimal {
  const qty = toBoqDecimal(plannedQuantity, 'plannedQuantity');
  const rate = toBoqDecimal(unitRate, 'unitRate');
  if (qty.isZero() || qty.isNegative()) {
    throw new BadRequestException('plannedQuantity must be greater than zero');
  }
  if (rate.isNegative()) {
    throw new BadRequestException('unitRate cannot be negative');
  }
  return qty.mul(rate).toDecimalPlaces(AMOUNT_SCALE);
}

export function sumBoqAmounts(amounts: Prisma.Decimal[]): Prisma.Decimal {
  return amounts
    .reduce(
      (total, amount) => total.add(amount),
      new Prisma.Decimal(0),
    )
    .toDecimalPlaces(AMOUNT_SCALE);
}
