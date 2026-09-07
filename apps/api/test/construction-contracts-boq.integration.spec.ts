import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import {
  ConstructionContractDirection,
  ConstructionContractPricingModel,
  ConstructionContractStatus,
  ConstructionBoqStatus,
  PartyRoleType,
  PartyType,
} from '../../../packages/database/generated/server';
import { LicenseService } from '../src/modules/license/license.service';
import { PrismaService } from '../src/database/prisma.service';
import { PartiesService } from '../src/modules/parties/parties.service';
import { DEMO_ENABLED_MODULES } from '../src/modules/license/catalog/module-catalog';
import { defaultModuleEntries } from '../src/modules/license/verification/license-verifier.interface';
import {
  activateConstructionLicense,
  createPartyWithRole,
  createUniversalProject,
  enableConstructionProfile,
  featuresWithConstruction,
  featuresWithConstructionFoundationOnly,
  featuresWithContractsOnly,
  loadConstructionTestContext,
  modulesWithConstruction,
} from './construction-test.helpers';
import { signTestActivationForTenant } from './license-test.helpers';
import { createIsolatedTenant } from './pms-test.helpers';
import { createTestApp, request } from './test-app';

describe('Construction contracts + BOQ (Phase 9.1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let licenseService: LicenseService;
  let ctx: Awaited<ReturnType<typeof loadConstructionTestContext>>;
  let adminUserId: string;
  let projectId: string;
  let costCenterId: string;
  let productId: string;
  let unitId: string;
  let customerPartyId: string;
  let subcontractorPartyId: string;
  let sharedCustomerContractId: string;

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
        code: `CC-CNT-${Date.now()}`,
        name: 'BOQ Cost Center',
        projectId,
      });
    expect(cc.status).toBe(201);
    costCenterId = cc.body.data.id;

    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Authorization', `Bearer ${ctx.accessToken}`);
    unitId = units.body.data[0].id;

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        sku: `BOQ-PRD-${Date.now()}`,
        name: 'BOQ Test Product',
        unitId,
        salePrice: 100,
        costPrice: 50,
        trackInventory: true,
      });
    expect(productRes.status).toBe(201);
    productId = productRes.body.data.id;

    const customer = await createPartyWithRole(
      app,
      ctx.tenantId,
      adminUserId,
      PartyRoleType.customer,
      'CUST',
    );
    customerPartyId = customer.id;

    const subcontractor = await createPartyWithRole(
      app,
      ctx.tenantId,
      adminUserId,
      PartyRoleType.subcontractor,
      'SUB',
    );
    subcontractorPartyId = subcontractor.id;

    const sharedContract = await createContract({
      title: 'Shared Licensing Contract',
      direction: ConstructionContractDirection.customer,
      partyId: customerPartyId,
    });
    sharedCustomerContractId = sharedContract.id;
  });

  afterAll(async () => {
    await licenseService.seedDemoLicense(ctx.tenantId);
    await app.close();
  });

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

  async function createBoq(contractId: string, notes?: string) {
    const res = await api()
      .post(`/api/v1/construction/contracts/${contractId}/boqs`)
      .send({ notes });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; revisionNumber: number; status: string };
  }

  async function createBoqItem(
    boqId: string,
    payload: Record<string, unknown> = {},
  ) {
    const res = await api()
      .post(`/api/v1/construction/boqs/${boqId}/items`)
      .send({
        description: 'Test BOQ line',
        plannedQuantity: '10',
        unitRate: '25',
        ...payload,
      });
    return res;
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

  describe('Licensing', () => {
    afterEach(async () => {
      await activateConstructionLicense(prisma, ctx.tenantId, licenseService);
    });

    it('rejects construction.contracts when feature is not licensed', async () => {
      const signed = await signTestActivationForTenant(prisma, ctx.tenantId, {
        modules: defaultModuleEntries(modulesWithConstruction(), 'perpetual'),
        features: featuresWithConstructionFoundationOnly(),
      });
      await licenseService.activateLicense(ctx.tenantId, signed);

      const res = await api().get('/api/v1/construction/contracts');
      expect(res.status).toBe(403);
    });

    it('rejects construction.boq when feature is not licensed', async () => {
      const signed = await signTestActivationForTenant(prisma, ctx.tenantId, {
        modules: defaultModuleEntries(modulesWithConstruction(), 'perpetual'),
        features: featuresWithContractsOnly(),
      });
      await licenseService.activateLicense(ctx.tenantId, signed);

      const res = await api().get(
        `/api/v1/construction/contracts/${sharedCustomerContractId}/boqs`,
      );
      expect(res.status).toBe(403);
    });

    it('allows licensed and authorized access', async () => {
      const res = await api().get('/api/v1/construction/contracts');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('rejects licensed user without BOQ RBAC permission', async () => {
      const role = await prisma.role.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'Contracts Only',
          code: `cnt-only-${Date.now()}`,
        },
      });
      const contractPerms = await prisma.permission.findMany({
        where: { module: 'construction', feature: 'contracts' },
      });
      for (const perm of contractPerms) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: perm.id },
        });
      }
      const user = await prisma.user.create({
        data: {
          tenantId: ctx.tenantId,
          email: `cnt-only-${Date.now()}@fratelanza.local`,
          passwordHash: await hashPassword('Admin@123456'),
          firstName: 'Contracts',
          lastName: 'Only',
          roleId: role.id,
          isActive: true,
        },
      });
      const token = await loginAsUser(user.email);

      const contractsRes = await api(token).get('/api/v1/construction/contracts');
      expect(contractsRes.status).toBe(200);

      const boqRes = await api(token).get(
        `/api/v1/construction/contracts/${sharedCustomerContractId}/boqs`,
      );
      expect(boqRes.status).toBe(403);
    });
  });

  describe('Contracts', () => {
    it('creates a customer contract', async () => {
      const contract = await createContract({
        direction: ConstructionContractDirection.customer,
        partyId: customerPartyId,
        title: 'Customer Main Works',
        pricingModel: ConstructionContractPricingModel.lump_sum,
      });
      expect(contract.status).toBe(ConstructionContractStatus.draft);
      expect(contract.number).toMatch(/^CNT-/);
    });

    it('creates a subcontractor contract', async () => {
      const contract = await createContract({
        direction: ConstructionContractDirection.subcontractor,
        partyId: subcontractorPartyId,
        title: 'Subcontractor Earthworks',
        pricingModel: ConstructionContractPricingModel.unit_price,
      });
      expect(contract.status).toBe(ConstructionContractStatus.draft);
    });

    it('rejects customer contract when party lacks customer role', async () => {
      const parties = app.get(PartiesService);
      const party = await parties.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-NOCUST-${Date.now()}`,
        displayName: 'No Customer Role Party',
      });

      const res = await api().post('/api/v1/construction/contracts').send({
        projectId,
        title: 'Invalid Customer Contract',
        direction: ConstructionContractDirection.customer,
        partyId: party.id,
        pricingModel: ConstructionContractPricingModel.lump_sum,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects subcontractor contract when party lacks subcontractor role', async () => {
      const parties = app.get(PartiesService);
      const party = await parties.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-NOSUB-${Date.now()}`,
        displayName: 'No Subcontractor Role Party',
      });

      const res = await api().post('/api/v1/construction/contracts').send({
        projectId,
        title: 'Invalid Subcontractor Contract',
        direction: ConstructionContractDirection.subcontractor,
        partyId: party.id,
        pricingModel: ConstructionContractPricingModel.cost_plus,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects cross-tenant contract read', async () => {
      const isolated = await createIsolatedTenant(prisma, 'cnt-read');
      const isolatedProject = await prisma.project.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `ISO-PRJ-${Date.now()}`,
          name: 'Isolated Project',
        },
      });
      await prisma.constructionProjectProfile.create({
        data: { tenantId: isolated.tenantId, projectId: isolatedProject.id },
      });
      const isolatedParty = await prisma.party.create({
        data: {
          tenantId: isolated.tenantId,
          type: PartyType.organization,
          code: `ISO-PTY-${Date.now()}`,
          displayName: 'Isolated Party',
        },
      });
      const isolatedContract = await prisma.constructionContract.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: isolatedProject.id,
          branchId: isolated.branchId,
          number: `CNT-ISO-${Date.now()}`,
          title: 'Isolated Contract',
          direction: ConstructionContractDirection.customer,
          partyId: isolatedParty.id,
          pricingModel: ConstructionContractPricingModel.lump_sum,
        },
      });

      const res = await api().get(
        `/api/v1/construction/contracts/${isolatedContract.id}`,
      );
      expect(res.status).toBe(404);
    });

    it('prevents duplicate contract numbers under concurrency', async () => {
      const payload = {
        projectId,
        title: 'Concurrent Contract',
        direction: ConstructionContractDirection.customer,
        partyId: customerPartyId,
        pricingModel: ConstructionContractPricingModel.lump_sum,
      };
      const [first, second] = await Promise.all([
        api().post('/api/v1/construction/contracts').send({
          ...payload,
          title: 'Concurrent Contract A',
        }),
        api().post('/api/v1/construction/contracts').send({
          ...payload,
          title: 'Concurrent Contract B',
        }),
      ]);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.data.number).not.toBe(second.body.data.number);

      const numbers = [first.body.data.number, second.body.data.number];
      const count = await prisma.constructionContract.count({
        where: { tenantId: ctx.tenantId, number: { in: numbers } },
      });
      expect(count).toBe(2);
    });

    it('supports lifecycle transitions draft→active→suspended→active→completed→archived', async () => {
      const contract = await createContract({ title: 'Lifecycle Contract' });

      const toActive = await api()
        .post(`/api/v1/construction/contracts/${contract.id}/status`)
        .send({ status: ConstructionContractStatus.active });
      expect(toActive.status).toBe(201);
      expect(toActive.body.data.status).toBe(ConstructionContractStatus.active);

      const toSuspended = await api()
        .post(`/api/v1/construction/contracts/${contract.id}/status`)
        .send({ status: ConstructionContractStatus.suspended });
      expect(toSuspended.status).toBe(201);
      expect(toSuspended.body.data.status).toBe(ConstructionContractStatus.suspended);

      const reactivate = await api()
        .post(`/api/v1/construction/contracts/${contract.id}/status`)
        .send({ status: ConstructionContractStatus.active });
      expect(reactivate.status).toBe(201);
      expect(reactivate.body.data.status).toBe(ConstructionContractStatus.active);

      const toCompleted = await api()
        .post(`/api/v1/construction/contracts/${contract.id}/status`)
        .send({ status: ConstructionContractStatus.completed });
      expect(toCompleted.status).toBe(201);
      expect(toCompleted.body.data.status).toBe(ConstructionContractStatus.completed);

      const toArchived = await api()
        .post(`/api/v1/construction/contracts/${contract.id}/archive`);
      expect(toArchived.status).toBe(201);
      expect(toArchived.body.data.status).toBe(ConstructionContractStatus.archived);
    });

    it('rejects mutations on archived contracts', async () => {
      const contract = await createContract({ title: 'Archive Mutation Contract' });
      await api()
        .post(`/api/v1/construction/contracts/${contract.id}/status`)
        .send({ status: ConstructionContractStatus.active });
      await api()
        .post(`/api/v1/construction/contracts/${contract.id}/status`)
        .send({ status: ConstructionContractStatus.completed });
      await api().post(`/api/v1/construction/contracts/${contract.id}/archive`);

      const res = await api()
        .patch(`/api/v1/construction/contracts/${contract.id}`)
        .send({ title: 'Should Not Update' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('BOQ', () => {
    it('creates a BOQ for a contract', async () => {
      const contract = await createContract({ title: 'BOQ Create Contract' });
      const boq = await createBoq(contract.id, 'Initial BOQ');
      expect(boq.status).toBe(ConstructionBoqStatus.draft);
      expect(boq.revisionNumber).toBe(1);
    });

    it('rejects cross-tenant BOQ read', async () => {
      const isolated = await createIsolatedTenant(prisma, 'boq-read');
      const isolatedProject = await prisma.project.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `ISO-BOQ-PRJ-${Date.now()}`,
          name: 'Isolated BOQ Project',
        },
      });
      await prisma.constructionProjectProfile.create({
        data: { tenantId: isolated.tenantId, projectId: isolatedProject.id },
      });
      const isolatedParty = await prisma.party.create({
        data: {
          tenantId: isolated.tenantId,
          type: PartyType.organization,
          code: `ISO-BOQ-PTY-${Date.now()}`,
          displayName: 'Isolated BOQ Party',
        },
      });
      const isolatedContract = await prisma.constructionContract.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: isolatedProject.id,
          branchId: isolated.branchId,
          number: `CNT-BOQ-ISO-${Date.now()}`,
          title: 'Isolated BOQ Contract',
          direction: ConstructionContractDirection.customer,
          partyId: isolatedParty.id,
          pricingModel: ConstructionContractPricingModel.lump_sum,
        },
      });
      const isolatedBoq = await prisma.constructionBoq.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: isolatedProject.id,
          contractId: isolatedContract.id,
          number: `BOQ-ISO-${Date.now()}`,
          revisionNumber: 1,
        },
      });

      const res = await api().get(`/api/v1/construction/boqs/${isolatedBoq.id}`);
      expect(res.status).toBe(404);
    });

    it('requires a valid contract (project + profile + contract)', async () => {
      const res = await api()
        .post(`/api/v1/construction/contracts/${randomUUID()}/boqs`)
        .send({});
      expect(res.status).toBe(404);
    });

    it('creates a BOQ section', async () => {
      const contract = await createContract({ title: 'Section Contract' });
      const boq = await createBoq(contract.id);

      const res = await api()
        .post(`/api/v1/construction/boqs/${boq.id}/sections`)
        .send({ code: '01', name: 'Earthworks', sequence: 1 });
      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe('01');
      expect(res.body.data.name).toBe('Earthworks');
    });

    it('creates a BOQ item', async () => {
      const contract = await createContract({ title: 'Item Contract' });
      const boq = await createBoq(contract.id);

      const res = await createBoqItem(boq.id, { lineNumber: 1 });
      expect(res.status).toBe(201);
      expect(res.body.data.description).toBe('Test BOQ line');
    });

    it('calculates item total as quantity × rate', async () => {
      const contract = await createContract({ title: 'Total Contract' });
      const boq = await createBoq(contract.id);

      const res = await createBoqItem(boq.id, {
        plannedQuantity: '5',
        unitRate: '120.5',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.originalAmount).toBe('602.5');
    });

    it('preserves decimal precision for quantity × rate', async () => {
      const contract = await createContract({ title: 'Decimal Contract' });
      const boq = await createBoq(contract.id);

      const res = await createBoqItem(boq.id, {
        plannedQuantity: '3',
        unitRate: '1.3333',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.originalAmount).toBe('3.9999');
    });

    it('accepts optional product reference', async () => {
      const contract = await createContract({ title: 'Product Contract' });
      const boq = await createBoq(contract.id);

      const res = await createBoqItem(boq.id, { productId });
      expect(res.status).toBe(201);
      expect(res.body.data.productId).toBe(productId);
    });

    it('accepts optional cost center reference', async () => {
      const contract = await createContract({ title: 'CC Contract' });
      const boq = await createBoq(contract.id);

      const res = await createBoqItem(boq.id, { costCenterId });
      expect(res.status).toBe(201);
      expect(res.body.data.costCenterId).toBe(costCenterId);
    });

    it('rejects invalid product reference', async () => {
      const contract = await createContract({ title: 'Bad Product Contract' });
      const boq = await createBoq(contract.id);

      const res = await createBoqItem(boq.id, { productId: randomUUID() });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects invalid cost center reference', async () => {
      const contract = await createContract({ title: 'Bad CC Contract' });
      const boq = await createBoq(contract.id);

      const res = await createBoqItem(boq.id, { costCenterId: randomUUID() });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects cross-tenant product and cost center references', async () => {
      const isolated = await createIsolatedTenant(prisma, 'boq-ref');
      const isolatedProduct = await prisma.product.create({
        data: {
          tenantId: isolated.tenantId,
          sku: `ISO-SKU-${Date.now()}`,
          name: 'Isolated Product',
          unitId,
          salePrice: 10,
          costPrice: 5,
        },
      });
      const isolatedCc = await prisma.costCenter.create({
        data: {
          tenantId: isolated.tenantId,
          code: `ISO-CC-${Date.now()}`,
          name: 'Isolated CC',
        },
      });

      const contract = await createContract({ title: 'Cross-Tenant Ref Contract' });
      const boq = await createBoq(contract.id);

      const productRes = await createBoqItem(boq.id, {
        productId: isolatedProduct.id,
      });
      expect(productRes.status).toBeGreaterThanOrEqual(400);

      const ccRes = await createBoqItem(boq.id, {
        costCenterId: isolatedCc.id,
      });
      expect(ccRes.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Revision', () => {
    it('allows editing draft BOQ items', async () => {
      const contract = await createContract({ title: 'Draft Edit Contract' });
      const boq = await createBoq(contract.id);
      const item = await createBoqItem(boq.id);
      expect(item.status).toBe(201);

      const res = await api()
        .patch(`/api/v1/construction/boq-items/${item.body.data.id}`)
        .send({ description: 'Updated draft line' });
      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('Updated draft line');
    });

    it('rejects patching items on approved BOQ', async () => {
      const contract = await createContract({ title: 'Approved Immutable Contract' });
      const boq = await createBoq(contract.id);
      const item = await createBoqItem(boq.id);
      await api().post(`/api/v1/construction/boqs/${boq.id}/approve`);

      const res = await api()
        .patch(`/api/v1/construction/boq-items/${item.body.data.id}`)
        .send({ description: 'Should fail' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('creates a new revision from approved BOQ', async () => {
      const contract = await createContract({ title: 'Revise Contract' });
      const boq = await createBoq(contract.id);
      await createBoqItem(boq.id);
      await api().post(`/api/v1/construction/boqs/${boq.id}/approve`);

      const res = await api().post(`/api/v1/construction/boqs/${boq.id}/revise`);
      expect(res.status).toBe(201);
      expect(res.body.data.revisionNumber).toBe(2);
      expect(res.body.data.status).toBe(ConstructionBoqStatus.draft);
      expect(res.body.data.supersedesBoqId ?? res.body.data.supersedes?.id).toBeTruthy();
    });

    it('keeps superseded revision readable', async () => {
      const contract = await createContract({ title: 'Superseded Read Contract' });
      const boq = await createBoq(contract.id);
      await createBoqItem(boq.id);
      await api().post(`/api/v1/construction/boqs/${boq.id}/approve`);

      const revision = await api().post(`/api/v1/construction/boqs/${boq.id}/revise`);
      expect(revision.status).toBe(201);
      await api().post(`/api/v1/construction/boqs/${revision.body.data.id}/approve`);

      const original = await api().get(`/api/v1/construction/boqs/${boq.id}`);
      expect(original.status).toBe(200);
      expect(original.body.data.status).toBe(ConstructionBoqStatus.superseded);
    });

    it('assigns deterministic revision numbers (rev 2 after rev 1)', async () => {
      const contract = await createContract({ title: 'Rev Number Contract' });
      const rev1 = await createBoq(contract.id);
      expect(rev1.revisionNumber).toBe(1);

      await createBoqItem(rev1.id);
      await api().post(`/api/v1/construction/boqs/${rev1.id}/approve`);

      const rev2Res = await api().post(`/api/v1/construction/boqs/${rev1.id}/revise`);
      expect(rev2Res.status).toBe(201);
      expect(rev2Res.body.data.revisionNumber).toBe(2);
    });

    it('rejects editing items on approved revision when creating next revision fails', async () => {
      const contract = await createContract({ title: 'Invalid Rev Mutation Contract' });
      const boq = await createBoq(contract.id);
      const item = await createBoqItem(boq.id);
      await api().post(`/api/v1/construction/boqs/${boq.id}/approve`);

      const res = await api()
        .patch(`/api/v1/construction/boq-items/${item.body.data.id}`)
        .send({ plannedQuantity: '99' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Hierarchy', () => {
    it('supports parent and child section hierarchy', async () => {
      const contract = await createContract({ title: 'Hierarchy Contract' });
      const boq = await createBoq(contract.id);

      const parent = await api()
        .post(`/api/v1/construction/boqs/${boq.id}/sections`)
        .send({ code: '10', name: 'Civil Works', sequence: 1 });
      expect(parent.status).toBe(201);

      const child = await api()
        .post(`/api/v1/construction/boqs/${boq.id}/sections`)
        .send({
          code: '10.1',
          name: 'Excavation',
          sequence: 2,
          parentSectionId: parent.body.data.id,
        });
      expect(child.status).toBe(201);
      expect(child.body.data.parentSectionId).toBe(parent.body.data.id);
    });

    it('rejects section as its own parent', async () => {
      const contract = await createContract({ title: 'Self Parent Contract' });
      const boq = await createBoq(contract.id);
      const section = await api()
        .post(`/api/v1/construction/boqs/${boq.id}/sections`)
        .send({ code: '20', name: 'MEP', sequence: 1 });
      expect(section.status).toBe(201);

      const res = await api()
        .patch(`/api/v1/construction/boq-sections/${section.body.data.id}`)
        .send({ parentSectionId: section.body.data.id });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects three-level section hierarchy / cycle', async () => {
      const contract = await createContract({ title: 'Cycle Contract' });
      const boq = await createBoq(contract.id);

      const root = await api()
        .post(`/api/v1/construction/boqs/${boq.id}/sections`)
        .send({ code: '30', name: 'Root', sequence: 1 });
      const child = await api()
        .post(`/api/v1/construction/boqs/${boq.id}/sections`)
        .send({
          code: '30.1',
          name: 'Child',
          sequence: 2,
          parentSectionId: root.body.data.id,
        });
      expect(child.status).toBe(201);

      const grandchild = await api()
        .post(`/api/v1/construction/boqs/${boq.id}/sections`)
        .send({
          code: '30.1.1',
          name: 'Grandchild',
          sequence: 3,
          parentSectionId: child.body.data.id,
        });
      expect(grandchild.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects cross-tenant parent section', async () => {
      const isolated = await createIsolatedTenant(prisma, 'boq-parent');
      const isolatedProject = await prisma.project.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `ISO-H-PRJ-${Date.now()}`,
          name: 'Isolated Hierarchy Project',
        },
      });
      await prisma.constructionProjectProfile.create({
        data: { tenantId: isolated.tenantId, projectId: isolatedProject.id },
      });
      const isolatedParty = await prisma.party.create({
        data: {
          tenantId: isolated.tenantId,
          type: PartyType.organization,
          code: `ISO-H-PTY-${Date.now()}`,
          displayName: 'Isolated Hierarchy Party',
        },
      });
      const isolatedContract = await prisma.constructionContract.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: isolatedProject.id,
          branchId: isolated.branchId,
          number: `CNT-H-ISO-${Date.now()}`,
          title: 'Isolated Hierarchy Contract',
          direction: ConstructionContractDirection.customer,
          partyId: isolatedParty.id,
          pricingModel: ConstructionContractPricingModel.lump_sum,
        },
      });
      const isolatedBoq = await prisma.constructionBoq.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: isolatedProject.id,
          contractId: isolatedContract.id,
          number: `BOQ-H-ISO-${Date.now()}`,
          revisionNumber: 1,
        },
      });
      const isolatedSection = await prisma.constructionBoqSection.create({
        data: {
          tenantId: isolated.tenantId,
          boqId: isolatedBoq.id,
          code: 'ISO-01',
          name: 'Isolated Section',
          sequence: 1,
        },
      });

      const contract = await createContract({ title: 'Cross Parent Contract' });
      const boq = await createBoq(contract.id);

      const res = await api()
        .post(`/api/v1/construction/boqs/${boq.id}/sections`)
        .send({
          code: '40',
          name: 'Local Section',
          sequence: 1,
          parentSectionId: isolatedSection.id,
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Boundaries', () => {
    it('does not create journal entries on contract CRUD', async () => {
      const before = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });

      const contract = await createContract({ title: 'GL Boundary Contract' });
      await api()
        .patch(`/api/v1/construction/contracts/${contract.id}`)
        .send({ description: 'Boundary update' });
      await api()
        .post(`/api/v1/construction/contracts/${contract.id}/status`)
        .send({ status: ConstructionContractStatus.active });

      const after = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(after).toBe(before);
    });

    it('does not create journal entries on BOQ CRUD', async () => {
      const before = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const contract = await createContract({ title: 'BOQ GL Boundary Contract' });
      const boq = await createBoq(contract.id);
      const item = await createBoqItem(boq.id);
      await api()
        .patch(`/api/v1/construction/boq-items/${item.body.data.id}`)
        .send({ unitRate: '30' });
      await api().post(`/api/v1/construction/boqs/${boq.id}/approve`);

      const after = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(after).toBe(before);
    });

    it('does not mutate inventory on contract and BOQ operations', async () => {
      const before = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });

      const contract = await createContract({ title: 'Inventory Boundary Contract' });
      const boq = await createBoq(contract.id);
      await createBoqItem(boq.id, { productId });
      await api().post(`/api/v1/construction/boqs/${boq.id}/approve`);

      const after = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });
      expect(after).toBe(before);
    });

    it('does not create ConstructionCostEntry from BOQ approve', async () => {
      const before = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId },
      });

      const contract = await createContract({ title: 'Cost Entry Boundary Contract' });
      const boq = await createBoq(contract.id);
      await createBoqItem(boq.id, { costCenterId });
      await api().post(`/api/v1/construction/boqs/${boq.id}/approve`);

      const after = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId },
      });
      expect(after).toBe(before);
    });

    it('does not mutate PMS patients or ledger entries', async () => {
      const patientsBefore = await prisma.patient.count({
        where: { tenantId: ctx.tenantId },
      });
      const ledgerBefore = await prisma.ledgerEntry.count({
        where: { tenantId: ctx.tenantId },
      });

      const contract = await createContract({ title: 'PMS Boundary Contract' });
      const boq = await createBoq(contract.id);
      await createBoqItem(boq.id);
      await api().post(`/api/v1/construction/boqs/${boq.id}/approve`);
      await api()
        .post(`/api/v1/construction/contracts/${contract.id}/status`)
        .send({ status: ConstructionContractStatus.active });

      const patientsAfter = await prisma.patient.count({
        where: { tenantId: ctx.tenantId },
      });
      const ledgerAfter = await prisma.ledgerEntry.count({
        where: { tenantId: ctx.tenantId },
      });
      expect(patientsAfter).toBe(patientsBefore);
      expect(ledgerAfter).toBe(ledgerBefore);
    });

    it('does not mutate party identity on contract operations', async () => {
      const partyBefore = await prisma.party.findUnique({
        where: { id: customerPartyId },
        select: { displayName: true },
      });

      const contract = await createContract({
        title: 'Party Identity Boundary',
        partyId: customerPartyId,
      });
      await api()
        .patch(`/api/v1/construction/contracts/${contract.id}`)
        .send({ description: 'Commercial terms only' });
      await api()
        .post(`/api/v1/construction/contracts/${contract.id}/status`)
        .send({ status: ConstructionContractStatus.active });

      const partyAfter = await prisma.party.findUnique({
        where: { id: customerPartyId },
        select: { displayName: true },
      });
      expect(partyAfter?.displayName).toBe(partyBefore?.displayName);
    });
  });

  describe('Commercial licensing', () => {
    afterEach(async () => {
      await activateConstructionLicense(prisma, ctx.tenantId, licenseService);
    });

    it('allows perpetual Construction license for contract and BOQ operations', async () => {
      const signed = await signTestActivationForTenant(prisma, ctx.tenantId, {
        modules: defaultModuleEntries(modulesWithConstruction(), 'perpetual'),
        features: featuresWithConstruction(),
        licenseType: 'perpetual',
      });
      await licenseService.activateLicense(ctx.tenantId, signed);

      const contract = await createContract({ title: 'Perpetual License Contract' });
      const boq = await createBoq(contract.id);
      expect(boq.status).toBe(ConstructionBoqStatus.draft);

      const resolved = await licenseService.getLicenseForTenant(ctx.tenantId);
      expect(resolved?.licenseType).toBe('perpetual');
      expect(resolved?.isOperational).toBe(true);
    });

    it('rejects unlicensed Construction API when module is missing', async () => {
      const signed = await signTestActivationForTenant(prisma, ctx.tenantId, {
        modules: defaultModuleEntries(
          DEMO_ENABLED_MODULES.filter((m) => m !== 'construction'),
          'perpetual',
        ),
      });
      await licenseService.activateLicense(ctx.tenantId, signed);

      const res = await api().get('/api/v1/construction/contracts');
      expect(res.status).toBe(403);
    });
  });
});
