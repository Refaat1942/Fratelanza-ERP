import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import {
  ConstructionBoqStatus,
  ConstructionContractDirection,
  ConstructionContractPricingModel,
  ConstructionContractStatus,
  ConstructionCostCategory,
  ConstructionVariationType,
  PartyRoleType,
  PartyType,
} from '../../../packages/database/generated/server';
import { PrismaService } from '../src/database/prisma.service';
import {
  createPartyWithRole,
  createUniversalProject,
  enableConstructionProfile,
  loadConstructionTestContext,
  prepareConstructionTestSuite,
  restoreDemoTenantLicense,
} from './construction-test.helpers';
import { createIsolatedTenant } from './pms-test.helpers';
import { createTestApp, request } from './test-app';

describe('Construction costing (Phase 9.7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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
    ({ ctx, prisma } = await prepareConstructionTestSuite(app));

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
        code: `CC-COST-${Date.now()}`,
        name: 'Structural Works',
        projectId,
      });
    expect(cc.status).toBe(201);
    costCenterId = cc.body.data.id;

    const customer = await createPartyWithRole(
      app,
      ctx.tenantId,
      adminUserId,
      PartyRoleType.customer,
      'CST',
    );
    customerPartyId = customer.id;

    const contract = await createContract({ title: 'Costing Contract' });
    contractId = contract.id;
    await activateContract(contractId);

    const boq = await createBoq(contractId, 'Costing BOQ');
    boqId = boq.id;

    const itemRes = await createBoqItem(boqId, {
      description: 'Main structural line',
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
  });

  afterAll(async () => {
    await restoreDemoTenantLicense(app);
    await app.close();
  });

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

  async function loginAsUser(username: string, password = 'Admin@123456') {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password });
    expect(login.status).toBe(200);
    return login.body.data.accessToken as string;
  }

  async function createContract(
    overrides: { title?: string } = {},
  ) {
    const res = await api().post('/api/v1/construction/contracts').send({
      projectId,
      title: overrides.title ?? `Contract ${Date.now()}`,
      direction: ConstructionContractDirection.customer,
      partyId: customerPartyId,
      pricingModel: ConstructionContractPricingModel.lump_sum,
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
        sourceType: 'test_costing',
        sourceId: overrides.sourceId ?? randomUUID(),
        sourceEvent: 'manual',
        occurredAt: overrides.occurredAt ?? '2026-01-15',
        description: `Test ${category}`,
      });
    expect(res.status).toBe(201);
    return res.body.data;
  }

  describe('RBAC', () => {
    it('rejects user without costing read permission', async () => {
      const role = await prisma.role.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'Foundation Only',
          code: `foundation-only-${Date.now()}`,
        },
      });
      const foundationPerms = await prisma.permission.findMany({
        where: {
          module: 'construction',
          feature: 'foundation',
        },
      });
      for (const perm of foundationPerms) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: perm.id },
        });
      }
      const username = `foundation-only-${Date.now()}`;
      const user = await prisma.user.create({
        data: {
          tenantId: ctx.tenantId,
          email: `${username}@fratelanza.local`,
          passwordHash: await hashPassword('Admin@123456'),
          firstName: 'Foundation',
          lastName: 'Only',
          roleId: role.id,
          isActive: true,
        },
      });
      const token = await loginAsUser(username);

      const profileRes = await api(token).get(
        `/api/v1/construction/projects/${projectId}/profile`,
      );
      expect(profileRes.status).toBe(200);

      const costingRes = await api(token).get(
        `/api/v1/construction/costing/projects/${projectId}`,
      );
      expect(costingRes.status).toBe(403);
    });
  });

  describe('Project costing calculations', () => {
    it('returns planned, contractual, executed value, actual cost, and profitability', async () => {
      await createApprovedLumpSumVariation('200.0000');
      await createApprovedProgress('30');
      await postCostEntry(ConstructionCostCategory.material, '50.0000', {
        costCenterId,
      });
      await postCostEntry(ConstructionCostCategory.labor, '25.0000');

      const res = await api().get(`/api/v1/construction/costing/projects/${projectId}`);
      expect(res.status).toBe(200);

      const data = res.body.data;
      expect(data.planned.originalBoqValue).toBe('1000.0000');
      expect(data.contractual.approvedVariationsValue).toBe('200.0000');
      expect(data.contractual.currentContractValue).toBe('1200.0000');
      expect(data.executedValue.progressValuation).toBe('300.0000');
      expect(data.actualCost.byCategory.material).toBe('50.0000');
      expect(data.actualCost.byCategory.labor).toBe('25.0000');
      expect(data.actualCost.byCategory.total).toBe('75.0000');
      expect(data.profitability.grossMargin).toBe('225.0000');
      expect(data.profitability.grossMarginPercent).toBe('75.0000');
      expect(data.remainingBoq.totalRemainingValue).toBe('700.0000');
      expect(data.remainingBoq.items[0].remainingQuantity).toBe('70.0000');
    });

    it('filters actual costs by category and date range without mutating ledger', async () => {
      await postCostEntry(ConstructionCostCategory.equipment, '12.5000', {
        occurredAt: '2026-02-10',
        sourceId: randomUUID(),
      });

      const res = await api().get(
        `/api/v1/construction/costing/projects/${projectId}?category=equipment&dateFrom=2026-02-01&dateTo=2026-02-28`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.actualCost.byCategory.equipment).toBe('12.5000');
      expect(res.body.data.actualCost.byCategory.material).toBe('0.0000');
      expect(res.body.data.actualCost.byCategory.total).toBe('12.5000');
    });
  });

  describe('Contract costing', () => {
    it('returns contract-level costing snapshot', async () => {
      const res = await api().get(
        `/api/v1/construction/costing/contracts/${contractId}`,
      );
      expect(res.status).toBe(200);

      const data = res.body.data;
      expect(data.contractId).toBe(contractId);
      expect(data.boqId).toBe(boqId);
      expect(data.planned.originalBoqValue).toBe('1000.0000');
      expect(data.executedValue.progressValuation).toBe('300.0000');
      expect(data.actualCost.byCategory.total).toBe('87.5000');
    });
  });

  describe('Cost center costing', () => {
    it('attributes BOQ, progress, and actual cost to cost center', async () => {
      const res = await api().get(
        `/api/v1/construction/costing/cost-centers/${costCenterId}`,
      );
      expect(res.status).toBe(200);

      const data = res.body.data;
      expect(data.costCenterId).toBe(costCenterId);
      expect(data.projectId).toBe(projectId);
      expect(data.planned.originalBoqValue).toBe('1000.0000');
      expect(data.executedValue.progressValuation).toBe('300.0000');
      expect(data.actualCost.byCategory.material).toBe('50.0000');
      expect(data.actualCost.byCategory.labor).toBe('0.0000');
      expect(data.actualCost.byCategory.total).toBe('50.0000');
    });
  });

  describe('Decimal-safe aggregation', () => {
    it('aggregates fractional amounts without float drift', async () => {
      const isolatedProject = await createUniversalProject(app, ctx.accessToken, {
        name: 'Decimal Project',
      });
      await enableConstructionProfile(app, ctx.accessToken, isolatedProject.id);

      const contract = await api().post('/api/v1/construction/contracts').send({
        projectId: isolatedProject.id,
        title: 'Decimal Contract',
        direction: ConstructionContractDirection.customer,
        partyId: customerPartyId,
        pricingModel: ConstructionContractPricingModel.lump_sum,
      });
      expect(contract.status).toBe(201);
      await activateContract(contract.body.data.id);

      const boq = await api()
        .post(`/api/v1/construction/contracts/${contract.body.data.id}/boqs`)
        .send({});
      expect(boq.status).toBe(201);

      const item = await api()
        .post(`/api/v1/construction/boqs/${boq.body.data.id}/items`)
        .send({
          description: 'Fractional line',
          plannedQuantity: '3',
          unitRate: '33.3333',
        });
      expect(item.status).toBe(201);
      await api().post(`/api/v1/construction/boqs/${boq.body.data.id}/approve`);

      const res = await api().get(
        `/api/v1/construction/costing/projects/${isolatedProject.id}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.planned.originalBoqValue).toBe('99.9999');
    });
  });

  describe('Tenant isolation', () => {
    it('rejects cross-tenant contract costing read', async () => {
      const isolated = await createIsolatedTenant(prisma, 'costing-read');
      const isolatedProject = await prisma.project.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `ISO-CST-PRJ-${Date.now()}`,
          name: 'Isolated Costing Project',
        },
      });
      const isolatedParty = await prisma.party.create({
        data: {
          tenantId: isolated.tenantId,
          type: PartyType.organization,
          code: `ISO-CST-PTY-${Date.now()}`,
          displayName: 'Isolated Costing Party',
        },
      });
      const isolatedContract = await prisma.constructionContract.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: isolatedProject.id,
          branchId: isolated.branchId,
          number: `CNT-CST-ISO-${Date.now()}`,
          title: 'Isolated Costing Contract',
          direction: ConstructionContractDirection.customer,
          partyId: isolatedParty.id,
          pricingModel: ConstructionContractPricingModel.lump_sum,
          status: ConstructionContractStatus.active,
        },
      });

      const res = await api().get(
        `/api/v1/construction/costing/contracts/${isolatedContract.id}`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Read-only reporting boundary', () => {
    it('does not create journal entries when reading costing', async () => {
      const before = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const res = await api().get(`/api/v1/construction/costing/projects/${projectId}`);
      expect(res.status).toBe(200);
      const after = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(after).toBe(before);
    });

    it('does not mutate inventory when reading costing', async () => {
      const before = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });
      const res = await api().get(
        `/api/v1/construction/costing/contracts/${contractId}`,
      );
      expect(res.status).toBe(200);
      const after = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });
      expect(after).toBe(before);
    });

    it('does not create construction cost entries when reading costing', async () => {
      const before = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId, projectId },
      });
      const res = await api().get(
        `/api/v1/construction/costing/cost-centers/${costCenterId}`,
      );
      expect(res.status).toBe(200);
      const after = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId, projectId },
      });
      expect(after).toBe(before);
    });
  });
});
