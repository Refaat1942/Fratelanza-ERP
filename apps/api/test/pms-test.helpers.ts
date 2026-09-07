import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import {
  LedgerEntryType,
  Prisma,
} from '../../../packages/database/generated/server';
import { PrismaService } from '../src/database/prisma.service';
import { LedgerPostingService } from '../src/modules/pms/ledger/ledger-posting.service';
import { PatientAccountService } from '../src/modules/pms/ledger/patient-account.service';
import { applyDirectionToBalance, toPositiveMoneyDecimal } from '../src/modules/pms/ledger/money.util';
import { createTestApp, loginAdmin } from './test-app';

export interface PmsTestContext {
  tenantId: string;
  branchId: string;
  adminUserId: string;
}

export async function loadPmsTestContext(app: INestApplication): Promise<PmsTestContext> {
  const auth = await loginAdmin(app);
  const prisma = app.get(PrismaService);
  const admin = await prisma.user.findFirst({
    where: { email: 'admin@fratelanza.local' },
  });

  return {
    tenantId: auth.user.tenantId,
    branchId: auth.user.branchId ?? '',
    adminUserId: admin!.id,
  };
}

export async function createTestPatient(
  prisma: PrismaService,
  ctx: PmsTestContext,
  suffix: string,
): Promise<{ patientId: string; code: string }> {
  const code = `P0B-${suffix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const patient = await prisma.patient.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      code,
      firstName: 'Test',
      lastName: suffix,
      fullName: `Test ${suffix}`,
      createdById: ctx.adminUserId,
    },
  });
  return { patientId: patient.id, code };
}

export async function createIsolatedTenant(
  prisma: PrismaService,
  code: string,
): Promise<{ tenantId: string; branchId: string; patientId: string; accountId: string }> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Isolated ${code}`,
      code: `ISO-${code}-${Date.now()}`,
      settings: { defaultCurrency: 'EGP' },
    },
  });
  const branch = await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      name: 'Isolated Branch',
      code: 'ISO-B',
      isDefault: true,
    },
  });
  const patient = await prisma.patient.create({
    data: {
      tenantId: tenant.id,
      branchId: branch.id,
      code: `ISO-P-${Date.now()}`,
      firstName: 'Iso',
      lastName: 'Patient',
      fullName: 'Iso Patient',
    },
  });
  const account = await prisma.patientAccount.create({
    data: {
      tenantId: tenant.id,
      patientId: patient.id,
      currency: 'EGP',
    },
  });

  return {
    tenantId: tenant.id,
    branchId: branch.id,
    patientId: patient.id,
    accountId: account.id,
  };
}

export function buildLedgerPostInput(
  ctx: PmsTestContext,
  accountId: string,
  patientId: string,
  direction: 'debit' | 'credit',
  amount: string,
  suffix?: string,
) {
  return {
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    accountId,
    patientId,
    direction,
    amount,
    entryType: direction === 'debit' ? LedgerEntryType.charge : LedgerEntryType.payment,
    entryDate: new Date(),
    referenceType: 'test',
    referenceId: randomUUID(),
    description: suffix ?? `test-${direction}-${amount}`,
  } as const;
}

export async function expectReconciled(
  patientAccounts: PatientAccountService,
  tenantId: string,
  accountId: string,
): Promise<void> {
  const reconciliation = await patientAccounts.reconcileBalance(tenantId, accountId);
  expect(reconciliation.matches).toBe(true);
  expect(reconciliation.cachedBalance.equals(reconciliation.ledgerDerivedBalance)).toBe(true);
}

export {
  applyDirectionToBalance,
  toPositiveMoneyDecimal,
  Prisma,
  LedgerPostingService,
  PatientAccountService,
};
