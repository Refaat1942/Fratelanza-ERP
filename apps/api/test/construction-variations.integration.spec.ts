import type { INestApplication } from '@nestjs/common';
import {
  ConstructionBoqStatus,
  ConstructionContractDirection,
  ConstructionContractPricingModel,
  ConstructionContractStatus,
  ConstructionProgressStatus,
  ConstructionVariationStatus,
  ConstructionVariationType,
  PartyRoleType,
  PartyType,
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

describe('Construction variations (Phase 9.3)', () => {
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
      'VAR',
    );
    customerPartyId = customer.id;

    const contract = await createContract({ title: 'Shared Variation Contract' });
    contractId = contract.id;
    await activateContract(contractId);

    const boq = await createBoq(contractId, 'Shared approved BOQ');
    boqId = boq.id;

    const itemRes = await createBoqItem(boqId, {
      description: 'Shared variation line',
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

  function featuresWithProgressOnly() {
    return [
      ...DEMO_ENABLED_FEATURES,
      'construction.foundation',
      'construction.contracts',
      'construction.boq',
      'construction.progress',
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

  async function activateContract(targetContractId: string) {
    const res = await api()
      .post(`/api/v1/construction/contracts/${targetContractId}/status`)
      .send({ status: ConstructionContractStatus.active });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe(ConstructionContractStatus.active);
    return res.body.data;
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
        description: 'Variation BOQ line',
        plannedQuantity: '100',
        unitRate: '10',
        ...payload,
      });
  }

  async function approveBoq(targetBoqId: string) {
    return api().post(`/api/v1/construction/boqs/${targetBoqId}/approve`);
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
    const approveRes = await approveBoq(boq.id);
    expect(approveRes.status).toBe(201);
    return {
      contractId: contract.id,
      boqId: boq.id,
      boqItemId: itemRes.body.data.id as string,
    };
  }

  async function createVariation(
    overrides: {
      contractId?: string;
      boqId?: string;
      title?: string;
      description?: string;
      notes?: string;
    } = {},
  ) {
    return api().post('/api/v1/construction/variations').send({
      contractId: overrides.contractId ?? contractId,
      boqId: overrides.boqId ?? boqId,
      title: overrides.title ?? `Variation ${Date.now()}`,
      description: overrides.description,
      notes: overrides.notes,
    });
  }

  async function addVariationItem(
    variationId: string,
    payload: {
      variationType: ConstructionVariationType;
      boqItemId?: string;
      quantityDelta?: string;
      rateDelta?: string;
      lumpSumAmount?: string;
      description?: string;
      lineNumber?: number;
    },
  ) {
    return api()
      .post(`/api/v1/construction/variations/${variationId}/items`)
      .send(payload);
  }

  async function submitVariation(variationId: string) {
    return api().post(`/api/v1/construction/variations/${variationId}/submit`);
  }

  async function approveVariation(variationId: string) {
    return api().post(`/api/v1/construction/variations/${variationId}/approve`);
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
    payload: {
      boqItemId: string;
      currentPeriodQuantity: string;
    },
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

  async function createSubmitApproveVariation(
    fixture: { contractId: string; boqId: string; boqItemId: string },
    itemPayload: {
      variationType: ConstructionVariationType;
      quantityDelta?: string;
      rateDelta?: string;
      lumpSumAmount?: string;
      description?: string;
    },
  ) {
    const variation = await createVariation({
      contractId: fixture.contractId,
      boqId: fixture.boqId,
      title: `Auto ${Date.now()}`,
    });
    expect(variation.status).toBe(201);

    const item = await addVariationItem(variation.body.data.id, {
      boqItemId: fixture.boqItemId,
      ...itemPayload,
    });
    expect(item.status).toBe(201);

    await submitVariation(variation.body.data.id);
    const approved = await approveVariation(variation.body.data.id);
    expect(approved.status).toBe(201);
    return { variation: variation.body.data, item: item.body.data };
  }

  describe('Licensing', () => {
    afterEach(async () => {
      await activateConstructionLicense(prisma, ctx.tenantId, licenseService);
    });

    it('rejects construction.variations when feature is not licensed', async () => {
      const signed = await signTestActivationForTenant(prisma, ctx.tenantId, {
        modules: defaultModuleEntries(modulesWithConstruction(), 'perpetual'),
        features: featuresWithProgressOnly(),
      });
      await licenseService.activateLicense(ctx.tenantId, signed);

      const res = await api().get('/api/v1/construction/variations');
      expect(res.status).toBe(403);
    });

    it('allows licensed and authorized access', async () => {
      const res = await api().get('/api/v1/construction/variations');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('RBAC', () => {
    it('rejects licensed user without variations RBAC permission', async () => {
      const role = await prisma.role.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'Progress Only',
          code: `progress-only-${Date.now()}`,
        },
      });
      const progressPerms = await prisma.permission.findMany({
        where: {
          module: 'construction',
          feature: { in: ['foundation', 'contracts', 'boq', 'progress'] },
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
          email: `progress-only-${Date.now()}@fratelanza.local`,
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

      const variationRes = await api(token).get('/api/v1/construction/variations');
      expect(variationRes.status).toBe(403);
    });
  });

  describe('Create variation header', () => {
    it('creates a draft variation bound to contract and approved BOQ', async () => {
      const res = await createVariation({
        title: 'Extra foundation work',
        description: 'Additional excavation',
        notes: 'Client request #42',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe(ConstructionVariationStatus.draft);
      expect(res.body.data.number).toMatch(/^VAR-/);
      expect(res.body.data.contractId).toBe(contractId);
      expect(res.body.data.boqId).toBe(boqId);
      expect(res.body.data.projectId).toBe(projectId);
      expect(res.body.data.title).toBe('Extra foundation work');
      expect(res.body.data.description).toBe('Additional excavation');
      expect(res.body.data.notes).toBe('Client request #42');
    });

    it('lists variations for the tenant', async () => {
      const created = await createVariation({ title: 'Listable variation' });
      expect(created.status).toBe(201);

      const list = await api().get('/api/v1/construction/variations');
      expect(list.status).toBe(200);
      expect(
        list.body.data.some((row: { id: string }) => row.id === created.body.data.id),
      ).toBe(true);
    });
  });

  describe('Tenant isolation', () => {
    it('rejects cross-tenant variation read', async () => {
      const isolated = await createIsolatedTenant(prisma, 'var-read');
      const isolatedProject = await prisma.project.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `ISO-VAR-PRJ-${Date.now()}`,
          name: 'Isolated Variation Project',
        },
      });
      await prisma.constructionProjectProfile.create({
        data: { tenantId: isolated.tenantId, projectId: isolatedProject.id },
      });
      const isolatedParty = await prisma.party.create({
        data: {
          tenantId: isolated.tenantId,
          type: PartyType.organization,
          code: `ISO-VAR-PTY-${Date.now()}`,
          displayName: 'Isolated Variation Party',
        },
      });
      const isolatedContract = await prisma.constructionContract.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: isolatedProject.id,
          branchId: isolated.branchId,
          number: `CNT-VAR-ISO-${Date.now()}`,
          title: 'Isolated Variation Contract',
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
          number: `BOQ-VAR-ISO-${Date.now()}`,
          revisionNumber: 1,
          status: ConstructionBoqStatus.approved,
        },
      });
      const isolatedVariation = await prisma.constructionVariation.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: isolatedProject.id,
          branchId: isolated.branchId,
          contractId: isolatedContract.id,
          boqId: isolatedBoq.id,
          number: `VAR-ISO-${Date.now()}`,
          title: 'Isolated Variation',
        },
      });

      const res = await api().get(
        `/api/v1/construction/variations/${isolatedVariation.id}`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('BOQ revision binding', () => {
    it('rejects variation when boqId belongs to a different contract', async () => {
      const other = await createApprovedBoqFixture('wrong-boq');

      const res = await createVariation({
        contractId,
        boqId: other.boqId,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects variation when BOQ revision is not approved', async () => {
      const contract = await createContract({ title: 'Draft BOQ Contract' });
      await activateContract(contract.id);
      const draftBoq = await createBoq(contract.id, 'Draft only');

      const res = await createVariation({
        contractId: contract.id,
        boqId: draftBoq.id,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects variation item when boqItemId is outside the variation BOQ revision', async () => {
      const fixture = await createApprovedBoqFixture('item-binding');
      const variation = await createVariation({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      expect(variation.status).toBe(201);

      const res = await addVariationItem(variation.body.data.id, {
        variationType: ConstructionVariationType.quantity_change,
        boqItemId: boqItemId,
        quantityDelta: '5',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('No historical BOQ mutation', () => {
    it('keeps BOQ item plannedQuantity unchanged after variation approve', async () => {
      const fixture = await createApprovedBoqFixture('no-boq-mutation', {
        plannedQuantity: '100',
        unitRate: '10',
      });

      const before = await prisma.constructionBoqItem.findUnique({
        where: { id: fixture.boqItemId },
      });
      expect(before?.plannedQuantity.toString()).toBe('100');

      await createSubmitApproveVariation(fixture, {
        variationType: ConstructionVariationType.quantity_change,
        quantityDelta: '20',
      });

      const after = await prisma.constructionBoqItem.findUnique({
        where: { id: fixture.boqItemId },
      });
      expect(after?.plannedQuantity.toString()).toBe('100');
    });
  });

  describe('Quantity delta and amount calculation', () => {
    it('stores quantity delta on variation item', async () => {
      const fixture = await createApprovedBoqFixture('qty-delta');
      const variation = await createVariation({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      expect(variation.status).toBe(201);

      const item = await addVariationItem(variation.body.data.id, {
        variationType: ConstructionVariationType.quantity_change,
        boqItemId: fixture.boqItemId,
        quantityDelta: '20',
      });
      expect(item.status).toBe(201);
      expect(item.body.data.quantityDelta).toBe('20');
    });

    it('calculates amount delta as quantity × BOQ unit rate', async () => {
      const fixture = await createApprovedBoqFixture('amount-delta', {
        plannedQuantity: '100',
        unitRate: '10',
      });
      const variation = await createVariation({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      expect(variation.status).toBe(201);

      const item = await addVariationItem(variation.body.data.id, {
        variationType: ConstructionVariationType.quantity_change,
        boqItemId: fixture.boqItemId,
        quantityDelta: '20',
      });
      expect(item.status).toBe(201);
      expect(item.body.data.amountDelta).toBe('200');

      const header = await api().get(
        `/api/v1/construction/variations/${variation.body.data.id}`,
      );
      expect(header.status).toBe(200);
      expect(header.body.data.totalAmountDelta).toBe('200');
    });
  });

  describe('Variation types', () => {
    it('supports rate_change with amount = plannedQuantity × rateDelta', async () => {
      const fixture = await createApprovedBoqFixture('rate-change', {
        plannedQuantity: '100',
        unitRate: '10',
      });
      const variation = await createVariation({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
        title: 'Rate adjustment',
      });
      expect(variation.status).toBe(201);

      const item = await addVariationItem(variation.body.data.id, {
        variationType: ConstructionVariationType.rate_change,
        boqItemId: fixture.boqItemId,
        rateDelta: '2',
      });
      expect(item.status).toBe(201);
      expect(item.body.data.rateDelta).toBe('2');
      expect(item.body.data.amountDelta).toBe('200');
    });

    it('supports lump_sum with explicit lump sum amount', async () => {
      const fixture = await createApprovedBoqFixture('lump-sum');
      const variation = await createVariation({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
        title: 'Mobilization allowance',
      });
      expect(variation.status).toBe(201);

      const item = await addVariationItem(variation.body.data.id, {
        variationType: ConstructionVariationType.lump_sum,
        lumpSumAmount: '1500',
        description: 'Site mobilization',
      });
      expect(item.status).toBe(201);
      expect(item.body.data.lumpSumAmount).toBe('1500');
      expect(item.body.data.amountDelta).toBe('1500');
    });
  });

  describe('Lifecycle', () => {
    it('supports draft → submit → approve', async () => {
      const fixture = await createApprovedBoqFixture('lifecycle-approve');
      const variation = await createVariation({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      expect(variation.body.data.status).toBe(ConstructionVariationStatus.draft);

      await addVariationItem(variation.body.data.id, {
        variationType: ConstructionVariationType.quantity_change,
        boqItemId: fixture.boqItemId,
        quantityDelta: '10',
      });

      const submitted = await submitVariation(variation.body.data.id);
      expect(submitted.status).toBe(201);
      expect(submitted.body.data.status).toBe(ConstructionVariationStatus.submitted);

      const approved = await approveVariation(variation.body.data.id);
      expect(approved.status).toBe(201);
      expect(approved.body.data.status).toBe(ConstructionVariationStatus.approved);
      expect(approved.body.data.approvedAt).toBeTruthy();
    });

    it('supports reject → reopen → draft', async () => {
      const fixture = await createApprovedBoqFixture('lifecycle-reject');
      const variation = await createVariation({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      await addVariationItem(variation.body.data.id, {
        variationType: ConstructionVariationType.quantity_change,
        boqItemId: fixture.boqItemId,
        quantityDelta: '8',
      });
      await submitVariation(variation.body.data.id);

      const rejected = await api()
        .post(`/api/v1/construction/variations/${variation.body.data.id}/reject`)
        .send({ reason: 'Missing client sign-off' });
      expect(rejected.status).toBe(201);
      expect(rejected.body.data.status).toBe(ConstructionVariationStatus.rejected);
      expect(rejected.body.data.rejectionReason).toBe('Missing client sign-off');

      const reopened = await api().post(
        `/api/v1/construction/variations/${variation.body.data.id}/reopen`,
      );
      expect(reopened.status).toBe(201);
      expect(reopened.body.data.status).toBe(ConstructionVariationStatus.draft);
      expect(reopened.body.data.rejectionReason).toBeNull();
    });
  });

  describe('Approved variation immutability', () => {
    it('rejects updating variation items after approval', async () => {
      const fixture = await createApprovedBoqFixture('approved-immutable');
      const variation = await createVariation({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      const item = await addVariationItem(variation.body.data.id, {
        variationType: ConstructionVariationType.quantity_change,
        boqItemId: fixture.boqItemId,
        quantityDelta: '6',
      });
      expect(item.status).toBe(201);

      await submitVariation(variation.body.data.id);
      await approveVariation(variation.body.data.id);

      const res = await api()
        .patch(`/api/v1/construction/variations/items/${item.body.data.id}`)
        .send({ quantityDelta: '7' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Progress effective quantity', () => {
    it('allows progress above original planned qty after approved +20 variation', async () => {
      const fixture = await createApprovedBoqFixture('effective-qty', {
        plannedQuantity: '100',
        unitRate: '10',
      });

      const progressOverOriginal = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      expect(progressOverOriginal.status).toBe(201);
      const overItem = await addProgressItem(progressOverOriginal.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '105',
      });
      expect(overItem.status).toBeGreaterThanOrEqual(400);

      await createSubmitApproveVariation(fixture, {
        variationType: ConstructionVariationType.quantity_change,
        quantityDelta: '20',
      });

      const progressWithinNewLimit = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      expect(progressWithinNewLimit.status).toBe(201);
      const withinItem = await addProgressItem(progressWithinNewLimit.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '115',
      });
      expect(withinItem.status).toBe(201);
      expect(withinItem.body.data.cumulativeQuantity).toBe('115');

      const progressBeyondNewLimit = await createProgress({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      expect(progressBeyondNewLimit.status).toBe(201);
      const beyondItem = await addProgressItem(progressBeyondNewLimit.body.data.id, {
        boqItemId: fixture.boqItemId,
        currentPeriodQuantity: '121',
      });
      expect(beyondItem.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Contract revised value', () => {
    it('updates contract revisedValue on variation approve', async () => {
      const fixture = await createApprovedBoqFixture('revised-value', {
        plannedQuantity: '100',
        unitRate: '10',
      });

      const contractBefore = await prisma.constructionContract.findUnique({
        where: { id: fixture.contractId },
      });
      expect(contractBefore?.originalValue.toString()).toBe('1000');
      expect(contractBefore?.revisedValue?.toString() ?? '1000').toBe('1000');

      await createSubmitApproveVariation(fixture, {
        variationType: ConstructionVariationType.quantity_change,
        quantityDelta: '20',
      });

      const contractAfter = await prisma.constructionContract.findUnique({
        where: { id: fixture.contractId },
      });
      expect(contractAfter?.revisedValue?.toString()).toBe('1200');
    });
  });

  describe('Concurrency and idempotency', () => {
    it('returns approved variation when approve is called twice', async () => {
      const fixture = await createApprovedBoqFixture('idempotent-approve');
      const variation = await createVariation({
        contractId: fixture.contractId,
        boqId: fixture.boqId,
      });
      await addVariationItem(variation.body.data.id, {
        variationType: ConstructionVariationType.quantity_change,
        boqItemId: fixture.boqItemId,
        quantityDelta: '12',
      });
      await submitVariation(variation.body.data.id);

      const first = await approveVariation(variation.body.data.id);
      expect(first.status).toBe(201);
      expect(first.body.data.status).toBe(ConstructionVariationStatus.approved);

      const second = await approveVariation(variation.body.data.id);
      expect(second.status).toBe(201);
      expect(second.body.data.status).toBe(ConstructionVariationStatus.approved);
      expect(second.body.data.id).toBe(first.body.data.id);
    });
  });

  describe('Audit', () => {
    it('creates audit event on variation approve', async () => {
      const fixture = await createApprovedBoqFixture('audit-approve');
      const { variation } = await createSubmitApproveVariation(fixture, {
        variationType: ConstructionVariationType.quantity_change,
        quantityDelta: '5',
      });

      const audit = await prisma.auditLog.findFirst({
        where: {
          tenantId: ctx.tenantId,
          entity: 'construction_variation',
          entityId: variation.id,
          action: 'construction.variation.approved',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).toBeTruthy();
    });
  });

  describe('Boundaries', () => {
    it('does not create journal entries on variation approve', async () => {
      const before = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const fixture = await createApprovedBoqFixture('boundary-gl');
      await createSubmitApproveVariation(fixture, {
        variationType: ConstructionVariationType.quantity_change,
        quantityDelta: '15',
      });

      const after = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(after).toBe(before);
    });

    it('does not mutate inventory on variation approve', async () => {
      const before = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });
      const fixture = await createApprovedBoqFixture('boundary-inv');
      await createSubmitApproveVariation(fixture, {
        variationType: ConstructionVariationType.quantity_change,
        quantityDelta: '9',
      });

      const after = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });
      expect(after).toBe(before);
    });

    it('does not create ConstructionCostEntry on variation approve', async () => {
      const before = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId },
      });
      const fixture = await createApprovedBoqFixture('boundary-cost');
      await createSubmitApproveVariation(fixture, {
        variationType: ConstructionVariationType.quantity_change,
        quantityDelta: '11',
      });

      const after = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId },
      });
      expect(after).toBe(before);
    });
  });

  describe('Commercial licensing', () => {
    afterEach(async () => {
      await activateConstructionLicense(prisma, ctx.tenantId, licenseService);
    });

    it('allows perpetual Construction license including variations feature', async () => {
      const signed = await signTestActivationForTenant(prisma, ctx.tenantId, {
        modules: defaultModuleEntries(modulesWithConstruction(), 'perpetual'),
        features: featuresWithConstruction(),
        licenseType: 'perpetual',
      });
      await licenseService.activateLicense(ctx.tenantId, signed);

      const res = await api().get('/api/v1/construction/variations');
      expect(res.status).toBe(200);

      const resolved = await licenseService.getLicenseForTenant(ctx.tenantId);
      expect(resolved?.licenseType).toBe('perpetual');
      expect(resolved?.isOperational).toBe(true);
    });
  });
});
