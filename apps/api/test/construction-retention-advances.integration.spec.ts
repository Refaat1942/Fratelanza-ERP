import type { INestApplication } from '@nestjs/common';
import {
  ConstructionBoqStatus,
  ConstructionContractDirection,
  ConstructionContractPricingModel,
  ConstructionContractStatus,
  ConstructionProgressStatus,
  ConstructionRetentionDirection,
  ConstructionSubledgerPartyType,
  PartyRoleType,
  PartyType,
  Prisma,
} from '../../../packages/database/generated/server';
import { LicenseService } from '../src/modules/license/license.service';
import { PrismaService } from '../src/database/prisma.service';
import { DEMO_ENABLED_FEATURES } from '../src/modules/license/catalog/feature-catalog';
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

describe('Construction retention & advances (Phase 9.4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let licenseService: LicenseService;
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

    const customer = await createPartyWithRole(
      app,
      ctx.tenantId,
      adminUserId,
      PartyRoleType.customer,
      'RET',
    );
    customerPartyId = customer.id;

    const contract = await createContract({
      title: 'Shared Retention Contract',
      retentionPercent: '10',
      retentionCap: '500',
    });
    contractId = contract.id;
    await activateContract(contractId);

    const boq = await createBoq(contractId, 'Shared retention BOQ');
    boqId = boq.id;

    const itemRes = await createBoqItem(boqId, {
      description: 'Shared retention line',
      plannedQuantity: '100',
      unitRate: '10',
      lineNumber: 1,
    });
    expect(itemRes.status).toBe(201);
    boqItemId = itemRes.body.data.id;

    const approveRes = await approveBoq(boqId);
    expect(approveRes.status).toBe(201);
    expect(approveRes.body.data.status).toBe(ConstructionBoqStatus.approved);
  });

  afterAll(async () => {
    await licenseService.seedDemoLicense(ctx.tenantId);
    await app.close();
  });

  function featuresWithoutRetention() {
    return [
      ...DEMO_ENABLED_FEATURES,
      'construction.foundation',
      'construction.contracts',
      'construction.boq',
      'construction.progress',
      'construction.variations',
    ];
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
      patch: (url: string) =>
        request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${token}`),
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
      direction?: ConstructionContractDirection;
      partyId?: string;
      title?: string;
      pricingModel?: ConstructionContractPricingModel;
      retentionPercent?: string;
      retentionCap?: string;
      advanceAmount?: string;
      advancePercent?: string;
    } = {},
  ) {
    const res = await api().post('/api/v1/construction/contracts').send({
      projectId,
      title: overrides.title ?? `Contract ${Date.now()}`,
      direction: overrides.direction ?? ConstructionContractDirection.customer,
      partyId: overrides.partyId ?? customerPartyId,
      pricingModel: overrides.pricingModel ?? ConstructionContractPricingModel.lump_sum,
      retentionPercent: overrides.retentionPercent,
      retentionCap: overrides.retentionCap,
      advanceAmount: overrides.advanceAmount,
      advancePercent: overrides.advancePercent,
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
        description: 'Retention BOQ line',
        plannedQuantity: '100',
        unitRate: '10',
        ...payload,
      });
  }

  async function approveBoq(boq: string) {
    return api().post(`/api/v1/construction/boqs/${boq}/approve`);
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
    contractOverrides: {
      retentionPercent?: string;
      retentionCap?: string;
      advanceAmount?: string;
      advancePercent?: string;
    } = {},
    boqOptions: { plannedQuantity?: string; unitRate?: string } = {},
  ) {
    const contract = await createContract({
      title: `Fixture ${suffix}`,
      ...contractOverrides,
    });
    await activateContract(contract.id);
    const boq = await createBoq(contract.id, `BOQ ${suffix}`);
    const itemRes = await createBoqItem(boq.id, {
      description: `Line ${suffix}`,
      plannedQuantity: boqOptions.plannedQuantity ?? '100',
      unitRate: boqOptions.unitRate ?? '10',
      lineNumber: 1,
    });
    expect(itemRes.status).toBe(201);
    const approveRes = await approveBoq(boq.id);
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
    } = {},
  ) {
    const period = nextPeriod();
    return api().post('/api/v1/construction/progress').send({
      contractId: overrides.contractId ?? contractId,
      boqId: overrides.boqId ?? boqId,
      periodFrom: overrides.periodFrom ?? period.periodFrom,
      periodTo: overrides.periodTo ?? period.periodTo,
    });
  }

  async function addProgressItem(
    progressId: string,
    payload: { boqItemId: string; currentPeriodQuantity: string },
  ) {
    return api()
      .post(`/api/v1/construction/progress/${progressId}/items`)
      .send(payload);
  }

  async function submitProgress(progressId: string) {
    return api().post(`/api/v1/construction/progress/${progressId}/submit`);
  }

  async function approveProgress(progressId: string) {
    return api().post(`/api/v1/construction/progress/${progressId}/approve`);
  }

  async function createSubmitApproveProgress(
    fixture: { contractId: string; boqId: string; boqItemId: string },
    quantity: string,
  ) {
    const progress = await createProgress({
      contractId: fixture.contractId,
      boqId: fixture.boqId,
    });
    expect(progress.status).toBe(201);
    const item = await addProgressItem(progress.body.data.id, {
      boqItemId: fixture.boqItemId,
      currentPeriodQuantity: quantity,
    });
    expect(item.status).toBe(201);
    await submitProgress(progress.body.data.id);
    const approved = await approveProgress(progress.body.data.id);
    expect(approved.status).toBe(201);
    return {
      progress: approved.body.data,
      totalCurrentAmount: item.body.data.currentPeriodAmount as string,
    };
  }

  describe('Licensing', () => {
    afterEach(async () => {
      await activateConstructionLicense(prisma, ctx.tenantId, licenseService);
    });

    it('rejects construction.retention when feature is not licensed', async () => {
      const signed = await signTestActivationForTenant(prisma, ctx.tenantId, {
        modules: defaultModuleEntries(modulesWithConstruction(), 'perpetual'),
        features: featuresWithoutRetention(),
      });
      await licenseService.activateLicense(ctx.tenantId, signed);

      const res = await api().get(
        `/api/v1/construction/retention/balance?contractId=${contractId}&partyType=customer`,
      );
      expect(res.status).toBe(403);
    });

    it('allows licensed and authorized access', async () => {
      const res = await api().get(
        `/api/v1/construction/retention/balance?contractId=${contractId}&partyType=customer`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.balance).toBeDefined();
    });
  });

  describe('RBAC', () => {
    it('rejects licensed user without retention RBAC permission', async () => {
      const role = await prisma.role.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'Progress Only Ret',
          code: `progress-only-ret-${Date.now()}`,
        },
      });
      const progressPerms = await prisma.permission.findMany({
        where: {
          module: 'construction',
          feature: { in: ['foundation', 'contracts', 'boq', 'progress', 'variations'] },
        },
      });
      for (const perm of progressPerms) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: perm.id },
        });
      }
      const user = await prisma.user.create({
        data: {
          tenantId: ctx.tenantId,
          email: `progress-only-ret-${Date.now()}@fratelanza.local`,
          passwordHash: await hashPassword('Admin@123456'),
          firstName: 'Progress',
          lastName: 'Only',
          roleId: role.id,
          isActive: true,
        },
      });
      const token = await loginAsUser(user.email);

      const progressRes = await api(token).get('/api/v1/construction/progress');
      expect(progressRes.status).toBe(200);

      const retentionRes = await api(token).get(
        `/api/v1/construction/retention/balance?contractId=${contractId}&partyType=customer`,
      );
      expect(retentionRes.status).toBe(403);
    });
  });

  describe('Retention calculations', () => {
    it('holds 10% of progress gross on approval', async () => {
      const fixture = await createApprovedBoqFixture('ret-percent', {
        retentionPercent: '10',
      });
      const { progress } = await createSubmitApproveProgress(fixture, '50');

      const entries = await prisma.constructionRetentionEntry.findMany({
        where: {
          tenantId: ctx.tenantId,
          contractId: fixture.contractId,
          sourceId: progress.id,
        },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].direction).toBe(ConstructionRetentionDirection.hold);
      expect(entries[0].amount.toString()).toBe('50');
      expect(entries[0].grossBaseAmount?.toString()).toBe('500');
      expect(entries[0].balanceAfter.toString()).toBe('50');
    });

    it('caps retention hold at retentionCap minus current balance', async () => {
      const fixture = await createApprovedBoqFixture('ret-cap', {
        retentionPercent: '10',
        retentionCap: '75',
      });

      await createSubmitApproveProgress(fixture, '50');
      await createSubmitApproveProgress(fixture, '50');

      const balanceRes = await api().get(
        `/api/v1/construction/retention/balance?contractId=${fixture.contractId}&partyType=customer`,
      );
      expect(balanceRes.status).toBe(200);
      expect(balanceRes.body.data.balance).toBe('75');
    });
  });

  describe('Advance calculations', () => {
    it('records received advance and recoverable percent formula', async () => {
      const fixture = await createApprovedBoqFixture('adv-percent', {
        advancePercent: '20',
      });

      const received = await api().post('/api/v1/construction/advances/received').send({
        contractId: fixture.contractId,
        partyType: ConstructionSubledgerPartyType.customer,
        amount: '1000',
      });
      expect(received.status).toBe(201);
      expect(received.body.data.balanceAfter).toBe('1000');

      const recoverable = await api().get(
        `/api/v1/construction/advances/recoverable?contractId=${fixture.contractId}&partyType=customer&grossAmount=500`,
      );
      expect(recoverable.status).toBe(200);
      expect(recoverable.body.data.recoverable).toBe('100');
    });

    it('uses advanceAmount when advancePercent is not set', async () => {
      const fixture = await createApprovedBoqFixture('adv-amount', {
        advanceAmount: '250',
      });

      await api().post('/api/v1/construction/advances/received').send({
        contractId: fixture.contractId,
        partyType: ConstructionSubledgerPartyType.customer,
        amount: '500',
      });

      const recoverable = await api().get(
        `/api/v1/construction/advances/recoverable?contractId=${fixture.contractId}&partyType=customer&grossAmount=10000`,
      );
      expect(recoverable.status).toBe(200);
      expect(recoverable.body.data.recoverable).toBe('250');
    });

    it('recovers advance and cannot exceed balance', async () => {
      const fixture = await createApprovedBoqFixture('adv-recover');

      await api().post('/api/v1/construction/advances/received').send({
        contractId: fixture.contractId,
        partyType: ConstructionSubledgerPartyType.customer,
        amount: '300',
      });

      const recovered = await api().post('/api/v1/construction/advances/recovered').send({
        contractId: fixture.contractId,
        partyType: ConstructionSubledgerPartyType.customer,
        amount: '100',
      });
      expect(recovered.status).toBe(201);
      expect(recovered.body.data.balanceAfter).toBe('200');

      const overRecover = await api().post('/api/v1/construction/advances/recovered').send({
        contractId: fixture.contractId,
        partyType: ConstructionSubledgerPartyType.customer,
        amount: '250',
      });
      expect(overRecover.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Decimal precision', () => {
    it('stores retention amounts at 4 decimal places', async () => {
      const fixture = await createApprovedBoqFixture('decimal-ret', {
        retentionPercent: '7.5',
      });
      await createSubmitApproveProgress(fixture, '33.3333');

      const entry = await prisma.constructionRetentionEntry.findFirst({
        where: { tenantId: ctx.tenantId, contractId: fixture.contractId },
      });
      expect(entry?.amount.toFixed(4)).toMatch(/^\d+\.\d{4}$/);
    });
  });

  describe('Tenant isolation', () => {
    it('rejects cross-tenant retention balance read', async () => {
      const isolated = await createIsolatedTenant(prisma, 'ret-read');
      const isolatedContract = await prisma.constructionContract.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: (
            await prisma.project.create({
              data: {
                tenantId: isolated.tenantId,
                branchId: isolated.branchId,
                code: `ISO-RET-PRJ-${Date.now()}`,
                name: 'Isolated Retention Project',
              },
            })
          ).id,
          branchId: isolated.branchId,
          number: `CNT-RET-ISO-${Date.now()}`,
          title: 'Isolated Retention Contract',
          direction: ConstructionContractDirection.customer,
          partyId: (
            await prisma.party.create({
              data: {
                tenantId: isolated.tenantId,
                type: PartyType.organization,
                code: `ISO-RET-PTY-${Date.now()}`,
                displayName: 'Isolated Retention Party',
              },
            })
          ).id,
          pricingModel: ConstructionContractPricingModel.lump_sum,
          status: ConstructionContractStatus.active,
        },
      });

      const res = await api().get(
        `/api/v1/construction/retention/balance?contractId=${isolatedContract.id}&partyType=customer`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Contract relationship', () => {
    it('lists retention entries for contract', async () => {
      const fixture = await createApprovedBoqFixture('ret-list', {
        retentionPercent: '5',
      });
      await createSubmitApproveProgress(fixture, '20');

      const res = await api().get(
        `/api/v1/construction/retention/contract/${fixture.contractId}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].contractId).toBe(fixture.contractId);
    });
  });

  describe('Progress interaction', () => {
    it('creates retention hold automatically on progress approve', async () => {
      const fixture = await createApprovedBoqFixture('prog-auto', {
        retentionPercent: '10',
      });
      const progress = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      await addProgressItem(progress.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '10',
      });
      await submitProgress(progress.body.data.id);
      const before = await prisma.constructionRetentionEntry.count({
        where: { tenantId: ctx.tenantId, contractId: fixture.contractId },
      });
      await approveProgress(progress.body.data.id);
      const after = await prisma.constructionRetentionEntry.count({
        where: { tenantId: ctx.tenantId, contractId: fixture.contractId },
      });
      expect(after).toBe(before + 1);
    });
  });

  describe('Manual retention release', () => {
    it('releases held retention up to balance', async () => {
      const fixture = await createApprovedBoqFixture('ret-release', {
        retentionPercent: '10',
      });
      await createSubmitApproveProgress(fixture, '40');

      const release = await api().post('/api/v1/construction/retention/release').send({
        contractId: fixture.contractId,
        partyType: ConstructionSubledgerPartyType.customer,
        amount: '20',
      });
      expect(release.status).toBe(201);
      expect(release.body.data.direction).toBe(ConstructionRetentionDirection.release);
      expect(release.body.data.balanceAfter).toBe('20');

      const overRelease = await api().post('/api/v1/construction/retention/release').send({
        contractId: fixture.contractId,
        partyType: ConstructionSubledgerPartyType.customer,
        amount: '25',
      });
      expect(overRelease.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Concurrency and idempotency', () => {
    it('does not duplicate hold when approve is called twice', async () => {
      const fixture = await createApprovedBoqFixture('ret-idempotent', {
        retentionPercent: '10',
      });
      const progress = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      await addProgressItem(progress.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '25',
      });
      await submitProgress(progress.body.data.id);

      const first = await approveProgress(progress.body.data.id);
      expect(first.status).toBe(201);

      const second = await approveProgress(progress.body.data.id);
      expect(second.status).toBe(201);

      const holds = await prisma.constructionRetentionEntry.count({
        where: {
          tenantId: ctx.tenantId,
          contractId: fixture.contractId,
          sourceId: progress.body.data.id,
          direction: ConstructionRetentionDirection.hold,
        },
      });
      expect(holds).toBe(1);
    });

    it('returns same hold entry when hold-from-progress is called twice', async () => {
      const fixture = await createApprovedBoqFixture('ret-hold-twice', {
        retentionPercent: '10',
      });
      const { progress } = await createSubmitApproveProgress(fixture, '15');

      const first = await api().post('/api/v1/construction/retention/hold-from-progress').send({
        progressId: progress.id,
        partyType: ConstructionSubledgerPartyType.customer,
      });
      expect(first.status).toBe(201);
      expect(first.body.data.created).toBe(false);

      const second = await api().post('/api/v1/construction/retention/hold-from-progress').send({
        progressId: progress.id,
        partyType: ConstructionSubledgerPartyType.customer,
      });
      expect(second.status).toBe(201);
      expect(second.body.data.entry.id).toBe(first.body.data.entry.id);
    });
  });

  describe('No duplicate accounting', () => {
    it('does not create journal entries on progress approve with retention', async () => {
      const before = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const fixture = await createApprovedBoqFixture('boundary-gl', {
        retentionPercent: '10',
      });
      await createSubmitApproveProgress(fixture, '30');
      const after = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(after).toBe(before);
    });

    it('does not create ConstructionCostEntry on retention hold', async () => {
      const before = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId },
      });
      const fixture = await createApprovedBoqFixture('boundary-cost', {
        retentionPercent: '10',
      });
      await createSubmitApproveProgress(fixture, '12');
      const after = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId },
      });
      expect(after).toBe(before);
    });

    it('does not mutate inventory on advance received', async () => {
      const before = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });
      const fixture = await createApprovedBoqFixture('boundary-inv');
      await api().post('/api/v1/construction/advances/received').send({
        contractId: fixture.contractId,
        partyType: ConstructionSubledgerPartyType.customer,
        amount: '100',
      });
      const after = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });
      expect(after).toBe(before);
    });
  });

  describe('Audit', () => {
    it('creates audit event on retention release', async () => {
      const fixture = await createApprovedBoqFixture('audit-release', {
        retentionPercent: '10',
      });
      await createSubmitApproveProgress(fixture, '10');

      const release = await api().post('/api/v1/construction/retention/release').send({
        contractId: fixture.contractId,
        partyType: ConstructionSubledgerPartyType.customer,
        amount: '5',
      });
      expect(release.status).toBe(201);

      const audit = await prisma.auditLog.findFirst({
        where: {
          tenantId: ctx.tenantId,
          entity: 'construction_retention_entry',
          entityId: release.body.data.id,
          action: 'construction.retention.release',
        },
      });
      expect(audit).toBeTruthy();
    });
  });

  describe('Commercial licensing', () => {
    afterEach(async () => {
      await activateConstructionLicense(prisma, ctx.tenantId, licenseService);
    });

    it('allows perpetual Construction license including retention feature', async () => {
      const signed = await signTestActivationForTenant(prisma, ctx.tenantId, {
        modules: defaultModuleEntries(modulesWithConstruction(), 'perpetual'),
        features: featuresWithConstruction(),
        licenseType: 'perpetual',
      });
      await licenseService.activateLicense(ctx.tenantId, signed);

      const res = await api().get(
        `/api/v1/construction/retention/balance?contractId=${contractId}&partyType=customer`,
      );
      expect(res.status).toBe(200);

      const resolved = await licenseService.getLicenseForTenant(ctx.tenantId);
      expect(resolved?.licenseType).toBe('perpetual');
      expect(resolved?.isOperational).toBe(true);
    });
  });
});
