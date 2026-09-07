import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  LedgerEntryType,
  Prisma,
} from '../../../packages/database/generated/server';
import { PrismaService } from '../src/database/prisma.service';
import { LedgerPostingService } from '../src/modules/pms/ledger/ledger-posting.service';
import { PatientAccountService } from '../src/modules/pms/ledger/patient-account.service';
import {
  applyDirectionToBalance,
  buildLedgerPostInput,
  createIsolatedTenant,
  createTestPatient,
  expectReconciled,
  loadPmsTestContext,
  toPositiveMoneyDecimal,
  type PmsTestContext,
} from './pms-test.helpers';
import { createTestApp } from './test-app';

describe('PMS financial core (Phase 1b)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let patientAccounts: PatientAccountService;
  let ledgerPosting: LedgerPostingService;
  let ctx: PmsTestContext;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    patientAccounts = app.get(PatientAccountService);
    ledgerPosting = app.get(LedgerPostingService);
    ctx = await loadPmsTestContext(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('PatientAccountService', () => {
    it('creates and retrieves an account for a patient', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'AccountCreate');

      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);
      expect(account.tenantId).toBe(ctx.tenantId);
      expect(account.patientId).toBe(patientId);
      expect(new Prisma.Decimal(account.cachedBalance).toString()).toBe('0');

      const fetched = await patientAccounts.getAccountForPatient(ctx.tenantId, patientId);
      expect(fetched.id).toBe(account.id);
    });

    it('prevents duplicate accounts for the same patient', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'AccountDup');

      const [first, second] = await Promise.all([
        patientAccounts.getOrCreateAccount(ctx.tenantId, patientId),
        patientAccounts.getOrCreateAccount(ctx.tenantId, patientId),
      ]);

      expect(first.id).toBe(second.id);
    });

    it('rejects missing patients', async () => {
      await expect(
        patientAccounts.getOrCreateAccount(ctx.tenantId, randomUUID()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects wrong tenant on account lookup', async () => {
      const isolated = await createIsolatedTenant(prisma, 'lookup');
      await expect(
        patientAccounts.getAccountById(ctx.tenantId, isolated.accountId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns cached balance safely', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'BalanceRead');
      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      await prisma.$transaction((tx) =>
        ledgerPosting.postEntry(
          buildLedgerPostInput(ctx, account.id, patientId, 'debit', '25.5000'),
          tx,
        ),
      );

      const balance = await patientAccounts.getBalance(ctx.tenantId, account.id);
      expect(balance.toString()).toBe('25.5');
    });
  });

  describe('LedgerPostingService', () => {
    it('posts debit and credit entries with correct balance semantics', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'DebitCredit');
      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      await prisma.$transaction((tx) =>
        ledgerPosting.postEntry(
          buildLedgerPostInput(ctx, account.id, patientId, 'debit', '100.0000'),
          tx,
        ),
      );

      await prisma.$transaction((tx) =>
        ledgerPosting.postEntry(
          buildLedgerPostInput(ctx, account.id, patientId, 'credit', '30.0000'),
          tx,
        ),
      );

      const reconciliation = await patientAccounts.reconcileBalance(ctx.tenantId, account.id);
      expect(reconciliation.ledgerDerivedBalance.toString()).toBe('70');
      expect(reconciliation.cachedBalance.toString()).toBe('70');
      expect(reconciliation.matches).toBe(true);
    });

    it('handles multiple sequential postings', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'Sequential');
      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      for (const amount of ['10', '5.5', '2.25']) {
        await prisma.$transaction((tx) =>
          ledgerPosting.postEntry(
            buildLedgerPostInput(ctx, account.id, patientId, 'debit', amount),
            tx,
          ),
        );
      }

      await expectReconciled(patientAccounts, ctx.tenantId, account.id);
      const balance = await patientAccounts.getBalance(ctx.tenantId, account.id);
      expect(balance.toString()).toBe('17.75');
    });

    it('rejects zero amounts before touching the database transaction', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'ZeroAmount');
      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      expect(() => toPositiveMoneyDecimal('0')).toThrow(BadRequestException);

      await expect(
        prisma.$transaction((tx) =>
          ledgerPosting.postEntry(
            buildLedgerPostInput(ctx, account.id, patientId, 'debit', '0'),
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      const after = await patientAccounts.reconcileBalance(ctx.tenantId, account.id);
      expect(after.entryCount).toBe(0);
    });

    it('rejects negative amounts', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'NegativeAmount');
      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      await expect(
        prisma.$transaction((tx) =>
          ledgerPosting.postEntry(
            buildLedgerPostInput(ctx, account.id, patientId, 'debit', '-5'),
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('preserves decimal precision without JavaScript float errors', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'DecimalPrecision');
      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      await prisma.$transaction((tx) =>
        ledgerPosting.postEntry(
          buildLedgerPostInput(ctx, account.id, patientId, 'debit', '0.1000'),
          tx,
        ),
      );
      await prisma.$transaction((tx) =>
        ledgerPosting.postEntry(
          buildLedgerPostInput(ctx, account.id, patientId, 'debit', '0.2000'),
          tx,
        ),
      );

      const balance = await patientAccounts.getBalance(ctx.tenantId, account.id);
      expect(balance.toString()).toBe('0.3');
      await expectReconciled(patientAccounts, ctx.tenantId, account.id);
    });

    it('supports large decimal amounts at 4-digit scale', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'LargeAmount');
      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      await prisma.$transaction((tx) =>
        ledgerPosting.postEntry(
          buildLedgerPostInput(ctx, account.id, patientId, 'debit', '999999999.9999'),
          tx,
        ),
      );

      const balance = await patientAccounts.getBalance(ctx.tenantId, account.id);
      expect(balance.toFixed(4)).toBe('999999999.9999');
    });

    it('rejects append-only mutation attempts', () => {
      expect(() => ledgerPosting.updateLedgerEntry()).toThrow(BadRequestException);
      expect(() => ledgerPosting.deleteLedgerEntry()).toThrow(BadRequestException);
    });

    it('stores runningBalance on each ledger entry', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'RunningBalance');
      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      const first = await prisma.$transaction((tx) =>
        ledgerPosting.postEntry(
          buildLedgerPostInput(ctx, account.id, patientId, 'debit', '10.0000'),
          tx,
        ),
      );
      const second = await prisma.$transaction((tx) =>
        ledgerPosting.postEntry(
          buildLedgerPostInput(ctx, account.id, patientId, 'credit', '4.0000'),
          tx,
        ),
      );

      expect(new Prisma.Decimal(first.entry.runningBalance).toString()).toBe('10');
      expect(new Prisma.Decimal(second.entry.runningBalance).toString()).toBe('6');
    });
  });

  describe('Atomicity', () => {
    it('rolls back ledger entry and cachedBalance together on failure', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'AtomicRollback');
      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      await expect(
        prisma.$transaction(async (tx) => {
          await ledgerPosting.postEntry(
            buildLedgerPostInput(ctx, account.id, patientId, 'debit', '50.0000'),
            tx,
          );
          throw new Error('forced rollback');
        }),
      ).rejects.toThrow('forced rollback');

      const after = await patientAccounts.reconcileBalance(ctx.tenantId, account.id);
      expect(after.entryCount).toBe(0);
      expect(after.cachedBalance.toString()).toBe('0');
      expect(after.matches).toBe(true);
    });

    it('does not persist partial writes when scope validation fails', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'ScopeFail');
      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);
      const otherPatient = await createTestPatient(prisma, ctx, 'ScopeFailOther');

      await expect(
        prisma.$transaction((tx) =>
          ledgerPosting.postEntry(
            buildLedgerPostInput(ctx, account.id, otherPatient.patientId, 'debit', '10.0000'),
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const after = await patientAccounts.reconcileBalance(ctx.tenantId, account.id);
      expect(after.entryCount).toBe(0);
      expect(after.cachedBalance.toString()).toBe('0');
    });
  });

  describe('Concurrency', () => {
    it('handles 10 concurrent debits without corrupting balance', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'ConcDebit');
      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      await Promise.all(
        Array.from({ length: 10 }, () =>
          prisma.$transaction((tx) =>
            ledgerPosting.postEntry(
              buildLedgerPostInput(ctx, account.id, patientId, 'debit', '1.0000'),
              tx,
            ),
          ),
        ),
      );

      await expectReconciled(patientAccounts, ctx.tenantId, account.id);
      const balance = await patientAccounts.getBalance(ctx.tenantId, account.id);
      expect(balance.toString()).toBe('10');
    });

    it('handles 10 concurrent credits against a funded balance', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'ConcCredit');
      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      await prisma.$transaction((tx) =>
        ledgerPosting.postEntry(
          buildLedgerPostInput(ctx, account.id, patientId, 'debit', '10.0000'),
          tx,
        ),
      );

      await Promise.all(
        Array.from({ length: 10 }, () =>
          prisma.$transaction((tx) =>
            ledgerPosting.postEntry(
              buildLedgerPostInput(ctx, account.id, patientId, 'credit', '1.0000'),
              tx,
            ),
          ),
        ),
      );

      await expectReconciled(patientAccounts, ctx.tenantId, account.id);
      const balance = await patientAccounts.getBalance(ctx.tenantId, account.id);
      expect(balance.toString()).toBe('0');
    });

    it('handles mixed concurrent debits and credits', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'ConcMixed');
      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      await prisma.$transaction((tx) =>
        ledgerPosting.postEntry(
          buildLedgerPostInput(ctx, account.id, patientId, 'debit', '100.0000'),
          tx,
        ),
      );

      const operations = [
        ...Array.from({ length: 10 }, () =>
          prisma.$transaction((tx) =>
            ledgerPosting.postEntry(
              buildLedgerPostInput(ctx, account.id, patientId, 'debit', '5.0000'),
              tx,
            ),
          ),
        ),
        ...Array.from({ length: 10 }, () =>
          prisma.$transaction((tx) =>
            ledgerPosting.postEntry(
              buildLedgerPostInput(ctx, account.id, patientId, 'credit', '3.0000'),
              tx,
            ),
          ),
        ),
      ];

      await Promise.all(operations);

      await expectReconciled(patientAccounts, ctx.tenantId, account.id);
      const balance = await patientAccounts.getBalance(ctx.tenantId, account.id);
      expect(balance.toString()).toBe('120');
    });
  });

  describe('Tenant isolation', () => {
    it('rejects cross-tenant account posting', async () => {
      const isolated = await createIsolatedTenant(prisma, 'CrossPost');
      const { patientId } = await createTestPatient(prisma, ctx, 'CrossPostLocal');
      const localAccount = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      await expect(
        prisma.$transaction((tx) =>
          ledgerPosting.postEntry(
            {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              accountId: isolated.accountId,
              patientId: localAccount.patientId,
              direction: 'debit',
              amount: '10.0000',
              entryType: LedgerEntryType.charge,
              entryDate: new Date(),
              referenceType: 'test',
              referenceId: randomUUID(),
            },
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects posting with a patient from another tenant', async () => {
      const isolated = await createIsolatedTenant(prisma, 'CrossPatient');
      const { patientId } = await createTestPatient(prisma, ctx, 'CrossPatientLocal');
      const localAccount = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      await expect(
        prisma.$transaction((tx) =>
          ledgerPosting.postEntry(
            buildLedgerPostInput(ctx, localAccount.id, isolated.patientId, 'debit', '10.0000'),
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects tenant A operating on tenant B account via account service', async () => {
      const isolated = await createIsolatedTenant(prisma, 'CrossAccountRead');
      await expect(
        patientAccounts.getBalance(ctx.tenantId, isolated.accountId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('Money utilities', () => {
    it('applies direction semantics without float arithmetic', () => {
      const balance = new Prisma.Decimal('0.1');
      const next = applyDirectionToBalance(balance, new Prisma.Decimal('0.2'), 'debit');
      expect(next.toString()).toBe('0.3');
    });

    it('validates positive decimal input', () => {
      expect(toPositiveMoneyDecimal('12.3400').toString()).toBe('12.34');
      expect(() => toPositiveMoneyDecimal('0')).toThrow(BadRequestException);
      expect(() => toPositiveMoneyDecimal('-1')).toThrow(BadRequestException);
    });
  });

  describe('Reconciliation preparation', () => {
    it('detects matching cached and ledger-derived balances', async () => {
      const { patientId } = await createTestPatient(prisma, ctx, 'Reconcile');
      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      await prisma.$transaction((tx) =>
        ledgerPosting.postEntry(
          buildLedgerPostInput(ctx, account.id, patientId, 'debit', '42.4200'),
          tx,
        ),
      );
      await prisma.$transaction((tx) =>
        ledgerPosting.postEntry(
          buildLedgerPostInput(ctx, account.id, patientId, 'credit', '2.4200'),
          tx,
        ),
      );

      const reconciliation = await patientAccounts.reconcileBalance(ctx.tenantId, account.id);
      expect(reconciliation.matches).toBe(true);
      expect(reconciliation.entryCount).toBe(2);
      expect(reconciliation.ledgerDerivedBalance.toString()).toBe('40');
    });
  });
});
