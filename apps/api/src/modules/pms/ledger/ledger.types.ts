import type {
  LedgerEntry,
  LedgerEntryType,
  PatientAccount,
  Prisma,
} from '../../../../../../packages/database/generated/server';

export type LedgerDirection = 'debit' | 'credit';

export interface LedgerPostInput {
  tenantId: string;
  branchId: string;
  accountId: string;
  patientId: string;
  direction: LedgerDirection;
  amount: Prisma.Decimal | string | number;
  entryType: LedgerEntryType;
  entryDate: Date;
  referenceType: string;
  referenceId: string;
  description?: string;
  reversalOfId?: string;
  createdById?: string;
}

export interface BalanceReconciliation {
  accountId: string;
  cachedBalance: Prisma.Decimal;
  ledgerDerivedBalance: Prisma.Decimal;
  matches: boolean;
  entryCount: number;
}

export interface LockedPatientAccount extends PatientAccount {
  cachedBalance: Prisma.Decimal;
}

export type LedgerPostResult = {
  entry: LedgerEntry;
  account: PatientAccount;
};
