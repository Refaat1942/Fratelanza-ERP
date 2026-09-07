import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LedgerEntry,
  LedgerDirection,
  PatientAccount,
  Prisma,
} from '../../../../../../packages/database/generated/server';
import { PatientAccountService } from './patient-account.service';
import type { LedgerPostInput, LedgerPostResult } from './ledger.types';
import { applyDirectionToBalance, toPositiveMoneyDecimal } from './money.util';

type TxClient = Prisma.TransactionClient;

/**
 * Append-only patient ledger posting engine.
 *
 * INVARIANT: LedgerEntry and PatientAccount.cachedBalance are updated in the
 * same caller-provided transaction. This service never opens nested transactions.
 *
 * Ledger entries must never be updated or deleted — corrections use reversal entries.
 */
@Injectable()
export class LedgerPostingService {
  constructor(private patientAccounts: PatientAccountService) {}

  /**
   * Posts a single ledger entry and updates cachedBalance atomically.
   * @param tx Active Prisma transaction — required.
   */
  async postEntry(input: LedgerPostInput, tx: TxClient): Promise<LedgerPostResult> {
    const amount = toPositiveMoneyDecimal(input.amount);
    const direction = this.toLedgerDirection(input.direction);

    await this.validateBranchInTenant(input.tenantId, input.branchId, tx);

    const account = await this.patientAccounts.assertAccountScope(
      input.tenantId,
      input.accountId,
      input.patientId,
      tx,
    );

    if (input.reversalOfId) {
      await this.assertReversalTarget(input.reversalOfId, input.accountId, tx);
    }

    const currentBalance = new Prisma.Decimal(account.cachedBalance);
    const newBalance = applyDirectionToBalance(currentBalance, amount, input.direction);

    const entry = await tx.ledgerEntry.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        accountId: input.accountId,
        entryType: input.entryType,
        direction,
        amount,
        currency: account.currency,
        entryDate: input.entryDate,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        reversalOfId: input.reversalOfId,
        description: input.description,
        runningBalance: newBalance,
        createdById: input.createdById,
      },
    });

    const updatedAccount = await tx.patientAccount.update({
      where: { id: account.id },
      data: {
        cachedBalance: newBalance,
        balanceAsOf: new Date(),
      },
    });

    return { entry, account: updatedAccount };
  }

  /**
   * Rejects attempts to mutate ledger rows — append-only enforcement at service layer.
   */
  rejectLedgerMutation(): never {
    throw new BadRequestException(
      'Ledger entries are append-only; use compensating reversal entries',
    );
  }

  updateLedgerEntry(): never {
    return this.rejectLedgerMutation();
  }

  deleteLedgerEntry(): never {
    return this.rejectLedgerMutation();
  }

  private toLedgerDirection(direction: LedgerPostInput['direction']): LedgerDirection {
    return direction === 'debit' ? LedgerDirection.debit : LedgerDirection.credit;
  }

  private async validateBranchInTenant(
    tenantId: string,
    branchId: string,
    tx: TxClient,
  ): Promise<void> {
    const branch = await tx.branch.findFirst({
      where: { id: branchId, tenantId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
  }

  private async assertReversalTarget(
    reversalOfId: string,
    accountId: string,
    tx: TxClient,
  ): Promise<LedgerEntry> {
    const original = await tx.ledgerEntry.findFirst({
      where: { id: reversalOfId, accountId },
    });
    if (!original) {
      throw new NotFoundException('Original ledger entry not found for reversal');
    }

    const existingReversal = await tx.ledgerEntry.findFirst({
      where: { reversalOfId },
    });
    if (existingReversal) {
      throw new BadRequestException('Ledger entry has already been reversed');
    }

    return original;
  }
}
