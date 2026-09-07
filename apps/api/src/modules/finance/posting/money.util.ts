import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../../../../../packages/database/generated/server';

const BALANCE_TOLERANCE = new Prisma.Decimal('0.0001');

export function toMoneyDecimal(
  value: Prisma.Decimal | string | number,
  fieldName = 'amount',
): Prisma.Decimal {
  let decimal: Prisma.Decimal;
  try {
    decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  } catch {
    throw new BadRequestException(`Invalid ${fieldName}: not a valid decimal value`);
  }

  if (!decimal.isFinite()) {
    throw new BadRequestException(`Invalid ${fieldName}: must be finite`);
  }
  if (decimal.isNegative()) {
    throw new BadRequestException(`Invalid ${fieldName}: negative amounts are not allowed`);
  }

  return decimal;
}

export function assertBalancedLines(
  lines: Array<{ debit: Prisma.Decimal; credit: Prisma.Decimal }>,
): { totalDebit: Prisma.Decimal; totalCredit: Prisma.Decimal } {
  if (lines.length < 2) {
    throw new BadRequestException('Journal entry requires at least two lines');
  }

  let totalDebit = new Prisma.Decimal(0);
  let totalCredit = new Prisma.Decimal(0);

  for (const line of lines) {
    if (line.debit.isZero() && line.credit.isZero()) {
      throw new BadRequestException('Journal line cannot have zero debit and zero credit');
    }
    if (!line.debit.isZero() && !line.credit.isZero()) {
      throw new BadRequestException('Journal line cannot have both debit and credit');
    }
    totalDebit = totalDebit.add(line.debit);
    totalCredit = totalCredit.add(line.credit);
  }

  const diff = totalDebit.sub(totalCredit).abs();
  if (diff.greaterThan(BALANCE_TOLERANCE)) {
    throw new BadRequestException(
      `Journal entry not balanced: debit ${totalDebit.toString()} vs credit ${totalCredit.toString()}`,
    );
  }

  if (totalDebit.isZero()) {
    throw new BadRequestException('Journal entry total must be greater than zero');
  }

  return { totalDebit, totalCredit };
}

export function sideAmount(
  side: 'debit' | 'credit',
  amount: Prisma.Decimal,
): { debit: Prisma.Decimal; credit: Prisma.Decimal } {
  if (amount.isZero()) {
    throw new BadRequestException('Posting line amount must be greater than zero');
  }
  return side === 'debit'
    ? { debit: amount, credit: new Prisma.Decimal(0) }
    : { debit: new Prisma.Decimal(0), credit: amount };
}
