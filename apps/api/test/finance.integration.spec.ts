import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FiscalPeriodStatus, Prisma, ProjectStatus } from '../../../packages/database/generated/server';
import { PrismaService } from '../src/database/prisma.service';
import { AccountingEngineService } from '../src/common/services/accounting-engine.service';
import { FiscalPeriodService } from '../src/modules/finance/fiscal-periods/fiscal-period.service';
import { FinancialPostingService } from '../src/modules/finance/posting/financial-posting.service';
import { DocumentNumberService } from '../src/common/services/document-number.service';
import { ACCOUNT_ROLES } from '../src/modules/finance/posting/account-roles.constants';
import { createIsolatedTenant, loadPmsTestContext, type PmsTestContext } from './pms-test.helpers';
import { createTestApp, loginAdmin, request } from './test-app';

async function seedPostableProject(
  prisma: PrismaService,
  tenantId: string,
  branchId: string,
  status: ProjectStatus = ProjectStatus.active,
) {
  return prisma.project.create({
    data: {
      tenantId,
      branchId,
      code: `PRJ-FIN-${Date.now()}-${randomUUID().slice(0, 8)}`,
      name: 'Finance Dimension Project',
      status,
    },
  });
}

async function seedActiveCostCenter(
  prisma: PrismaService,
  tenantId: string,
  branchId: string,
  projectId?: string | null,
) {
  return prisma.costCenter.create({
    data: {
      tenantId,
      branchId,
      code: `CC-FIN-${Date.now()}-${randomUUID().slice(0, 8)}`,
      name: 'Finance Dimension CC',
      projectId: projectId ?? null,
      isActive: true,
    },
  });
}

function balancedManualLines(sourceId: string) {
  return {
    mode: 'lines' as const,
    sourceModule: 'finance',
    sourceType: 'manual',
    sourceId,
    sourceEvent: 'post',
    lines: [
      { accountRole: ACCOUNT_ROLES.CASH, debit: '10.0000', credit: '0' },
      { accountRole: ACCOUNT_ROLES.REVENUE, debit: '0', credit: '10.0000' },
    ],
  };
}

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('Universal Finance (Phase 2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let financialPosting: FinancialPostingService;
  let fiscalPeriods: FiscalPeriodService;
  let ctx: PmsTestContext;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    financialPosting = app.get(FinancialPostingService);
    fiscalPeriods = app.get(FiscalPeriodService);
    ctx = await loadPmsTestContext(app);
    const auth = await loginAdmin(app);
    token = auth.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  function api() {
    return {
      post: (url: string) =>
        request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`),
    };
  }

  describe('Journal posting via FinancialPostingService', () => {
    it('accepts balanced line postings with Decimal precision', async () => {
      const sourceId = randomUUID();
      const entry = await prisma.$transaction((tx) =>
        financialPosting.post(
          {
            mode: 'lines',
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            postingDate: new Date(),
            description: 'Balanced manual entry',
            sourceModule: 'finance',
            sourceType: 'manual',
            sourceId,
            sourceEvent: 'post',
            lines: [
              { accountRole: ACCOUNT_ROLES.CASH, debit: '100.5000', credit: '0' },
              { accountRole: ACCOUNT_ROLES.REVENUE, debit: '0', credit: '100.5000' },
            ],
          },
          tx,
        ),
      );

      expect(entry.lines).toHaveLength(2);
      const debitTotal = entry.lines.reduce(
        (sum, line) => sum.add(line.debit),
        new Prisma.Decimal(0),
      );
      const creditTotal = entry.lines.reduce(
        (sum, line) => sum.add(line.credit),
        new Prisma.Decimal(0),
      );
      expect(debitTotal.toString()).toBe('100.5');
      expect(creditTotal.toString()).toBe('100.5');
      expect(entry.sourceModule).toBe('finance');
      expect(entry.sourceType).toBe('manual');
      expect(entry.sourceId).toBe(sourceId);
    });

    it('rejects unbalanced journals', async () => {
      await expect(
        prisma.$transaction((tx) =>
          financialPosting.post(
            {
              mode: 'lines',
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              postingDate: new Date(),
              description: 'Unbalanced',
              sourceModule: 'finance',
              sourceType: 'manual',
              sourceId: randomUUID(),
              sourceEvent: 'post',
              lines: [
                { accountRole: ACCOUNT_ROLES.CASH, debit: '100.0000', credit: '0' },
                { accountRole: ACCOUNT_ROLES.REVENUE, debit: '0', credit: '90.0000' },
              ],
            },
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects zero-amount lines', async () => {
      await expect(
        prisma.$transaction((tx) =>
          financialPosting.post(
            {
              mode: 'lines',
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              postingDate: new Date(),
              description: 'Zero line',
              sourceModule: 'finance',
              sourceType: 'manual',
              sourceId: randomUUID(),
              sourceEvent: 'post',
              lines: [
                { accountRole: ACCOUNT_ROLES.CASH, debit: '0', credit: '0' },
                { accountRole: ACCOUNT_ROLES.REVENUE, debit: '0', credit: '0' },
              ],
            },
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('validates branch belongs to tenant', async () => {
      await expect(
        prisma.$transaction((tx) =>
          financialPosting.post(
            {
              mode: 'lines',
              tenantId: ctx.tenantId,
              branchId: randomUUID(),
              postingDate: new Date(),
              description: 'Bad branch',
              sourceModule: 'finance',
              sourceType: 'manual',
              sourceId: randomUUID(),
              sourceEvent: 'post',
              lines: [
                { accountRole: ACCOUNT_ROLES.CASH, debit: '10.0000', credit: '0' },
                { accountRole: ACCOUNT_ROLES.REVENUE, debit: '0', credit: '10.0000' },
              ],
            },
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Rule-based posting', () => {
    it('resolves accounts by role without hardcoded COA codes in posting path', async () => {
      const sourceId = randomUUID();
      const entry = await prisma.$transaction((tx) =>
        financialPosting.post(
          {
            mode: 'rule',
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            postingDate: new Date(),
            description: 'Sales invoice posting',
            sourceModule: 'sales',
            sourceType: 'invoice',
            sourceId,
            sourceEvent: 'post',
            amounts: { total: '250.0000', cogs: '0' },
          },
          tx,
        ),
      );

      const roles = entry.lines.map((line) => line.account.code);
      expect(roles).toContain('1100');
      expect(roles).toContain('4000');
      expect(entry.referenceType).toBe('invoice');
      expect(entry.referenceId).toBe(sourceId);
    });

    it('preserves source references and idempotency', async () => {
      const sourceId = randomUUID();
      const input = {
        mode: 'rule' as const,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        postingDate: new Date(),
        description: 'Idempotent sales payment',
        sourceModule: 'sales',
        sourceType: 'payment',
        sourceId,
        sourceEvent: 'post',
        amounts: { amount: '75.2500' },
      };

      const first = await prisma.$transaction((tx) => financialPosting.post(input, tx));
      const second = await prisma.$transaction((tx) => financialPosting.post(input, tx));

      expect(second.id).toBe(first.id);
      const count = await prisma.journalEntry.count({
        where: {
          tenantId: ctx.tenantId,
          sourceModule: 'sales',
          sourceType: 'payment',
          sourceId,
          sourceEvent: 'post',
        },
      });
      expect(count).toBe(1);
    });
  });

  describe('Fiscal period enforcement', () => {
    it('accepts postings in open periods', async () => {
      const period = await fiscalPeriods.seedCurrentYearPeriod(ctx.tenantId);
      expect(period.status).toBe(FiscalPeriodStatus.open);

      const entry = await prisma.$transaction((tx) =>
        financialPosting.post(
          {
            mode: 'lines',
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            postingDate: new Date(),
            description: 'Open period posting',
            sourceModule: 'finance',
            sourceType: 'manual',
            sourceId: randomUUID(),
            sourceEvent: 'open-period',
            lines: [
              { accountRole: ACCOUNT_ROLES.CASH, debit: '15.0000', credit: '0' },
              { accountRole: ACCOUNT_ROLES.REVENUE, debit: '0', credit: '15.0000' },
            ],
          },
          tx,
        ),
      );
      expect(entry.fiscalPeriodId).toBeTruthy();
    });

    it('rejects closed and locked periods', async () => {
      const closed = await prisma.fiscalPeriod.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'Closed Test Period',
          startDate: new Date('2020-01-01'),
          endDate: new Date('2020-12-31'),
          status: FiscalPeriodStatus.closed,
          isClosed: true,
        },
      });

      await expect(
        fiscalPeriods.assertPostingAllowed(ctx.tenantId, new Date('2020-06-15')),
      ).rejects.toBeInstanceOf(BadRequestException);

      await prisma.fiscalPeriod.update({
        where: { id: closed.id },
        data: { status: FiscalPeriodStatus.locked },
      });

      await expect(
        fiscalPeriods.assertPostingAllowed(ctx.tenantId, new Date('2020-06-15')),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects posting dates outside any fiscal period', async () => {
      await expect(
        fiscalPeriods.assertPostingAllowed(ctx.tenantId, new Date('2099-06-15')),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Tenant isolation', () => {
    it('blocks cross-tenant fiscal period access and posting', async () => {
      const isolated = await createIsolatedTenant(prisma, 'finance');
      const isolatedPeriod = await prisma.fiscalPeriod.create({
        data: {
          tenantId: isolated.tenantId,
          name: 'Isolated FY',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
          status: FiscalPeriodStatus.open,
        },
      });

      await expect(
        fiscalPeriods.findById(ctx.tenantId, isolatedPeriod.id),
      ).rejects.toBeInstanceOf(NotFoundException);

      await expect(
        prisma.$transaction((tx) =>
          financialPosting.post(
            {
              mode: 'lines',
              tenantId: ctx.tenantId,
              branchId: isolated.branchId,
              postingDate: new Date(),
              description: 'Cross tenant branch',
              sourceModule: 'finance',
              sourceType: 'manual',
              sourceId: randomUUID(),
              sourceEvent: 'cross-tenant',
              lines: [
                { accountRole: ACCOUNT_ROLES.CASH, debit: '10.0000', credit: '0' },
                { accountRole: ACCOUNT_ROLES.REVENUE, debit: '0', credit: '10.0000' },
              ],
            },
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Concurrency and rollback', () => {
    it('handles concurrent postings without duplicate idempotent journals', async () => {
      const sourceId = randomUUID();
      const input = {
        mode: 'rule' as const,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        postingDate: new Date(),
        description: 'Concurrent sales invoice',
        sourceModule: 'sales',
        sourceType: 'invoice',
        sourceId,
        sourceEvent: 'post',
        amounts: { total: '120.0000', cogs: '0' },
      };

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          prisma.$transaction((tx) => financialPosting.post(input, tx)),
        ),
      );

      const uniqueIds = new Set(results.map((entry) => entry.id));
      expect(uniqueIds.size).toBe(1);
    });

    it('rolls back journal creation on failure after validation', async () => {
      const beforeCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const documentNumbers = app.get(DocumentNumberService);
      const spy = jest
        .spyOn(documentNumbers, 'nextNumber')
        .mockRejectedValueOnce(new Error('forced journal failure'));

      await expect(
        prisma.$transaction((tx) =>
          financialPosting.post(
            {
              mode: 'lines',
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              postingDate: new Date(),
              description: 'Rollback test',
              sourceModule: 'finance',
              sourceType: 'manual',
              sourceId: randomUUID(),
              sourceEvent: 'rollback',
              lines: [
                { accountRole: ACCOUNT_ROLES.CASH, debit: '20.0000', credit: '0' },
                { accountRole: ACCOUNT_ROLES.REVENUE, debit: '0', credit: '20.0000' },
              ],
            },
            tx,
          ),
        ),
      ).rejects.toThrow('forced journal failure');

      spy.mockRestore();
      const afterCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(afterCount).toBe(beforeCount);
    });
  });

  describe('Finance HTTP endpoints', () => {
    it('exposes posting rules and executes rule-based posting via API', async () => {
      const rules = await request(app.getHttpServer())
        .get('/api/v1/finance/posting-rules')
        .set('Authorization', `Bearer ${token}`);
      expect(rules.status).toBe(200);
      expect(rules.body.data.some((rule: { sourceModule: string }) => rule.sourceModule === 'sales')).toBe(true);

      const res = await api()
        .post('/api/v1/finance/postings/rule')
        .send({
          branchId: ctx.branchId,
          postingDate: new Date().toISOString(),
          description: 'API rule posting',
          sourceModule: 'sales',
          sourceType: 'payment',
          sourceId: randomUUID(),
          sourceEvent: 'post',
          amounts: { amount: '50.0000' },
        });
      expect([200, 201]).toContain(res.status);
      expect(res.body.data.lines).toHaveLength(2);
    });
  });

  describe('Phase 2.1 fiscal period locking', () => {
    it('rejects full posting path into a closed period', async () => {
      await prisma.fiscalPeriod.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'Closed Full Path Period',
          startDate: new Date('2019-01-01'),
          endDate: new Date('2019-12-31'),
          status: FiscalPeriodStatus.closed,
          isClosed: true,
        },
      });

      const beforeCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const sourceId = randomUUID();

      await expect(
        prisma.$transaction((tx) =>
          financialPosting.post(
            {
              mode: 'lines',
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              postingDate: new Date('2019-06-15'),
              description: 'Closed period full path',
              sourceModule: 'finance',
              sourceType: 'manual',
              sourceId,
              sourceEvent: 'closed-full-path',
              lines: [
                { accountRole: ACCOUNT_ROLES.CASH, debit: '10.0000', credit: '0' },
                { accountRole: ACCOUNT_ROLES.REVENUE, debit: '0', credit: '10.0000' },
              ],
            },
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      const afterCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(afterCount).toBe(beforeCount);
      expect(await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId, sourceId } })).toBe(0);
    });

    it('rejects full posting path into a locked period', async () => {
      await prisma.fiscalPeriod.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'Locked Full Path Period',
          startDate: new Date('2018-01-01'),
          endDate: new Date('2018-12-31'),
          status: FiscalPeriodStatus.locked,
          isClosed: true,
        },
      });

      const beforeCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const sourceId = randomUUID();

      await expect(
        prisma.$transaction((tx) =>
          financialPosting.post(
            {
              mode: 'lines',
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              postingDate: new Date('2018-06-15'),
              description: 'Locked period full path',
              sourceModule: 'finance',
              sourceType: 'manual',
              sourceId,
              sourceEvent: 'locked-full-path',
              lines: [
                { accountRole: ACCOUNT_ROLES.CASH, debit: '12.0000', credit: '0' },
                { accountRole: ACCOUNT_ROLES.REVENUE, debit: '0', credit: '12.0000' },
              ],
            },
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      const afterCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(afterCount).toBe(beforeCount);
      expect(await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId, sourceId } })).toBe(0);
    });

    it('rejects cross-tenant explicit accountId on lines posting', async () => {
      const isolated = await createIsolatedTenant(prisma, 'acct-cross');
      const tenantBAccount = await prisma.account.create({
        data: {
          tenantId: isolated.tenantId,
          code: `ISO-GL-${Date.now()}`,
          name: 'Tenant B Cash',
          type: 'asset',
          isPosting: true,
        },
      });

      const beforeCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const sourceId = randomUUID();

      await expect(
        prisma.$transaction((tx) =>
          financialPosting.post(
            {
              mode: 'lines',
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              postingDate: new Date(),
              description: 'Cross-tenant account',
              sourceModule: 'finance',
              sourceType: 'manual',
              sourceId,
              sourceEvent: 'cross-tenant-account',
              lines: [
                { accountId: tenantBAccount.id, debit: '10.0000', credit: '0' },
                { accountRole: ACCOUNT_ROLES.REVENUE, debit: '0', credit: '10.0000' },
              ],
            },
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      const afterCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(afterCount).toBe(beforeCount);
      expect(await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId, sourceId } })).toBe(0);
    });

    it('rejects rule-based posting when a required role mapping is missing', async () => {
      const mapping = await prisma.accountRoleMapping.findFirst({
        where: { tenantId: ctx.tenantId, role: ACCOUNT_ROLES.CASH },
      });
      expect(mapping).toBeTruthy();

      await prisma.accountRoleMapping.delete({ where: { id: mapping!.id } });

      const beforeCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const sourceId = randomUUID();

      try {
        await expect(
          prisma.$transaction((tx) =>
            financialPosting.post(
              {
                mode: 'rule',
                tenantId: ctx.tenantId,
                branchId: ctx.branchId,
                postingDate: new Date(),
                description: 'Missing role mapping',
                sourceModule: 'sales',
                sourceType: 'payment',
                sourceId,
                sourceEvent: 'post',
                amounts: { amount: '33.3300' },
              },
              tx,
            ),
          ),
        ).rejects.toBeInstanceOf(NotFoundException);

        const afterCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
        expect(afterCount).toBe(beforeCount);
        expect(await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId, sourceId } })).toBe(0);
      } finally {
        await prisma.accountRoleMapping.upsert({
          where: { tenantId_role: { tenantId: ctx.tenantId, role: ACCOUNT_ROLES.CASH } },
          update: { accountId: mapping!.accountId },
          create: {
            tenantId: ctx.tenantId,
            role: ACCOUNT_ROLES.CASH,
            accountId: mapping!.accountId,
          },
        });
      }
    });

    it('serializes in-flight posting against concurrent closePeriod', async () => {
      const concurrencyYear = 2060 + Math.floor(Math.random() * 100);
      const postingDate = new Date(`${concurrencyYear}-06-15`);
      const period = await prisma.fiscalPeriod.create({
        data: {
          tenantId: ctx.tenantId,
          name: `Concurrency FY ${concurrencyYear}-${Date.now()}`,
          startDate: new Date(`${concurrencyYear}-01-01`),
          endDate: new Date(`${concurrencyYear}-12-31`),
          status: FiscalPeriodStatus.open,
        },
      });

      const lockAcquired = createDeferred<void>();
      const releasePosting = createDeferred<void>();
      let closeFinishedAt = 0;
      let postingFinishedAt = 0;
      const sourceId = randomUUID();

      const postingPromise = prisma.$transaction(async (tx) => {
        await fiscalPeriods.assertPostingAllowed(ctx.tenantId, postingDate, tx);
        lockAcquired.resolve();
        await releasePosting.promise;

        const entry = await financialPosting.post(
          {
            mode: 'lines',
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            postingDate,
            description: 'Concurrent posting with row lock held',
            sourceModule: 'finance',
            sourceType: 'manual',
            sourceId,
            sourceEvent: 'concurrency-lock',
            lines: [
              { accountRole: ACCOUNT_ROLES.CASH, debit: '25.0000', credit: '0' },
              { accountRole: ACCOUNT_ROLES.REVENUE, debit: '0', credit: '25.0000' },
            ],
          },
          tx,
        );
        postingFinishedAt = Date.now();
        return entry;
      });

      const closePromise = (async () => {
        await lockAcquired.promise;
        await fiscalPeriods.closePeriod(ctx.tenantId, period.id);
        closeFinishedAt = Date.now();
      })();

      await sleep(100);
      expect(closeFinishedAt).toBe(0);

      releasePosting.resolve();
      const [entry] = await Promise.all([postingPromise, closePromise]);

      expect(entry.fiscalPeriodId).toBe(period.id);
      expect(postingFinishedAt).toBeGreaterThan(0);
      expect(closeFinishedAt).toBeGreaterThan(postingFinishedAt);

      const refreshed = await prisma.fiscalPeriod.findUnique({ where: { id: period.id } });
      expect(refreshed?.status).toBe(FiscalPeriodStatus.closed);

      const journalCount = await prisma.journalEntry.count({
        where: { tenantId: ctx.tenantId, sourceId, fiscalPeriodId: period.id },
      });
      expect(journalCount).toBe(1);
    });

    it('rejects posting when the period is already closed before lock acquisition', async () => {
      const postingDate = new Date('2035-06-15');
      const period = await prisma.fiscalPeriod.create({
        data: {
          tenantId: ctx.tenantId,
          name: `Pre-closed FY 2035-${Date.now()}`,
          startDate: new Date('2035-01-01'),
          endDate: new Date('2035-12-31'),
          status: FiscalPeriodStatus.open,
        },
      });

      await fiscalPeriods.closePeriod(ctx.tenantId, period.id);

      const beforeCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const sourceId = randomUUID();

      await expect(
        prisma.$transaction((tx) =>
          financialPosting.post(
            {
              mode: 'lines',
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              postingDate,
              description: 'Post into pre-closed period',
              sourceModule: 'finance',
              sourceType: 'manual',
              sourceId,
              sourceEvent: 'pre-closed',
              lines: [
                { accountRole: ACCOUNT_ROLES.CASH, debit: '5.0000', credit: '0' },
                { accountRole: ACCOUNT_ROLES.REVENUE, debit: '0', credit: '5.0000' },
              ],
            },
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      const afterCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(afterCount).toBe(beforeCount);
      expect(await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId, sourceId } })).toBe(0);
    });
  });

  describe('Phase 8.1 finance dimensions', () => {
    it('persists validated project and cost center on journal lines', async () => {
      const project = await seedPostableProject(prisma, ctx.tenantId, ctx.branchId);
      const costCenter = await seedActiveCostCenter(
        prisma,
        ctx.tenantId,
        ctx.branchId,
        project.id,
      );
      const sourceId = randomUUID();

      const entry = await prisma.$transaction((tx) =>
        financialPosting.post(
          {
            ...balancedManualLines(sourceId),
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            postingDate: new Date(),
            description: 'Dimension posting',
            dimensions: {
              projectId: project.id,
              costCenterId: costCenter.id,
            },
          },
          tx,
        ),
      );

      expect(entry.lines).toHaveLength(2);
      for (const line of entry.lines) {
        expect(line.projectId).toBe(project.id);
        expect(line.costCenterId).toBe(costCenter.id);
      }
      expect(entry.lines[0]?.project?.code).toBe(project.code);
      expect(entry.lines[0]?.costCenter?.code).toBe(costCenter.code);
    });

    it('allows shared cost center without project dimension', async () => {
      const project = await seedPostableProject(prisma, ctx.tenantId, ctx.branchId);
      const sharedCostCenter = await seedActiveCostCenter(
        prisma,
        ctx.tenantId,
        ctx.branchId,
        null,
      );
      const sourceId = randomUUID();

      const entry = await prisma.$transaction((tx) =>
        financialPosting.post(
          {
            ...balancedManualLines(sourceId),
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            postingDate: new Date(),
            description: 'Shared cost center posting',
            dimensions: {
              projectId: project.id,
              costCenterId: sharedCostCenter.id,
            },
          },
          tx,
        ),
      );

      expect(entry.lines[0]?.projectId).toBe(project.id);
      expect(entry.lines[0]?.costCenterId).toBe(sharedCostCenter.id);
    });

    it('rejects unknown project with 404 and no journal row', async () => {
      const beforeCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const sourceId = randomUUID();

      await expect(
        prisma.$transaction((tx) =>
          financialPosting.post(
            {
              ...balancedManualLines(sourceId),
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              postingDate: new Date(),
              description: 'Bad project',
              dimensions: { projectId: randomUUID() },
            },
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      const afterCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(afterCount).toBe(beforeCount);
    });

    it('rejects archived and cancelled projects', async () => {
      const archived = await prisma.project.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          code: `PRJ-ARC-${Date.now()}`,
          name: 'Archived',
          status: ProjectStatus.archived,
          deletedAt: new Date(),
        },
      });
      const cancelled = await seedPostableProject(
        prisma,
        ctx.tenantId,
        ctx.branchId,
        ProjectStatus.cancelled,
      );

      for (const project of [archived, cancelled]) {
        await expect(
          prisma.$transaction((tx) =>
            financialPosting.post(
              {
                ...balancedManualLines(randomUUID()),
                tenantId: ctx.tenantId,
                branchId: ctx.branchId,
                postingDate: new Date(),
                description: 'Bad project status',
                dimensions: { projectId: project.id },
              },
              tx,
            ),
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    });

    it('rejects cross-tenant project reference', async () => {
      const isolated = await createIsolatedTenant(prisma, 'fin-dim');
      const foreignProject = await seedPostableProject(
        prisma,
        isolated.tenantId,
        isolated.branchId,
      );

      await expect(
        prisma.$transaction((tx) =>
          financialPosting.post(
            {
              ...balancedManualLines(randomUUID()),
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              postingDate: new Date(),
              description: 'Cross tenant project',
              dimensions: { projectId: foreignProject.id },
            },
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects cost center linked to a different project', async () => {
      const projectA = await seedPostableProject(prisma, ctx.tenantId, ctx.branchId);
      const projectB = await seedPostableProject(prisma, ctx.tenantId, ctx.branchId);
      const costCenterA = await seedActiveCostCenter(
        prisma,
        ctx.tenantId,
        ctx.branchId,
        projectA.id,
      );

      await expect(
        prisma.$transaction((tx) =>
          financialPosting.post(
            {
              ...balancedManualLines(randomUUID()),
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              postingDate: new Date(),
              description: 'Mismatched project and cost center',
              dimensions: {
                projectId: projectB.id,
                costCenterId: costCenterA.id,
              },
            },
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects project-scoped cost center without project dimension', async () => {
      const project = await seedPostableProject(prisma, ctx.tenantId, ctx.branchId);
      const scopedCostCenter = await seedActiveCostCenter(
        prisma,
        ctx.tenantId,
        ctx.branchId,
        project.id,
      );

      await expect(
        prisma.$transaction((tx) =>
          financialPosting.post(
            {
              ...balancedManualLines(randomUUID()),
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              postingDate: new Date(),
              description: 'Missing project dimension',
              dimensions: { costCenterId: scopedCostCenter.id },
            },
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects project branch mismatch', async () => {
      const otherBranch = await prisma.branch.create({
        data: {
          tenantId: ctx.tenantId,
          code: `BR-FIN-${Date.now()}`,
          name: 'Other Branch',
          isActive: true,
        },
      });
      const project = await seedPostableProject(prisma, ctx.tenantId, otherBranch.id);

      await expect(
        prisma.$transaction((tx) =>
          financialPosting.post(
            {
              ...balancedManualLines(randomUUID()),
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              postingDate: new Date(),
              description: 'Branch mismatch',
              dimensions: { projectId: project.id },
            },
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('posts dimensions via Finance REST API', async () => {
      const project = await seedPostableProject(prisma, ctx.tenantId, ctx.branchId);
      const costCenter = await seedActiveCostCenter(
        prisma,
        ctx.tenantId,
        ctx.branchId,
        project.id,
      );

      const res = await api()
        .post('/api/v1/finance/postings/lines')
        .send({
          branchId: ctx.branchId,
          postingDate: new Date().toISOString(),
          description: 'API dimension posting',
          sourceModule: 'finance',
          sourceType: 'manual',
          sourceId: randomUUID(),
          sourceEvent: 'api-dimensions',
          dimensions: {
            projectId: project.id,
            costCenterId: costCenter.id,
          },
          lines: [
            { accountRole: ACCOUNT_ROLES.CASH, debit: '25.0000', credit: '0' },
            { accountRole: ACCOUNT_ROLES.REVENUE, debit: '0', credit: '25.0000' },
          ],
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.data.lines[0].projectId).toBe(project.id);
      expect(res.body.data.lines[0].costCenterId).toBe(costCenter.id);
    });

    it('legacy AccountingEngineService still posts without dimensions', async () => {
      const accounting = app.get(AccountingEngineService);
      const beforeLines = await prisma.journalLine.count({
        where: { entry: { tenantId: ctx.tenantId } },
      });

      const entry = await prisma.$transaction((tx) =>
        accounting.createEntry(
          ctx.tenantId,
          ctx.branchId,
          'Legacy posting without dimensions',
          [
            { accountCode: '1000', debit: 15, credit: 0 },
            { accountCode: '4000', debit: 0, credit: 15 },
          ],
          'legacy',
          randomUUID(),
          tx,
        ),
      );

      const afterLines = await prisma.journalLine.findMany({
        where: { entryId: entry.id },
      });
      expect(afterLines.length).toBeGreaterThanOrEqual(2);
      for (const line of afterLines) {
        expect(line.projectId).toBeNull();
        expect(line.costCenterId).toBeNull();
      }
      expect(await prisma.journalLine.count({
        where: { entry: { tenantId: ctx.tenantId } },
      })).toBeGreaterThanOrEqual(beforeLines + 2);
    });
  });
});
