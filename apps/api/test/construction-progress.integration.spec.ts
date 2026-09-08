import type { INestApplication } from '@nestjs/common';
import {
  ConstructionBoqStatus,
  ConstructionContractDirection,
  ConstructionContractPricingModel,
  ConstructionContractStatus,
  ConstructionProgressStatus,
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

describe('Construction progress (Phase 9.2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: Awaited<ReturnType<typeof loadConstructionTestContext>>;
  let adminUserId: string;
  let projectId: string;
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

    const customer = await createPartyWithRole(
      app,
      ctx.tenantId,
      adminUserId,
      PartyRoleType.customer,
      'PRG',
    );
    customerPartyId = customer.id;

    const contract = await createContract({ title: 'Shared Progress Contract' });
    contractId = contract.id;
    await activateContract(contractId);

    const boq = await createBoq(contractId, 'Shared approved BOQ');
    boqId = boq.id;

    const itemRes = await createBoqItem(boqId, {
      description: 'Shared progress line',
      plannedQuantity: '100',
      unitRate: '10',
      lineNumber: 1,
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
      patch: (url: string) =>
        request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${token}`),
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
    overrides: {
      direction?: ConstructionContractDirection;
      partyId?: string;
      title?: string;
      pricingModel?: ConstructionContractPricingModel;
    } = {},
  ) {
    const res = await api().post('/api/v1/construction/contracts').send({
      projectId,
      title: overrides.title ?? `Contract ${Date.now()}`,
      direction: overrides.direction ?? ConstructionContractDirection.customer,
      partyId: overrides.partyId ?? customerPartyId,
      pricingModel: overrides.pricingModel ?? ConstructionContractPricingModel.lump_sum,
    });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; number: string; status: string };
  }

  async function createBoq(contract: string, notes?: string) {
    const res = await api()
      .post(`/api/v1/construction/contracts/${contract}/boqs`)
      .send({ notes });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; revisionNumber: number; status: string };
  }

  async function createBoqItem(
    boq: string,
    payload: Record<string, unknown> = {},
  ) {
    return api()
      .post(`/api/v1/construction/boqs/${boq}/items`)
      .send({
        description: 'Progress BOQ line',
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
    expect(res.body.data.status).toBe(ConstructionContractStatus.active);
    return res.body.data;
  }

  async function createApprovedBoqFixture(
    suffix: string,
    options: { plannedQuantity?: string; unitRate?: string } = {},
  ) {
    const contract = await createContract({ title: `Fixture ${suffix}` });
    await activateContract(contract.id);
    const boq = await createBoq(contract.id, `BOQ ${suffix}`);
    const itemRes = await createBoqItem(boq.id, {
      description: `Line ${suffix}`,
      plannedQuantity: options.plannedQuantity ?? '100',
      unitRate: options.unitRate ?? '10',
      lineNumber: 1,
    });
    expect(itemRes.status).toBe(201);
    const approveRes = await api().post(`/api/v1/construction/boqs/${boq.id}/approve`);
    expect(approveRes.status).toBe(201);
    return {
      contractId: contract.id,
      boqId: boq.id,
      boqItemId: itemRes.body.data.id as string,
    };
  }

  async function createProgress(
    overrides: {
      contractId?: string;
      boqId?: string;
      periodFrom?: string;
      periodTo?: string;
      notes?: string;
    } = {},
  ) {
    const period = nextPeriod();
    return api().post('/api/v1/construction/progress').send({
      contractId: overrides.contractId ?? contractId,
      boqId: overrides.boqId ?? boqId,
      periodFrom: overrides.periodFrom ?? period.periodFrom,
      periodTo: overrides.periodTo ?? period.periodTo,
      notes: overrides.notes,
    });
  }

  async function addProgressItem(
    progressId: string,
    payload: {
      boqItemId?: string;
      currentPeriodQuantity: string;
      lineNumber?: number;
      notes?: string;
    },
  ) {
    return api()
      .post(`/api/v1/construction/progress/${progressId}/items`)
      .send({
        boqItemId: payload.boqItemId ?? boqItemId,
        currentPeriodQuantity: payload.currentPeriodQuantity,
        lineNumber: payload.lineNumber,
        notes: payload.notes,
      });
  }

  async function submitProgress(progressId: string) {
    return api().post(`/api/v1/construction/progress/${progressId}/submit`);
  }

  async function approveProgress(progressId: string) {
    return api().post(`/api/v1/construction/progress/${progressId}/approve`);
  }

  describe('RBAC', () => {
    it('rejects user without progress RBAC permission', async () => {
      const role = await prisma.role.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'BOQ Only',
          code: `boq-only-${Date.now()}`,
        },
      });
      const boqPerms = await prisma.permission.findMany({
        where: {
          module: 'construction',
          feature: { in: ['foundation', 'contracts', 'boq'] },
        },
      });
      for (const perm of boqPerms) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: perm.id },
        });
      }
      const username = `boq-only-${Date.now()}`;
      const user = await prisma.user.create({
        data: {
          tenantId: ctx.tenantId,
          email: `${username}@fratelanza.local`,
          passwordHash: await hashPassword('Admin@123456'),
          firstName: 'BOQ',
          lastName: 'Only',
          roleId: role.id,
          isActive: true,
        },
      });
      const token = await loginAsUser(username);

      const boqRes = await api(token).get(
        `/api/v1/construction/contracts/${contractId}/boqs`,
      );
      expect(boqRes.status).toBe(200);

      const progressRes = await api(token).get('/api/v1/construction/progress');
      expect(progressRes.status).toBe(403);
    });
  });

  describe('Create progress header', () => {
    it('creates a draft progress document bound to contract and approved BOQ', async () => {
      const res = await createProgress({ notes: 'January measurement' });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe(ConstructionProgressStatus.draft);
      expect(res.body.data.number).toMatch(/^PRG-/);
      expect(res.body.data.contractId).toBe(contractId);
      expect(res.body.data.boqId).toBe(boqId);
      expect(res.body.data.projectId).toBe(projectId);
      expect(res.body.data.notes).toBe('January measurement');
    });

    it('lists progress documents for the tenant', async () => {
      const created = await createProgress();
      expect(created.status).toBe(201);

      const list = await api().get(
        `/api/v1/construction/progress?contractId=${contractId}&limit=100`,
      );
      expect(list.status).toBe(200);
      expect(list.body.data.some((row: { id: string }) => row.id === created.body.data.id)).toBe(
        true,
      );
    });
  });

  describe('Tenant isolation', () => {
    it('rejects cross-tenant progress read', async () => {
      const isolated = await createIsolatedTenant(prisma, 'prg-read');
      const isolatedProject = await prisma.project.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `ISO-PRG-PRJ-${Date.now()}`,
          name: 'Isolated Progress Project',
        },
      });
      await prisma.constructionProjectProfile.create({
        data: { tenantId: isolated.tenantId, projectId: isolatedProject.id },
      });
      const isolatedParty = await prisma.party.create({
        data: {
          tenantId: isolated.tenantId,
          type: PartyType.organization,
          code: `ISO-PRG-PTY-${Date.now()}`,
          displayName: 'Isolated Progress Party',
        },
      });
      const isolatedContract = await prisma.constructionContract.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: isolatedProject.id,
          branchId: isolated.branchId,
          number: `CNT-PRG-ISO-${Date.now()}`,
          title: 'Isolated Progress Contract',
          direction: ConstructionContractDirection.customer,
          partyId: isolatedParty.id,
          pricingModel: ConstructionContractPricingModel.lump_sum,
          status: ConstructionContractStatus.active,
        },
      });
      const isolatedBoq = await prisma.constructionBoq.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: isolatedProject.id,
          contractId: isolatedContract.id,
          number: `BOQ-PRG-ISO-${Date.now()}`,
          revisionNumber: 1,
          status: ConstructionBoqStatus.approved,
        },
      });
      const isolatedProgress = await prisma.constructionProgress.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: isolatedProject.id,
          branchId: isolated.branchId,
          contractId: isolatedContract.id,
          boqId: isolatedBoq.id,
          number: `PRG-ISO-${Date.now()}`,
          periodFrom: new Date('2026-01-01'),
          periodTo: new Date('2026-01-31'),
        },
      });

      const res = await api().get(`/api/v1/construction/progress/${isolatedProgress.id}`);
      expect(res.status).toBe(404);
    });
  });

  describe('BOQ revision binding', () => {
    it('rejects progress when boqId belongs to a different contract', async () => {
      const other = await createApprovedBoqFixture('wrong-boq');

      const res = await createProgress({
        contractId,
        boqId: other.boqId,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects progress when BOQ revision is not approved', async () => {
      const contract = await createContract({ title: 'Draft BOQ Contract' });
      await activateContract(contract.id);
      const draftBoq = await createBoq(contract.id, 'Draft only');

      const res = await createProgress({
        contractId: contract.id,
        boqId: draftBoq.id,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects progress item when boqItemId is outside the progress BOQ revision', async () => {
      const fixture = await createApprovedBoqFixture('item-binding');
      const progress = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      expect(progress.status).toBe(201);

      const res = await addProgressItem(progress.body.data.id, {
        boqItemId: boqItemId,
        currentPeriodQuantity: '5',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Quantity accumulation', () => {
    it('accumulates cumulative quantity across two approved periods (20 then 30 = 50)', async () => {
      const fixture = await createApprovedBoqFixture('accumulation');
      const period1 = nextPeriod();
      const period2 = nextPeriod();

      const progress1 = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
        ...period1,
      });
      expect(progress1.status).toBe(201);

      const item1 = await addProgressItem(progress1.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '20',
      });
      expect(item1.status).toBe(201);
      expect(item1.body.data.previousCumulativeQuantity).toBe('0');
      expect(item1.body.data.cumulativeQuantity).toBe('20');

      await submitProgress(progress1.body.data.id);
      await approveProgress(progress1.body.data.id);

      const progress2 = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
        ...period2,
      });
      expect(progress2.status).toBe(201);

      const item2 = await addProgressItem(progress2.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '30',
      });
      expect(item2.status).toBe(201);
      expect(item2.body.data.previousCumulativeQuantity).toBe('20');
      expect(item2.body.data.cumulativeQuantity).toBe('50');
    });
  });

  describe('Quantity cap', () => {
    it('rejects cumulative quantity greater than BOQ planned quantity', async () => {
      const fixture = await createApprovedBoqFixture('quantity-cap');
      const period1 = nextPeriod();
      const period2 = nextPeriod();

      const progress1 = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
        ...period1,
      });
      const item1 = await addProgressItem(progress1.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '80',
      });
      expect(item1.status).toBe(201);
      await submitProgress(progress1.body.data.id);
      await approveProgress(progress1.body.data.id);

      const progress2 = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
        ...period2,
      });
      const item2 = await addProgressItem(progress2.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '21',
      });
      expect(item2.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Decimal valuation', () => {
    it('calculates current period amount as quantity × rate with decimal precision', async () => {
      const fixture = await createApprovedBoqFixture('decimal', {
        plannedQuantity: '100',
        unitRate: '1.3333',
      });
      const progress = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      expect(progress.status).toBe(201);

      const item = await addProgressItem(progress.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '3',
      });
      expect(item.status).toBe(201);
      expect(item.body.data.unitRateSnapshot).toBe('1.3333');
      expect(item.body.data.currentPeriodAmount).toBe('3.9999');
      expect(item.body.data.cumulativeAmount).toBe('3.9999');
    });
  });

  describe('Rate snapshot', () => {
    it('stores BOQ unit rate snapshot on progress item creation', async () => {
      const fixture = await createApprovedBoqFixture('snapshot', {
        plannedQuantity: '100',
        unitRate: '10',
      });
      const progress = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      const item = await addProgressItem(progress.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '5',
      });
      expect(item.status).toBe(201);
      expect(item.body.data.unitRateSnapshot).toBe('10');
      expect(item.body.data.currentPeriodAmount).toBe('50');
    });

    it('keeps the original rate snapshot after a new BOQ revision with a different rate', async () => {
      const fixture = await createApprovedBoqFixture('snapshot-revise', {
        plannedQuantity: '100',
        unitRate: '10',
      });
      const progress = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      const item = await addProgressItem(progress.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '4',
      });
      expect(item.status).toBe(201);
      expect(item.body.data.unitRateSnapshot).toBe('10');

      const revision = await api().post(
        `/api/v1/construction/boqs/${fixture.boqId}/revise`,
      );
      expect(revision.status).toBe(201);
      const revisedBoqId = revision.body.data.id as string;

      const revisedItems = await api().get(`/api/v1/construction/boqs/${revisedBoqId}`);
      expect(revisedItems.status).toBe(200);
      const revisedBoqItemId = revisedItems.body.data.items[0].id as string;

      await api()
        .patch(`/api/v1/construction/boq-items/${revisedBoqItemId}`)
        .send({ unitRate: '99' });
      await api().post(`/api/v1/construction/boqs/${revisedBoqId}/approve`);

      const newProgress = await createProgress({
        contractId: fixture.contractId,
        boqId: revisedBoqId,
      });
      const newItem = await addProgressItem(newProgress.body.data.id, {
        boqItemId: revisedBoqItemId,
        currentPeriodQuantity: '2',
      });
      expect(newItem.status).toBe(201);
      expect(newItem.body.data.unitRateSnapshot).toBe('99');
      expect(newItem.body.data.currentPeriodAmount).toBe('198');

      const originalItem = await prisma.constructionProgressItem.findUnique({
        where: { id: item.body.data.id },
      });
      expect(originalItem?.unitRateSnapshot.toString()).toBe('10');
      expect(originalItem?.currentPeriodAmount.toString()).toBe('40');
    });
  });

  describe('Lifecycle', () => {
    it('supports draft → submit → approve', async () => {
      const fixture = await createApprovedBoqFixture('lifecycle-approve');
      const progress = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      expect(progress.body.data.status).toBe(ConstructionProgressStatus.draft);

      await addProgressItem(progress.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '10',
      });

      const submitted = await submitProgress(progress.body.data.id);
      expect(submitted.status).toBe(201);
      expect(submitted.body.data.status).toBe(ConstructionProgressStatus.submitted);

      const approved = await approveProgress(progress.body.data.id);
      expect(approved.status).toBe(201);
      expect(approved.body.data.status).toBe(ConstructionProgressStatus.approved);
      expect(approved.body.data.approvedAt).toBeTruthy();
    });

    it('supports reject → reopen → draft', async () => {
      const fixture = await createApprovedBoqFixture('lifecycle-reject');
      const progress = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      await addProgressItem(progress.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '8',
      });
      await submitProgress(progress.body.data.id);

      const rejected = await api()
        .post(`/api/v1/construction/progress/${progress.body.data.id}/reject`)
        .send({ reason: 'Missing site photos' });
      expect(rejected.status).toBe(201);
      expect(rejected.body.data.status).toBe(ConstructionProgressStatus.rejected);
      expect(rejected.body.data.rejectionReason).toBe('Missing site photos');

      const reopened = await api().post(
        `/api/v1/construction/progress/${progress.body.data.id}/reopen`,
      );
      expect(reopened.status).toBe(201);
      expect(reopened.body.data.status).toBe(ConstructionProgressStatus.draft);
      expect(reopened.body.data.rejectionReason).toBeNull();
    });
  });

  describe('Approved progress immutability', () => {
    it('rejects updating progress items after approval', async () => {
      const fixture = await createApprovedBoqFixture('approved-immutable');
      const progress = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      const item = await addProgressItem(progress.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '6',
      });
      expect(item.status).toBe(201);

      await submitProgress(progress.body.data.id);
      await approveProgress(progress.body.data.id);

      const res = await api()
        .patch(`/api/v1/construction/progress/items/${item.body.data.id}`)
        .send({ currentPeriodQuantity: '7' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Duplicate period conflict', () => {
    it('rejects duplicate progress for the same contract, BOQ revision, and period', async () => {
      const fixture = await createApprovedBoqFixture('duplicate-period');
      const period = nextPeriod();

      const first = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
        ...period,
      });
      expect(first.status).toBe(201);

      const second = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
        ...period,
      });
      expect(second.status).toBe(409);
    });
  });

  describe('Concurrency and idempotency', () => {
    it('returns approved progress when approve is called twice', async () => {
      const fixture = await createApprovedBoqFixture('idempotent-approve');
      const progress = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      await addProgressItem(progress.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '12',
      });
      await submitProgress(progress.body.data.id);

      const first = await approveProgress(progress.body.data.id);
      expect(first.status).toBe(201);
      expect(first.body.data.status).toBe(ConstructionProgressStatus.approved);

      const second = await approveProgress(progress.body.data.id);
      expect(second.status).toBe(201);
      expect(second.body.data.status).toBe(ConstructionProgressStatus.approved);
      expect(second.body.data.id).toBe(first.body.data.id);
    });
  });

  describe('Boundaries', () => {
    it('does not create journal entries on progress approve', async () => {
      const before = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const fixture = await createApprovedBoqFixture('boundary-gl');
      const progress = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      await addProgressItem(progress.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '15',
      });
      await submitProgress(progress.body.data.id);
      await approveProgress(progress.body.data.id);

      const after = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(after).toBe(before);
    });

    it('does not mutate inventory on progress approve', async () => {
      const before = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });
      const fixture = await createApprovedBoqFixture('boundary-inv');
      const progress = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      await addProgressItem(progress.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '9',
      });
      await submitProgress(progress.body.data.id);
      await approveProgress(progress.body.data.id);

      const after = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });
      expect(after).toBe(before);
    });

    it('does not create ConstructionCostEntry on progress approve', async () => {
      const before = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId },
      });
      const fixture = await createApprovedBoqFixture('boundary-cost');
      const progress = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      await addProgressItem(progress.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '11',
      });
      await submitProgress(progress.body.data.id);
      await approveProgress(progress.body.data.id);

      const after = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId },
      });
      expect(after).toBe(before);
    });
  });

  describe('Contract activation requirement', () => {
    it('rejects submit when contract is not active', async () => {
      const contract = await createContract({ title: 'Draft Contract Progress' });
      const boq = await createBoq(contract.id);
      const itemRes = await createBoqItem(boq.id, {
        plannedQuantity: '100',
        unitRate: '10',
      });
      expect(itemRes.status).toBe(201);
      await api().post(`/api/v1/construction/boqs/${boq.id}/approve`);

      const progress = await createProgress({
        contractId: contract.id,
        boqId: boq.id,
      });
      expect(progress.status).toBe(201);

      await addProgressItem(progress.body.data.id, {
        boqItemId: itemRes.body.data.id,
        currentPeriodQuantity: '5',
      });

      const res = await submitProgress(progress.body.data.id);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(String(res.body.error?.message ?? res.body.message)).toMatch(/active/i);
    });
  });
});
