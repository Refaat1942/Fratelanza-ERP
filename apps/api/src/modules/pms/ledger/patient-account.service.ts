import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PatientAccount,
  Prisma,
} from '../../../../../../packages/database/generated/server';
import { PrismaService } from '../../../database/prisma.service';
import type { BalanceReconciliation } from './ledger.types';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class PatientAccountService {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns the account for a patient within a tenant, or creates one if missing.
   * Enforces one account per (tenantId, patientId).
   */
  async getOrCreateAccount(
    tenantId: string,
    patientId: string,
    tx?: TxClient,
  ): Promise<PatientAccount> {
    await this.assertPatientInTenant(tenantId, patientId, tx);

    const db = tx ?? this.prisma;
    const existing = await db.patientAccount.findFirst({
      where: { tenantId, patientId },
    });
    if (existing) {
      return existing;
    }

    try {
      return await db.patientAccount.create({
        data: {
          tenantId,
          patientId,
          currency: await this.resolveTenantCurrency(tenantId, db),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        const raced = await db.patientAccount.findFirst({
          where: { tenantId, patientId },
        });
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  async getAccountForPatient(
    tenantId: string,
    patientId: string,
    tx?: TxClient,
  ): Promise<PatientAccount> {
    const db = tx ?? this.prisma;
    const account = await db.patientAccount.findFirst({
      where: { tenantId, patientId },
    });
    if (!account) {
      throw new NotFoundException('Patient account not found');
    }
    return account;
  }

  async getAccountById(
    tenantId: string,
    accountId: string,
    tx?: TxClient,
  ): Promise<PatientAccount> {
    const db = tx ?? this.prisma;
    const account = await db.patientAccount.findFirst({
      where: { id: accountId, tenantId },
    });
    if (!account) {
      throw new NotFoundException('Patient account not found');
    }
    return account;
  }

  async getBalance(tenantId: string, accountId: string): Promise<Prisma.Decimal> {
    const account = await this.getAccountById(tenantId, accountId);
    return new Prisma.Decimal(account.cachedBalance);
  }

  /**
   * Validates tenantId, accountId, and optional patientId belong together.
   */
  async assertAccountScope(
    tenantId: string,
    accountId: string,
    patientId: string,
    tx: TxClient,
  ): Promise<PatientAccount> {
    const account = await this.lockAccountForUpdate(tenantId, accountId, tx);

    if (account.patientId !== patientId) {
      throw new ForbiddenException('Patient does not match account');
    }

    const patient = await tx.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    if (patient.tenantId !== tenantId) {
      throw new ForbiddenException('Patient does not belong to tenant');
    }

    return account;
  }

  /**
   * Row-level lock for financial mutations — must be called inside an active transaction.
   */
  async lockAccountForUpdate(
    tenantId: string,
    accountId: string,
    tx: TxClient,
  ): Promise<PatientAccount> {
    const rows = await tx.$queryRaw<PatientAccount[]>`
      SELECT
        id,
        "tenantId",
        "patientId",
        "cachedBalance",
        "balanceAsOf",
        currency,
        status,
        "openedAt",
        "createdAt",
        "updatedAt"
      FROM pms_patient_accounts
      WHERE id = ${accountId}::uuid
        AND "tenantId" = ${tenantId}::uuid
      FOR UPDATE
    `;

    const account = rows[0];
    if (!account) {
      throw new NotFoundException('Patient account not found');
    }

    return {
      ...account,
      cachedBalance: new Prisma.Decimal(account.cachedBalance),
    };
  }

  /**
   * Computes balance from ledger entries (source of truth) for reconciliation.
   * cachedBalance = SUM(debits) - SUM(credits)
   */
  async computeLedgerDerivedBalance(
    accountId: string,
    tx?: TxClient,
  ): Promise<{ balance: Prisma.Decimal; entryCount: number }> {
    const db = tx ?? this.prisma;
    const rows = await db.$queryRaw<Array<{ balance: Prisma.Decimal; entry_count: bigint }>>`
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN direction = 'debit'::"LedgerDirection" THEN amount
              ELSE 0
            END
          ),
          0
        ) - COALESCE(
          SUM(
            CASE
              WHEN direction = 'credit'::"LedgerDirection" THEN amount
              ELSE 0
            END
          ),
          0
        ) AS balance,
        COUNT(*)::bigint AS entry_count
      FROM pms_ledger_entries
      WHERE "accountId" = ${accountId}::uuid
    `;

    const row = rows[0];
    return {
      balance: new Prisma.Decimal(row?.balance ?? 0),
      entryCount: Number(row?.entry_count ?? 0),
    };
  }

  async reconcileBalance(
    tenantId: string,
    accountId: string,
    tx?: TxClient,
  ): Promise<BalanceReconciliation> {
    const account = await this.getAccountById(tenantId, accountId, tx);
    const derived = await this.computeLedgerDerivedBalance(accountId, tx);
    const cachedBalance = new Prisma.Decimal(account.cachedBalance);

    return {
      accountId,
      cachedBalance,
      ledgerDerivedBalance: derived.balance,
      matches: cachedBalance.equals(derived.balance),
      entryCount: derived.entryCount,
    };
  }

  private async assertPatientInTenant(
    tenantId: string,
    patientId: string,
    tx?: TxClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const patient = await db.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
  }

  private async resolveTenantCurrency(
    tenantId: string,
    db: TxClient | PrismaService,
  ): Promise<string> {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = tenant?.settings as { defaultCurrency?: string } | null;
    return settings?.defaultCurrency ?? 'EGP';
  }
}
