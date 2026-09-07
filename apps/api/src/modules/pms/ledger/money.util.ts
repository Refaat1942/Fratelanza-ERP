import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../../../../../packages/database/generated/server';

/**
 * Converts input to Prisma.Decimal and validates it is a positive monetary amount.
 * Never use JavaScript number arithmetic for persisted money.
 */
export function toPositiveMoneyDecimal(
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
  if (decimal.isZero()) {
    throw new BadRequestException(`Invalid ${fieldName}: amount must be greater than zero`);
  }

  return decimal;
}

/**
 * Applies debit/credit semantics to a balance.
 * Debit = patient owes more; Credit = patient owes less.
 * cachedBalance = total debits - total credits
 */
export function applyDirectionToBalance(
  currentBalance: Prisma.Decimal,
  amount: Prisma.Decimal,
  direction: 'debit' | 'credit',
): Prisma.Decimal {
  if (direction === 'debit') {
    return currentBalance.add(amount);
  }
  return currentBalance.sub(amount);
}
