import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import {
  ConstructionBillingStatus,
  ConstructionBoqStatus,
  ConstructionContractDirection,
  ConstructionContractPricingModel,
  ConstructionContractStatus,
  ConstructionMaterialIssueStatus,
  ConstructionProgressStatus,
  PartyRoleType,
  PartyType,
  Prisma,
  ProjectStatus,
} from '../../../packages/database/generated/server';
import { AccountingEngineService } from '../src/common/services/accounting-engine.service';
import { InventoryLedgerService } from '../src/common/services/inventory-ledger.service';
import { PrismaService } from '../src/database/prisma.service';
import { FinancialPostingService } from '../src/modules/finance/posting/financial-posting.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { PartyLegacyAdapterService } from '../src/modules/parties/party-legacy-adapter.service';
import {
  createPartyWithRole,
  createUniversalProject,
  enableConstructionProfile,
  loadConstructionTestContext,
  prepareConstructionTestSuite,
  restoreDemoTenantLicense,
} from './construction-test.helpers';
import { seedStockBalance } from './inventory-test.helpers';
import { createIsolatedTenant } from './pms-test.helpers';
import { withUniversalFinanceSalesPilotAsync } from './sales-test.helpers';
import { createTestApp, request } from './test-app';

describe('Construction hardening (Phase 9.10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: Awaited<ReturnType<typeof loadConstructionTestContext>>;
  let adminUserId: string;
  let projectId: string;
  let costCenterId: string;
  let warehouseId: string;
  let productId: string;
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
        code: `CC-HRD-${Date.now()}`,
        name: 'Hardening Cost Center',
        projectId,
      });
    expect(cc.status).toBe(201);
    costCenterId = cc.body.data.id;

    const warehouses = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${ctx.accessToken}`);
    warehouseId = warehouses.body.data[0].id;

    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Authorization', `Bearer ${ctx.accessToken}`);
    const unitId = units.body.data[0].id;

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        sku: `HRD-MAT-${Date.now()}`,
        name: 'Hardening Cement',
        unitId,
        salePrice: 50,
        costPrice: 10,
        trackInventory: true,
      });
    expect(productRes.status).toBe(201);
    productId = productRes.body.data.id;
    await seedStockBalance(prisma, ctx.tenantId, warehouseId, productId, 500, 12.5);

    const customerParty = await createPartyWithRole(
      app,
      ctx.tenantId,
      adminUserId,
      PartyRoleType.customer,
      'HRD',
    );
    customerPartyId = customerParty.id;

    const customers = app.get(CustomersService);
    const legacyAdapter = app.get(PartyLegacyAdapterService);
    const customer = await customers.create(ctx.tenantId, {
      code: `C-HRD-${Date.now()}`,
      name: 'Hardening Customer',
      branchId: ctx.branchId,
    });
    await legacyAdapter.linkCustomer(
      ctx.tenantId,
      customerPartyId,
      customer.id,
      adminUserId,
    );

    const contract = await createContract({ title: 'Hardening Contract' });
    contractId = contract.id;
    await activateContract(contractId);

    const boq = await createBoq(contractId, 'Hardening BOQ');
    boqId = boq.id;

    const item = await createBoqItem(boqId, {
      description: 'Hardening line',
      plannedQuantity: '100',
      unitRate: '10',
      lineNumber: 1,
      costCenterId,
    });
    expect(item.status).toBe(201);
    boqItemId = item.body.data.id;

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
    return res.body.data as { id: string };
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
        description: 'Hardening BOQ line',
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

  async function createApprovedProgress(
    items: Array<{ boqItemId: string; currentPeriodQuantity: string }>,
  ) {
    const period = nextPeriod();
    const progress = await api().post('/api/v1/construction/progress').send({
      contractId,
      boqId,
      ...period,
    });
    expect(progress.status).toBe(201);

    for (const item of items) {
      const add = await api()
        .post(`/api/v1/construction/progress/${progress.body.data.id}/items`)
        .send(item);
      expect(add.status).toBe(201);
    }

    await api().post(`/api/v1/construction/progress/${progress.body.data.id}/submit`);
    const approved = await api().post(
      `/api/v1/construction/progress/${progress.body.data.id}/approve`,
    );
    expect(approved.status).toBe(201);
    expect(approved.body.data.status).toBe(ConstructionProgressStatus.approved);
    return approved.body.data as { id: string };
  }

  async function createApproveBilling(progressId: string) {
    const billing = await api().post('/api/v1/construction/billing').send({
      progressId,
    });
    expect(billing.status).toBe(201);
    const approved = await api().post(
      `/api/v1/construction/billing/${billing.body.data.id}/approve`,
    );
    expect(approved.status).toBe(201);
    return approved.body.data as { id: string };
  }

  describe('Finance path invariants', () => {
    it('billing post uses FinancialPostingService and never AccountingEngineService', async () => {
      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '5' },
      ]);
      const billing = await createApproveBilling(progress.id);

      const accounting = app.get(AccountingEngineService);
      const financialPosting = app.get(FinancialPostingService);
      const accountingSpy = jest.spyOn(accounting, 'createEntry');
      const fpsSpy = jest.spyOn(financialPosting, 'post');

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        const res = await api()
          .post(`/api/v1/construction/billing/${billing.id}/post`)
          .send({ projectId, costCenterId });
        expect(res.status).toBe(201);
      });

      expect(fpsSpy).toHaveBeenCalled();
      expect(accountingSpy).not.toHaveBeenCalled();

      accountingSpy.mockRestore();
      fpsSpy.mockRestore();
    });
  });

  describe('Inventory path invariants', () => {
    it('material issue uses InventoryLedgerService.applyMovement only', async () => {
      const ledger = app.get(InventoryLedgerService);
      const applySpy = jest.spyOn(ledger, 'applyMovement');

      const draft = await api().post('/api/v1/construction/material-issues').send({
        projectId,
        warehouseId,
        costCenterId,
        lines: [{ productId, quantity: '3' }],
      });
      expect(draft.status).toBe(201);

      const issued = await api().post(
        `/api/v1/construction/material-issues/${draft.body.data.id}/issue`,
      );
      expect(issued.status).toBe(201);
      expect(issued.body.data.status).toBe(ConstructionMaterialIssueStatus.issued);
      expect(applySpy).toHaveBeenCalledTimes(1);
      expect(applySpy.mock.calls[0]?.[0]?.movementType).toBe('project_issue');

      applySpy.mockRestore();
    });
  });

  describe('Tenant isolation', () => {
    it('rejects cross-tenant billing cancel', async () => {
      const isolated = await createIsolatedTenant(prisma, 'hrd-cancel');
      const isolatedProject = await prisma.project.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `PRJ-HRD-${Date.now()}`,
          name: 'Foreign',
          status: ProjectStatus.active,
        },
      });
      const isolatedParty = await prisma.party.create({
        data: {
          tenantId: isolated.tenantId,
          type: PartyType.organization,
          code: `ISO-HRD-PTY-${Date.now()}`,
          displayName: 'Isolated Party',
        },
      });
      const isolatedContract = await prisma.constructionContract.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: isolatedProject.id,
          branchId: isolated.branchId,
          number: `CNT-HRD-ISO-${Date.now()}`,
          title: 'Isolated Contract',
          direction: ConstructionContractDirection.customer,
          partyId: isolatedParty.id,
          pricingModel: ConstructionContractPricingModel.lump_sum,
          status: ConstructionContractStatus.active,
        },
      });
      const isolatedBilling = await prisma.constructionBilling.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: isolatedProject.id,
          branchId: isolated.branchId,
          contractId: isolatedContract.id,
          number: `BLG-HRD-ISO-${Date.now()}`,
          sourceType: 'progress',
          sourceId: randomUUID(),
          grossAmount: new Prisma.Decimal(100),
          netBillableAmount: new Prisma.Decimal(90),
        },
      });

      const cancel = await api().post(
        `/api/v1/construction/billing/${isolatedBilling.id}/cancel`,
      );
      expect(cancel.status).toBe(404);

      const refreshed = await prisma.constructionBilling.findUniqueOrThrow({
        where: { id: isolatedBilling.id },
      });
      expect(refreshed.status).toBe(ConstructionBillingStatus.draft);
    });

    it('rejects cross-tenant project dimension on billing post', async () => {
      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '4' },
      ]);
      const billing = await createApproveBilling(progress.id);

      const isolated = await createIsolatedTenant(prisma, 'hrd-post-proj');
      const foreignProject = await prisma.project.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `PRJ-HRD-${Date.now()}`,
          name: 'Foreign Project',
          status: ProjectStatus.active,
        },
      });

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        const res = await api()
          .post(`/api/v1/construction/billing/${billing.id}/post`)
          .send({ projectId: foreignProject.id });
        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });

    it('rejects mismatched project dimension on billing post', async () => {
      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '3' },
      ]);
      const billing = await createApproveBilling(progress.id);

      const otherProject = await createUniversalProject(app, ctx.accessToken, {
        name: 'Other billing project',
      });
      await enableConstructionProfile(app, ctx.accessToken, otherProject.id);

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        const res = await api()
          .post(`/api/v1/construction/billing/${billing.id}/post`)
          .send({ projectId: otherProject.id });
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(String(res.body.error?.message ?? res.body.message)).toMatch(/project/i);
      });
    });
  });

  describe('DTO validation', () => {
    it('rejects invalid billing status filter', async () => {
      const res = await api().get('/api/v1/construction/billing?status=not_a_status');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects non-numeric material issue line quantity', async () => {
      const res = await api().post('/api/v1/construction/material-issues').send({
        projectId,
        warehouseId,
        lines: [{ productId, quantity: 'abc' }],
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Historical integrity', () => {
    it('keeps approved BOQ item rates unchanged after progress approve and billing draft', async () => {
      const before = await prisma.constructionBoqItem.findUniqueOrThrow({
        where: { id: boqItemId },
      });
      expect(before.unitRate.toString()).toBe('10');
      expect(before.plannedQuantity.toString()).toBe('100');

      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '15' },
      ]);

      const progressItem = await prisma.constructionProgressItem.findFirstOrThrow({
        where: { progressId: progress.id, boqItemId },
      });
      expect(progressItem.unitRateSnapshot.toString()).toBe('10');

      const billing = await api().post('/api/v1/construction/billing').send({
        progressId: progress.id,
      });
      expect(billing.status).toBe(201);

      const after = await prisma.constructionBoqItem.findUniqueOrThrow({
        where: { id: boqItemId },
      });
      expect(after.unitRate.toString()).toBe('10');
      expect(after.plannedQuantity.toString()).toBe('100');
    });

    it('keeps approved BOQ status unchanged after billing create', async () => {
      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '1' },
      ]);
      const billing = await api().post('/api/v1/construction/billing').send({
        progressId: progress.id,
      });
      expect(billing.status).toBe(201);

      const boq = await prisma.constructionBoq.findUniqueOrThrow({
        where: { id: boqId },
      });
      expect(boq.status).toBe(ConstructionBoqStatus.approved);
    });
  });
});
