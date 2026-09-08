import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import {
  ConstructionBoqStatus,
  ConstructionContractDirection,
  ConstructionContractPricingModel,
  ConstructionContractStatus,
  ConstructionCostCategory,
  ConstructionSubledgerPartyType,
  ConstructionVariationType,
  PartyRoleType,
  PartyType,
} from '../../../packages/database/generated/server';
import { LicenseService } from '../src/modules/license/license.service';
import { PrismaService } from '../src/database/prisma.service';
import { defaultModuleEntries } from '../src/modules/license/verification/license-verifier.interface';
import {
  activateConstructionLicense,
  createPartyWithRole,
  createUniversalProject,
  enableConstructionProfile,
  featuresWithConstruction,
  loadConstructionTestContext,
  modulesWithConstruction,
} from './construction-test.helpers';
import { signTestActivationForTenant } from './license-test.helpers';
import { createIsolatedTenant } from './pms-test.helpers';
import { createTestApp, request } from './test-app';

describe('Construction reporting (Phase 9.9)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let licenseService: LicenseService;
  let ctx: Awaited<ReturnType<typeof loadConstructionTestContext>>;
  let adminUserId: string;
  let projectId: string;
  let costCenterId: string;
  let customerPartyId: string;
  let contractId: string;
  let boqId: string;
  let boqItemId: string;
  let periodCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    licenseService = app.get(LicenseService);
    ctx = await loadConstructionTestContext(app);
    await activateConstructionLicense(prisma, ctx.tenantId, licenseService);

    const admin = await prisma.user.findFirst({
      where: { email: 'admin@fratelanza.local' },
    });
    adminUserId = admin!.id;

    const project = await createUniversalProject(app, ctx.accessToken);
    projectId = project.id;
    await enableConstructionProfile(app, ctx.accessToken, projectId);

    const cc = await request(app.getHttpServer())
      .post('/api/v1/cost-centers')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        code: `CC-RPT-${Date.now()}`,
        name: 'Reporting Works',
        projectId,
      });
    expect(cc.status).toBe(201);
    costCenterId = cc.body.data.id;

    const customer = await createPartyWithRole(
      app,
      ctx.tenantId,
      adminUserId,
      PartyRoleType.customer,
      'RPT',
    );
    customerPartyId = customer.id;

    const contract = await createContract({
      title: 'Reporting Contract',
      retentionPercent: '10',
      advancePercent: '5',
    });
    contractId = contract.id;
    await activateContract(contractId);

    const boq = await createBoq(contractId, 'Reporting BOQ');
    boqId = boq.id;

    const itemRes = await createBoqItem(boqId, {
      description: 'Reporting structural line',
      plannedQuantity: '100',
      unitRate: '10',
      lineNumber: 1,
      costCenterId,
    });
    expect(itemRes.status).toBe(201);
    boqItemId = itemRes.body.data.id;

    const approveRes = await api().post(`/api/v1/construction/boqs/${boqId}/approve`);
    expect(approveRes.status).toBe(201);
    expect(approveRes.body.data.status).toBe(ConstructionBoqStatus.approved);

    await createApprovedLumpSumVariation('200.0000');
    await createApprovedProgress('30');
    await postCostEntry(ConstructionCostCategory.material, '50.0000', { costCenterId });
    await postCostEntry(ConstructionCostCategory.labor, '25.0000');

    await api().post('/api/v1/construction/advances/received').send({
      contractId,
      partyType: ConstructionSubledgerPartyType.customer,
      amount: '500',
    });
  });

  afterAll(async () => {
    await licenseService.seedDemoLicense(ctx.tenantId);
    await app.close();
  });

  function featuresWithoutReports() {
    return featuresWithConstruction().filter((f) => f !== 'construction.reports');
  }

  function reportUrl(path: string, params: Record<string, string> = {}) {
    const query = new URLSearchParams({ projectId, ...params });
    return `/api/v1/construction/reports/${path}?${query.toString()}`;
  }

  function nextPeriod() {
    periodCounter += 1;
    const month = String(((periodCounter - 1) % 12) + 1).padStart(2, '0');
    return {
      periodFrom: `2026-${month}-01`,
      periodTo: `2026-${month}-28`,
    };
  }

  function api(token = ctx.accessToken) {
    return {
      get: (url: string) =>
        request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
      post: (url: string) =>
        request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`),
    };
  }

  async function hashPassword(password: string): Promise<string> {
    const bcrypt = await import('bcryptjs');
    return bcrypt.hash(password, 12);
  }

  async function loginAsUser(email: string, password = 'Admin@123456') {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(login.status).toBe(200);
    return login.body.data.accessToken as string;
  }

  async function createContract(
    overrides: {
      title?: string;
      retentionPercent?: string;
      advancePercent?: string;
    } = {},
  ) {
    const res = await api().post('/api/v1/construction/contracts').send({
      projectId,
      title: overrides.title ?? `Contract ${Date.now()}`,
      direction: ConstructionContractDirection.customer,
      partyId: customerPartyId,
      pricingModel: ConstructionContractPricingModel.lump_sum,
      retentionPercent: overrides.retentionPercent,
      advancePercent: overrides.advancePercent,
    });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; number: string };
  }

  async function createBoq(contract: string, notes?: string) {
    const res = await api()
      .post(`/api/v1/construction/contracts/${contract}/boqs`)
      .send({ notes });
    expect(res.status).toBe(201);
    return res.body.data as { id: string };
  }

  async function createBoqItem(
    boq: string,
    payload: Record<string, unknown> = {},
  ) {
    return api()
      .post(`/api/v1/construction/boqs/${boq}/items`)
      .send({
        description: 'BOQ line',
        plannedQuantity: '100',
        unitRate: '10',
        ...payload,
      });
  }

  async function activateContract(targetContractId: string) {
    const res = await api()
      .post(`/api/v1/construction/contracts/${targetContractId}/status`)
      .send({ status: ConstructionContractStatus.active });
    expect(res.status).toBe(201);
  }

  async function createApprovedProgress(quantity: string) {
    const period = nextPeriod();
    const progress = await api().post('/api/v1/construction/progress').send({
      contractId,
      boqId,
      periodFrom: period.periodFrom,
      periodTo: period.periodTo,
    });
    expect(progress.status).toBe(201);

    const item = await api()
      .post(`/api/v1/construction/progress/${progress.body.data.id}/items`)
      .send({
        boqItemId,
        currentPeriodQuantity: quantity,
      });
    expect(item.status).toBe(201);

    await api().post(`/api/v1/construction/progress/${progress.body.data.id}/submit`);
    const approved = await api().post(
      `/api/v1/construction/progress/${progress.body.data.id}/approve`,
    );
    expect(approved.status).toBe(201);
    return approved.body.data;
  }

  async function createApprovedLumpSumVariation(amount: string) {
    const variation = await api().post('/api/v1/construction/variations').send({
      contractId,
      boqId,
      title: `Variation ${Date.now()}`,
    });
    expect(variation.status).toBe(201);

    const item = await api()
      .post(`/api/v1/construction/variations/${variation.body.data.id}/items`)
      .send({
        boqItemId,
        variationType: ConstructionVariationType.lump_sum,
        lumpSumAmount: amount,
        description: 'Lump sum addition',
      });
    expect(item.status).toBe(201);

    await api().post(`/api/v1/construction/variations/${variation.body.data.id}/submit`);
    const approved = await api().post(
      `/api/v1/construction/variations/${variation.body.data.id}/approve`,
    );
    expect(approved.status).toBe(201);
    return approved.body.data;
  }

  async function postCostEntry(
    category: ConstructionCostCategory,
    amount: string,
    overrides: {
      costCenterId?: string;
      occurredAt?: string;
      sourceId?: string;
    } = {},
  ) {
    const res = await api()
      .post(`/api/v1/construction/projects/${projectId}/cost-entries`)
      .send({
        category,
        amount,
        costCenterId: overrides.costCenterId,
        sourceModule: 'construction',
        sourceType: 'test_reporting',
        sourceId: overrides.sourceId ?? randomUUID(),
        sourceEvent: 'manual',
        occurredAt: overrides.occurredAt ?? '2026-01-15',
        description: `Test ${category}`,
      });
    expect(res.status).toBe(201);
    return res.body.data;
  }

  describe('Licensing', () => {
    afterEach(async () => {
      await activateConstructionLicense(prisma, ctx.tenantId, licenseService);
    });

    it('rejects reporting routes when construction.reports feature is disabled', async () => {
      const signed = await signTestActivationForTenant(prisma, ctx.tenantId, {
        modules: defaultModuleEntries(modulesWithConstruction(), 'perpetual'),
        features: featuresWithoutReports(),
      });
      await licenseService.activateLicense(ctx.tenantId, signed);

      const res = await api().get(reportUrl('project-summary'));
      expect(res.status).toBe(403);
    });

    it('allows licensed reporting access', async () => {
      const res = await api().get(reportUrl('project-summary'));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('RBAC', () => {
    it('rejects licensed user without reports read permission', async () => {
      const role = await prisma.role.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'Costing Only Reports',
          code: `costing-only-reports-${Date.now()}`,
        },
      });
      const costingPerms = await prisma.permission.findMany({
        where: {
          module: 'construction',
          feature: { in: ['foundation', 'costing'] },
        },
      });
      for (const perm of costingPerms) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: perm.id },
        });
      }
      const user = await prisma.user.create({
        data: {
          tenantId: ctx.tenantId,
          email: `costing-only-reports-${Date.now()}@fratelanza.local`,
          passwordHash: await hashPassword('Admin@123456'),
          firstName: 'Costing',
          lastName: 'Only',
          roleId: role.id,
          isActive: true,
        },
      });
      const token = await loginAsUser(user.email);

      const costingRes = await api(token).get(
        `/api/v1/construction/costing/projects/${projectId}`,
      );
      expect(costingRes.status).toBe(200);

      const reportRes = await api(token).get(reportUrl('project-summary'));
      expect(reportRes.status).toBe(403);
    });
  });

  describe('Report endpoints', () => {
    it('returns project summary with counts and costing snapshot', async () => {
      const res = await api().get(reportUrl('project-summary'));
      expect(res.status).toBe(200);

      const data = res.body.data;
      expect(data.projectId).toBe(projectId);
      expect(data.hasConstructionProfile).toBe(true);
      expect(data.counts.contracts).toBeGreaterThanOrEqual(1);
      expect(data.counts.boqs).toBeGreaterThanOrEqual(1);
      expect(data.snapshot.planned.originalBoqValue).toBe('1000.0000');
      expect(data.snapshot.executedValue.progressValuation).toBe('300.0000');
      expect(data.snapshot.actualCost.byCategory.total).toBe('75.0000');
    });

    it('returns contract summary for project scope', async () => {
      const res = await api().get(reportUrl('contract-summary'));
      expect(res.status).toBe(200);
      expect(res.body.data.contracts).toHaveLength(1);
      expect(res.body.data.contracts[0].contractId).toBe(contractId);
      expect(res.body.data.contracts[0].progressCertificateCount).toBeGreaterThanOrEqual(1);
    });

    it('returns BOQ status report', async () => {
      const res = await api().get(reportUrl('boq-status'));
      expect(res.status).toBe(200);
      expect(res.body.data.boqs.some((row: { boqId: string }) => row.boqId === boqId)).toBe(
        true,
      );
      expect(res.body.data.boqs[0].totalOriginalAmount).toBe('1000.0000');
    });

    it('returns progress vs BOQ comparison', async () => {
      const res = await api().get(reportUrl('progress-vs-boq'));
      expect(res.status).toBe(200);
      expect(res.body.data.totalPlannedValue).toBe('1000.0000');
      expect(res.body.data.totalExecutedValue).toBe('300.0000');
      expect(res.body.data.items[0].executedQuantity).toBe('30.0000');
    });

    it('returns variation impact report', async () => {
      const res = await api().get(reportUrl('variation-impact'));
      expect(res.status).toBe(200);
      expect(res.body.data.approvedDeltaTotal).toBe('200.0000');
      expect(res.body.data.variations.length).toBeGreaterThanOrEqual(1);
    });

    it('returns actual cost grouped by category', async () => {
      const res = await api().get(reportUrl('actual-cost'));
      expect(res.status).toBe(200);
      expect(res.body.data.byCategory.material).toBe('50.0000');
      expect(res.body.data.byCategory.labor).toBe('25.0000');
      expect(res.body.data.entryCount).toBeGreaterThanOrEqual(2);
    });

    it('returns cost by cost center breakdown', async () => {
      const res = await api().get(reportUrl('cost-by-cost-center'));
      expect(res.status).toBe(200);
      const ccRow = res.body.data.costCenters.find(
        (row: { costCenterId: string }) => row.costCenterId === costCenterId,
      );
      expect(ccRow.byCategory.material).toBe('50.0000');
      expect(res.body.data.unassigned.labor).toBe('25.0000');
    });

    it('returns revenue billing report (empty billings allowed)', async () => {
      const res = await api().get(reportUrl('revenue-billing'));
      expect(res.status).toBe(200);
      expect(res.body.data.totals.count).toBeGreaterThanOrEqual(0);
      expect(res.body.data.billings).toBeDefined();
    });

    it('returns retention report with held balance from approved progress', async () => {
      const res = await api().get(reportUrl('retention'));
      expect(res.status).toBe(200);
      expect(Number(res.body.data.totals.totalHeld)).toBeGreaterThan(0);
      expect(res.body.data.contracts[0].contractId).toBe(contractId);
    });

    it('returns advances report with received balance', async () => {
      const res = await api().get(reportUrl('advances'));
      expect(res.status).toBe(200);
      expect(res.body.data.totals.totalReceived).toBe('500.0000');
      expect(res.body.data.contracts[0].currentBalance).toBe('500.0000');
    });

    it('returns profitability report aligned with costing', async () => {
      const res = await api().get(reportUrl('profitability'));
      expect(res.status).toBe(200);
      expect(res.body.data.profitability.grossMargin).toBe('225.0000');
      expect(res.body.data.financial).toBeDefined();
    });

    it('returns remaining work report', async () => {
      const res = await api().get(reportUrl('remaining-work'));
      expect(res.status).toBe(200);
      expect(res.body.data.remainingBoq.totalRemainingValue).toBe('700.0000');
      expect(res.body.data.profitability.grossMargin).toBe('225.0000');
    });

    it('filters actual cost by category without mutating ledger', async () => {
      const before = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId, projectId },
      });
      const res = await api().get(
        reportUrl('actual-cost', { category: ConstructionCostCategory.material }),
      );
      expect(res.status).toBe(200);
      expect(res.body.data.byCategory.material).toBe('50.0000');
      expect(res.body.data.byCategory.labor).toBe('0.0000');
      const after = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId, projectId },
      });
      expect(after).toBe(before);
    });
  });

  describe('Tenant isolation', () => {
    it('rejects cross-tenant project summary read', async () => {
      const isolated = await createIsolatedTenant(prisma, 'reporting-read');
      const isolatedProject = await prisma.project.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `ISO-RPT-PRJ-${Date.now()}`,
          name: 'Isolated Reporting Project',
        },
      });

      const res = await api().get(
        `/api/v1/construction/reports/project-summary?projectId=${isolatedProject.id}`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Read-only reporting boundary', () => {
    it('does not create journal entries when reading reports', async () => {
      const before = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const res = await api().get(reportUrl('profitability'));
      expect(res.status).toBe(200);
      const after = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(after).toBe(before);
    });

    it('does not mutate inventory when reading reports', async () => {
      const before = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });
      const res = await api().get(reportUrl('remaining-work'));
      expect(res.status).toBe(200);
      const after = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });
      expect(after).toBe(before);
    });
  });
});
