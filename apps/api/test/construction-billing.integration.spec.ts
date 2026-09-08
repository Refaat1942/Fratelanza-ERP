import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import {
  ConstructionBillingStatus,
  ConstructionBoqStatus,
  ConstructionContractDirection,
  ConstructionContractPricingModel,
  ConstructionContractStatus,
  ConstructionProgressStatus,
  PartyRoleType,
  PartyType,
  Prisma,
  ProjectStatus,
} from '../../../packages/database/generated/server';
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
import { createIsolatedTenant } from './pms-test.helpers';
import { withUniversalFinanceSalesPilotAsync } from './sales-test.helpers';
import { createTestApp, request } from './test-app';

describe('Construction billing (Phase 9.8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: Awaited<ReturnType<typeof loadConstructionTestContext>>;
  let adminUserId: string;
  let projectId: string;
  let costCenterId: string;
  let customerPartyId: string;
  let customerId: string;
  let contractId: string;
  let boqId: string;
  let boqItemId: string;
  let boqItem2Id: string;
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
        code: `CC-BLG-${Date.now()}`,
        name: 'Billing Cost Center',
        projectId,
      });
    expect(cc.status).toBe(201);
    costCenterId = cc.body.data.id;

    const customerParty = await createPartyWithRole(
      app,
      ctx.tenantId,
      adminUserId,
      PartyRoleType.customer,
      'BLG',
    );
    customerPartyId = customerParty.id;

    const customers = app.get(CustomersService);
    const legacyAdapter = app.get(PartyLegacyAdapterService);
    const customer = await customers.create(ctx.tenantId, {
      code: `C-BLG-${Date.now()}`,
      name: 'Billing Customer',
      branchId: ctx.branchId,
    });
    customerId = customer.id;
    await legacyAdapter.linkCustomer(
      ctx.tenantId,
      customerPartyId,
      customer.id,
      adminUserId,
    );

    const contract = await createContract({
      title: 'Billing Contract',
      retentionPercent: '10',
      advancePercent: '5',
    });
    contractId = contract.id;
    await activateContract(contractId);

    await request(app.getHttpServer())
      .post('/api/v1/construction/advances/received')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        contractId,
        partyType: 'customer',
        amount: '1000',
      });

    const boq = await createBoq(contractId, 'Billing BOQ');
    boqId = boq.id;

    const item1 = await createBoqItem(boqId, {
      description: 'Billing line 1',
      plannedQuantity: '100',
      unitRate: '10',
      lineNumber: 1,
      costCenterId,
    });
    expect(item1.status).toBe(201);
    boqItemId = item1.body.data.id;

    const item2 = await createBoqItem(boqId, {
      description: 'Billing line 2',
      plannedQuantity: '50',
      unitRate: '20',
      lineNumber: 2,
      costCenterId,
    });
    expect(item2.status).toBe(201);
    boqItem2Id = item2.body.data.id;

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
    const year = 2026 + Math.floor((periodCounter - 1) / 12);
    const month = String(((periodCounter - 1) % 12) + 1).padStart(2, '0');
    const day = String(Math.min(periodCounter, 28)).padStart(2, '0');
    return {
      periodFrom: `${year}-${month}-01`,
      periodTo: `${year}-${month}-${day}`,
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
    overrides: {
      title?: string;
      retentionPercent?: string;
      retentionCap?: string;
      advanceAmount?: string;
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
        description: 'Billing BOQ line',
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
    return res.body.data;
  }

  async function createProgress(
    overrides: {
      contractId?: string;
      boqId?: string;
    } = {},
  ) {
    const period = nextPeriod();
    return api().post('/api/v1/construction/progress').send({
      contractId: overrides.contractId ?? contractId,
      boqId: overrides.boqId ?? boqId,
      periodFrom: period.periodFrom,
      periodTo: period.periodTo,
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

  async function createApprovedProgress(
    quantities: { boqItemId: string; currentPeriodQuantity: string }[],
    overrides: { contractId?: string; boqId?: string } = {},
  ) {
    const progress = await createProgress(overrides);
    expect(progress.status).toBe(201);
    for (const line of quantities) {
      const item = await addProgressItem(progress.body.data.id, line);
      expect(item.status).toBe(201);
    }
    await api().post(`/api/v1/construction/progress/${progress.body.data.id}/submit`);
    const approved = await api().post(
      `/api/v1/construction/progress/${progress.body.data.id}/approve`,
    );
    expect(approved.status).toBe(201);
    expect(approved.body.data.status).toBe(ConstructionProgressStatus.approved);
    return approved.body.data as { id: string; number: string; totalCurrentAmount: string };
  }

  async function createApproveBilling(progressId: string, progressItemIds?: string[]) {
    const create = await api().post('/api/v1/construction/billing').send({
      progressId,
      ...(progressItemIds ? { progressItemIds } : {}),
    });
    expect(create.status).toBe(201);
    const approve = await api().post(
      `/api/v1/construction/billing/${create.body.data.id}/approve`,
    );
    expect(approve.status).toBe(201);
    return approve.body.data as {
      id: string;
      grossAmount: string;
      retentionAmount: string;
      advanceRecoveryAmount: string;
      netBillableAmount: string;
      salesInvoiceId: string | null;
    };
  }

  describe('Billing candidates', () => {
    it('lists approved progress with unbilled items', async () => {
      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '10' },
      ]);

      const res = await api().get(
        `/api/v1/construction/billing/candidates?contractId=${contractId}&limit=100`,
      );
      expect(res.status).toBe(200);
      const candidate = res.body.data.find(
        (row: { progressId: string }) => row.progressId === progress.id,
      );
      expect(candidate).toBeTruthy();
      expect(candidate.unbilledItemCount).toBe(1);
      expect(candidate.unbilledGrossAmount).toBe('100.0000');
    });
  });

  describe('Create billing', () => {
    it('creates draft billing from approved progress with retention and advance metadata', async () => {
      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '10' },
      ]);

      const res = await api().post('/api/v1/construction/billing').send({
        progressId: progress.id,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe(ConstructionBillingStatus.draft);
      expect(res.body.data.progressId).toBe(progress.id);
      expect(res.body.data.contractId).toBe(contractId);
      expect(res.body.data.boqId).toBe(boqId);
      expect(res.body.data.projectId).toBe(projectId);
      expect(Number(res.body.data.grossAmount)).toBeCloseTo(100, 2);
      expect(Number(res.body.data.retentionAmount)).toBeCloseTo(10, 2);
      expect(Number(res.body.data.advanceRecoveryAmount)).toBeGreaterThan(0);
      expect(Number(res.body.data.netBillableAmount)).toBeLessThan(100);
      expect(res.body.data.lines).toHaveLength(1);
    });

    it('rejects billing for non-approved progress', async () => {
      const period = nextPeriod();
      const draft = await api().post('/api/v1/construction/progress').send({
        contractId,
        boqId,
        periodFrom: period.periodFrom,
        periodTo: period.periodTo,
      });
      expect(draft.status).toBe(201);

      const res = await api().post('/api/v1/construction/billing').send({
        progressId: draft.body.data.id,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('supports partial billing by progress item subset', async () => {
      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '10' },
        { boqItemId: boqItem2Id, currentPeriodQuantity: '5' },
      ]);

      const progressItems = await prisma.constructionProgressItem.findMany({
        where: { progressId: progress.id },
      });
      const firstItemId = progressItems.find((item) => item.boqItemId === boqItemId)!.id;

      const res = await api().post('/api/v1/construction/billing').send({
        progressId: progress.id,
        progressItemIds: [firstItemId],
      });
      expect(res.status).toBe(201);
      expect(res.body.data.lines).toHaveLength(1);
      expect(Number(res.body.data.grossAmount)).toBeCloseTo(100, 2);

      const secondBilling = await api().post('/api/v1/construction/billing').send({
        progressId: progress.id,
        progressItemIds: progressItems
          .filter((item) => item.boqItemId === boqItem2Id)
          .map((item) => item.id),
      });
      expect(secondBilling.status).toBe(201);
      expect(Number(secondBilling.body.data.grossAmount)).toBeCloseTo(100, 2);
    });

    it('returns existing billing on idempotent create', async () => {
      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '5' },
      ]);

      const first = await api().post('/api/v1/construction/billing').send({
        progressId: progress.id,
        idempotencyKey: 'billing-idem-1',
      });
      const second = await api().post('/api/v1/construction/billing').send({
        progressId: progress.id,
        idempotencyKey: 'billing-idem-1',
      });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.data.id).toBe(first.body.data.id);
    });

    it('returns existing billing when creating duplicate for same progress items', async () => {
      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '8' },
      ]);

      const first = await api().post('/api/v1/construction/billing').send({
        progressId: progress.id,
      });
      expect(first.status).toBe(201);

      const duplicate = await api().post('/api/v1/construction/billing').send({
        progressId: progress.id,
      });
      expect(duplicate.status).toBe(201);
      expect(duplicate.body.data.id).toBe(first.body.data.id);
    });
  });

  describe('Post billing → Sales + FPS', () => {
    it('posts approved billing via FinancialPostingService with project/cost center dimensions', async () => {
      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '10' },
      ]);
      const billing = await createApproveBilling(progress.id);

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        const res = await api().post(`/api/v1/construction/billing/${billing.id}/post`).send({
          projectId,
          costCenterId,
        });
        expect(res.status).toBe(201);
        expect(res.body.data.status).toBe(ConstructionBillingStatus.posted);
        expect(res.body.data.salesInvoiceId).toBeTruthy();

        const invoice = await prisma.salesInvoice.findUniqueOrThrow({
          where: { id: res.body.data.salesInvoiceId },
        });
        expect(invoice.status).toBe('posted');
        expect(Number(invoice.total)).toBeCloseTo(Number(billing.netBillableAmount), 2);

        const journal = await prisma.journalEntry.findFirst({
          where: {
            tenantId: ctx.tenantId,
            sourceModule: 'sales',
            sourceType: 'invoice',
            sourceId: invoice.id,
            sourceEvent: 'post',
          },
        });
        expect(journal).toBeTruthy();
        expect(journal?.sourceModule).toBe('sales');

        const legacy = await prisma.journalEntry.findFirst({
          where: {
            tenantId: ctx.tenantId,
            referenceType: 'sales_invoice',
            referenceId: invoice.id,
            sourceModule: null,
          },
        });
        expect(legacy).toBeNull();

        const lines = await prisma.journalLine.findMany({
          where: { entryId: journal!.id },
        });
        for (const line of lines) {
          expect(line.projectId).toBe(projectId);
          expect(line.costCenterId).toBe(costCenterId);
        }
      });
    });

    it('rejects post when Universal Finance sales pilot is OFF', async () => {
      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '4' },
      ]);
      const billing = await createApproveBilling(progress.id);

      await withUniversalFinanceSalesPilotAsync(false, async () => {
        const res = await api().post(`/api/v1/construction/billing/${billing.id}/post`).send({});
        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });

    it('duplicate post is idempotent', async () => {
      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '6' },
      ]);
      const billing = await createApproveBilling(progress.id);

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        const first = await api().post(`/api/v1/construction/billing/${billing.id}/post`).send({});
        expect(first.status).toBe(201);
        const second = await api().post(`/api/v1/construction/billing/${billing.id}/post`).send({});
        expect(second.status).toBe(201);
        expect(second.body.data.id).toBe(first.body.data.id);

        const refreshed = await prisma.constructionBilling.findUniqueOrThrow({
          where: { id: billing.id },
        });
        expect(refreshed.status).toBe(ConstructionBillingStatus.posted);

        const journalCount = await prisma.journalEntry.count({
          where: {
            tenantId: ctx.tenantId,
            sourceModule: 'sales',
            sourceId: refreshed.salesInvoiceId ?? undefined,
          },
        });
        expect(journalCount).toBe(1);
      });
    });

    it('concurrent post attempts yield one posted billing', async () => {
      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '7' },
      ]);
      const billing = await createApproveBilling(progress.id);

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        const [first, second] = await Promise.all([
          api().post(`/api/v1/construction/billing/${billing.id}/post`).send({}),
          api().post(`/api/v1/construction/billing/${billing.id}/post`).send({}),
        ]);
        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(second.body.data.id).toBe(first.body.data.id);

        const refreshed = await prisma.constructionBilling.findUniqueOrThrow({
          where: { id: billing.id },
        });
        expect(refreshed.status).toBe(ConstructionBillingStatus.posted);
        expect(refreshed.salesInvoiceId).toBeTruthy();
      });
    });

    it('FPS failure rolls back billing post claim and keeps billing approved', async () => {
      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '3' },
      ]);
      const billing = await createApproveBilling(progress.id);
      const financialPosting = app.get(FinancialPostingService);
      const spy = jest
        .spyOn(financialPosting, 'post')
        .mockRejectedValueOnce(new Error('forced FPS failure'));

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        const res = await api().post(`/api/v1/construction/billing/${billing.id}/post`).send({});
        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      spy.mockRestore();

      const refreshed = await prisma.constructionBilling.findUniqueOrThrow({
        where: { id: billing.id },
      });
      expect(refreshed.status).toBe(ConstructionBillingStatus.approved);
      expect(refreshed.salesInvoiceId).toBeNull();

      const draftInvoices = await prisma.salesInvoice.count({
        where: { tenantId: ctx.tenantId, customerId, status: 'draft' },
      });
      expect(draftInvoices).toBeGreaterThan(0);
    });

    it('records advance recovery on post when applicable', async () => {
      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '20' },
      ]);
      const billing = await createApproveBilling(progress.id);
      const advanceBefore = await prisma.constructionAdvanceEntry.findFirst({
        where: { tenantId: ctx.tenantId, contractId },
        orderBy: { createdAt: 'desc' },
      });

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        const res = await api().post(`/api/v1/construction/billing/${billing.id}/post`).send({});
        expect(res.status).toBe(201);
      });

      const recovered = await prisma.constructionAdvanceEntry.findMany({
        where: {
          tenantId: ctx.tenantId,
          contractId,
          entryType: 'recovered',
        },
      });
      expect(recovered.length).toBeGreaterThan(0);
      void advanceBefore;
    });
  });

  describe('RBAC', () => {
    it('enforces RBAC on create', async () => {
      const role = await prisma.role.create({
        data: {
          tenantId: ctx.tenantId,
          code: `billing-read-${Date.now()}`,
          name: 'Billing Read Only',
        },
      });
      const readPerm = await prisma.permission.findFirstOrThrow({
        where: {
          module: 'construction',
          feature: 'billing',
          action: 'read',
        },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: readPerm.id },
      });
      const username = `billing-readonly-${Date.now()}`;
      await prisma.user.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          email: `${username}@fratelanza.local`,
          passwordHash: await hashPassword('Admin@123456'),
          firstName: 'Billing',
          lastName: 'Reader',
          roleId: role.id,
          isActive: true,
        },
      });
      const token = await loginAsUser(username);

      const progress = await createApprovedProgress([
        { boqItemId, currentPeriodQuantity: '2' },
      ]);

      const res = await api(token).post('/api/v1/construction/billing').send({
        progressId: progress.id,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Cross-tenant isolation', () => {
    it('cannot read billing from another tenant', async () => {
      const isolated = await createIsolatedTenant(prisma, 'billing-iso');
      const isolatedProject = await prisma.project.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `PRJ-BLG-${Date.now()}`,
          name: 'Foreign',
          status: ProjectStatus.active,
        },
      });
      const isolatedParty = await prisma.party.create({
        data: {
          tenantId: isolated.tenantId,
          type: PartyType.organization,
          code: `ISO-BLG-PTY-${Date.now()}`,
          displayName: 'Isolated Billing Party',
        },
      });
      const isolatedContract = await prisma.constructionContract.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: isolatedProject.id,
          branchId: isolated.branchId,
          number: `CNT-BLG-ISO-${Date.now()}`,
          title: 'Isolated Billing Contract',
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
          number: `BLG-ISO-${Date.now()}`,
          sourceType: 'progress',
          sourceId: randomUUID(),
          grossAmount: new Prisma.Decimal(100),
          netBillableAmount: new Prisma.Decimal(90),
        },
      });

      const res = await api().get(
        `/api/v1/construction/billing/${isolatedBilling.id}`,
      );
      expect(res.status).toBe(404);
    });
  });

  async function createApprovedBoqFixture(suffix: string) {
    const contract = await createContract({ title: `Fixture ${suffix}` });
    await activateContract(contract.id);
    const boq = await createBoq(contract.id, `BOQ ${suffix}`);
    const itemRes = await createBoqItem(boq.id, {
      description: `Line ${suffix}`,
      plannedQuantity: '100',
      unitRate: '10',
      lineNumber: 1,
      costCenterId,
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

  describe('Cancel', () => {
    it('cancels draft billing and frees items for rebilling', async () => {
      const fixture = await createApprovedBoqFixture('cancel');
      const progress = await createApprovedProgress(
        [{ boqItemId: fixture.boqItemId, currentPeriodQuantity: '9' }],
        { contractId: fixture.contractId, boqId: fixture.boqId },
      );
      const billing = await api().post('/api/v1/construction/billing').send({
        progressId: progress.id,
      });
      expect(billing.status).toBe(201);

      const cancel = await api().post(
        `/api/v1/construction/billing/${billing.body.data.id}/cancel`,
      );
      expect(cancel.status).toBe(201);
      expect(cancel.body.data.status).toBe(ConstructionBillingStatus.cancelled);

      const recreate = await api().post('/api/v1/construction/billing').send({
        progressId: progress.id,
      });
      expect(recreate.status).toBe(201);
    });
  });
});
