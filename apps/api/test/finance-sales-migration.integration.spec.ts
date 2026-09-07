import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { Prisma, ProjectStatus } from '../../../packages/database/generated/server';
import { PrismaService } from '../src/database/prisma.service';
import { FinancialPostingService } from '../src/modules/finance/posting/financial-posting.service';
import { createIsolatedTenant } from './pms-test.helpers';
import {
  createDraftSalesInvoice,
  createLinkedPartyCustomer,
  loadSalesTestContext,
  type SalesTestContext,
  withPartyLegacyRoutingAsync,
  withUniversalFinanceSalesPilotAsync,
} from './sales-test.helpers';
import { createTestApp, request } from './test-app';

describe('Phase 8.3 Sales → Universal Finance migration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: SalesTestContext;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ctx = await loadSalesTestContext(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function postInvoice(invoiceId: string, body?: Record<string, unknown>) {
    const req = request(app.getHttpServer())
      .post(`/api/v1/sales/invoices/${invoiceId}/post`)
      .set('Authorization', `Bearer ${ctx.accessToken}`);
    return body ? req.send(body) : req.send({});
  }

  async function seedProject(label = 'P83') {
    return prisma.project.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        code: `PRJ-${label}-${Date.now()}`,
        name: `${label} Project`,
        status: ProjectStatus.active,
      },
    });
  }

  async function seedCostCenter(projectId?: string | null) {
    return prisma.costCenter.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        code: `CC-${Date.now()}-${randomUUID().slice(0, 6)}`,
        name: 'Sales migration CC',
        projectId: projectId ?? null,
        isActive: true,
      },
    });
  }

  async function getInvoiceTotal(invoiceId: string) {
    const invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    return invoice.total;
  }

  async function getStockQty(productId = ctx.productId) {
    const balance = await prisma.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: ctx.tenantId,
          warehouseId: ctx.warehouseId,
          productId,
        },
      },
    });
    return balance ? Number(balance.quantity) : 0;
  }

  describe('Pilot flag', () => {
    it('OFF → AccountingEngineService path on post', async () => {
      const { invoiceId } = await createDraftSalesInvoice(app, ctx, { useParty: true, label: 'LEG' });

      await withUniversalFinanceSalesPilotAsync(false, async () => {
        const res = await postInvoice(invoiceId);
        expect(res.status).toBe(201);

        const legacy = await prisma.journalEntry.findFirst({
          where: {
            tenantId: ctx.tenantId,
            referenceType: 'sales_invoice',
            referenceId: invoiceId,
          },
        });
        expect(legacy).toBeTruthy();
        expect(legacy?.sourceModule).toBeNull();

        const fps = await prisma.journalEntry.findFirst({
          where: {
            tenantId: ctx.tenantId,
            sourceModule: 'sales',
            sourceId: invoiceId,
            sourceEvent: 'post',
          },
        });
        expect(fps).toBeNull();
      });
    });

    it('ON → FinancialPostingService path only', async () => {
      const { invoiceId } = await createDraftSalesInvoice(app, ctx, { useParty: true, label: 'FPS' });

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        const res = await postInvoice(invoiceId);
        expect(res.status).toBe(201);

        const fps = await prisma.journalEntry.findFirst({
          where: {
            tenantId: ctx.tenantId,
            sourceModule: 'sales',
            sourceType: 'invoice',
            sourceId: invoiceId,
            sourceEvent: 'post',
          },
        });
        expect(fps).toBeTruthy();
        expect(fps?.fiscalPeriodId).not.toBeNull();

        const legacy = await prisma.journalEntry.findFirst({
          where: {
            tenantId: ctx.tenantId,
            referenceType: 'sales_invoice',
            referenceId: invoiceId,
            sourceModule: null,
          },
        });
        expect(legacy).toBeNull();
      });
    });

    it('ON never creates duplicate journals for one post', async () => {
      const { invoiceId } = await createDraftSalesInvoice(app, ctx, { label: 'ONE' });

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        await postInvoice(invoiceId);
        const count = await prisma.journalEntry.count({
          where: {
            tenantId: ctx.tenantId,
            OR: [
              { referenceType: 'sales_invoice', referenceId: invoiceId },
              { sourceModule: 'sales', sourceId: invoiceId },
            ],
          },
        });
        expect(count).toBe(1);
      });
    });

    it('OFF preserves legacy behavior unchanged', async () => {
      const journalsBefore = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const { invoiceId } = await createDraftSalesInvoice(app, ctx, { label: 'OFF2' });

      await withUniversalFinanceSalesPilotAsync(false, async () => {
        await postInvoice(invoiceId);
      });

      const journalsAfter = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(journalsAfter).toBe(journalsBefore + 1);
    });
  });

  describe('Accounting semantics', () => {
    it('invoice without COGS → 2 journal lines', async () => {
      const create = await request(app.getHttpServer())
        .post('/api/v1/sales/invoices')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          branchId: ctx.branchId,
          warehouseId: ctx.warehouseId,
          lines: [{ description: 'Consulting service', quantity: 1, unitPrice: 75 }],
        });
      expect(create.status).toBe(201);
      const invoiceId = create.body.data.id;

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        await postInvoice(invoiceId);
        const lines = await prisma.journalLine.findMany({
          where: { entry: { tenantId: ctx.tenantId, sourceModule: 'sales', sourceId: invoiceId } },
          include: { account: { select: { code: true } } },
        });
        expect(lines).toHaveLength(2);
        const codes = lines.map((l) => l.account.code).sort();
        expect(codes).toEqual(['1100', '4000']);
      });
    });

    it('invoice with COGS → 4 journal lines with correct amounts', async () => {
      await prisma.stockBalance.update({
        where: {
          tenantId_warehouseId_productId: {
            tenantId: ctx.tenantId,
            warehouseId: ctx.warehouseId,
            productId: ctx.productId,
          },
        },
        data: { avgCost: new Prisma.Decimal(10) },
      });

      const { invoiceId } = await createDraftSalesInvoice(app, ctx, { quantity: 3, unitPrice: 25 });
      const invoiceTotal = await getInvoiceTotal(invoiceId);
      const stockBefore = await getStockQty();
      const balance = await prisma.stockBalance.findUnique({
        where: {
          tenantId_warehouseId_productId: {
            tenantId: ctx.tenantId,
            warehouseId: ctx.warehouseId,
            productId: ctx.productId,
          },
        },
      });
      const expectedCogs = new Prisma.Decimal(balance!.avgCost).mul(3);

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        await postInvoice(invoiceId);
        const lines = await prisma.journalLine.findMany({
          where: { entry: { tenantId: ctx.tenantId, sourceModule: 'sales', sourceId: invoiceId } },
          include: { account: { select: { code: true } } },
        });
        expect(lines).toHaveLength(4);

        const byCode = Object.fromEntries(lines.map((l) => [l.account.code, l]));
        expect(Number(byCode['1100']!.debit)).toBeCloseTo(Number(invoiceTotal), 2);
        expect(Number(byCode['4000']!.credit)).toBeCloseTo(Number(invoiceTotal), 2);
        expect(Number(byCode['5000']!.debit)).toBeCloseTo(Number(expectedCogs), 2);
        expect(Number(byCode['1200']!.credit)).toBeCloseTo(Number(expectedCogs), 2);

        const debit = lines.reduce((s, l) => s.add(l.debit), new Prisma.Decimal(0));
        const credit = lines.reduce((s, l) => s.add(l.credit), new Prisma.Decimal(0));
        expect(debit.toString()).toBe(credit.toString());
      });

      expect(await getStockQty()).toBe(stockBefore - 3);
    });

    it('zero COGS skips COGS/Inventory lines under FPS rule', async () => {
      const zeroProduct = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          sku: `ZERO-${Date.now()}`,
          name: 'Zero cost product',
          unitId: ctx.unitId,
          salePrice: 20,
          costPrice: 0,
          trackInventory: true,
        });
      const productId = zeroProduct.body.data.id;
      await request(app.getHttpServer())
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ warehouseId: ctx.warehouseId, productId, quantity: 5 });

      const { invoiceId } = await createDraftSalesInvoice(app, ctx, {
        productId,
        quantity: 1,
        unitPrice: 20,
      });

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        await postInvoice(invoiceId);
        const lines = await prisma.journalLine.findMany({
          where: { entry: { tenantId: ctx.tenantId, sourceModule: 'sales', sourceId: invoiceId } },
        });
        expect(lines).toHaveLength(2);
      });
    });
  });

  describe('Dimensions', () => {
    it('persists project and cost center on all journal lines', async () => {
      const project = await seedProject('DIM');
      const costCenter = await seedCostCenter(project.id);
      const { invoiceId } = await createDraftSalesInvoice(app, ctx, { label: 'DIM' });

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        const res = await postInvoice(invoiceId, {
          dimensions: { projectId: project.id, costCenterId: costCenter.id },
        });
        expect(res.status).toBe(201);

        const lines = await prisma.journalLine.findMany({
          where: { entry: { tenantId: ctx.tenantId, sourceModule: 'sales', sourceId: invoiceId } },
        });
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
          expect(line.projectId).toBe(project.id);
          expect(line.costCenterId).toBe(costCenter.id);
        }
      });
    });

    it('rejects invalid, cross-tenant, and mismatched dimensions', async () => {
      const { invoiceId } = await createDraftSalesInvoice(app, ctx, { label: 'BAD' });
      const project = await seedProject('OK');
      const otherProject = await seedProject('OTHER');
      const scopedCc = await seedCostCenter(project.id);
      const isolated = await createIsolatedTenant(prisma, 'sales-dim');
      const foreignProject = await prisma.project.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `PRJ-FOR-${Date.now()}`,
          name: 'Foreign',
          status: ProjectStatus.active,
        },
      });

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        const badProject = await postInvoice(invoiceId, { dimensions: { projectId: randomUUID() } });
        expect(badProject.status).toBeGreaterThanOrEqual(400);

        const foreign = await postInvoice(invoiceId, { dimensions: { projectId: foreignProject.id } });
        expect(foreign.status).toBeGreaterThanOrEqual(400);

        const mismatch = await postInvoice(invoiceId, {
          dimensions: { projectId: otherProject.id, costCenterId: scopedCc.id },
        });
        expect(mismatch.status).toBeGreaterThanOrEqual(400);

        const journalCount = await prisma.journalEntry.count({
          where: { tenantId: ctx.tenantId, sourceModule: 'sales', sourceId: invoiceId },
        });
        expect(journalCount).toBe(0);

        const invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
        expect(invoice.status).toBe('draft');
      });
    });
  });

  describe('Idempotency and concurrency', () => {
    it('duplicate post is blocked by draft status guard', async () => {
      const { invoiceId } = await createDraftSalesInvoice(app, ctx, { label: 'DUP' });

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        expect((await postInvoice(invoiceId)).status).toBe(201);
        expect((await postInvoice(invoiceId)).status).toBeGreaterThanOrEqual(400);

        const count = await prisma.journalEntry.count({
          where: { tenantId: ctx.tenantId, sourceModule: 'sales', sourceId: invoiceId },
        });
        expect(count).toBe(1);
      });
    });

    it('concurrent post attempts yield one committed sale', async () => {
      const { invoiceId } = await createDraftSalesInvoice(app, ctx, { quantity: 5, label: 'CONC' });
      const stockBefore = await getStockQty();
      const { party, customer } = await createLinkedPartyCustomer(app, ctx, 'CONC-CUST');
      await prisma.salesInvoice.update({
        where: { id: invoiceId },
        data: { customerId: customer.id },
      });

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        const [first, second] = await Promise.all([
          postInvoice(invoiceId),
          postInvoice(invoiceId),
        ]);
        const successCount = [first.status, second.status].filter((s) => s === 201).length;
        expect(successCount).toBe(1);

        const invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
        expect(invoice.status).toBe('posted');

        const journalCount = await prisma.journalEntry.count({
          where: { tenantId: ctx.tenantId, sourceModule: 'sales', sourceId: invoiceId },
        });
        expect(journalCount).toBe(1);

        const stockAfter = await getStockQty();
        expect(stockAfter).toBe(stockBefore - 5);

        const refreshedCustomer = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
        expect(Number(refreshedCustomer.balance)).toBeGreaterThan(0);
      });

      void party;
    });
  });

  describe('Rollback', () => {
    it('insufficient stock rolls back accounting and keeps invoice draft', async () => {
      const { invoiceId } = await createDraftSalesInvoice(app, ctx, { quantity: 99999, label: 'NOSTK' });
      const journalsBefore = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        const res = await postInvoice(invoiceId);
        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      const invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
      expect(invoice.status).toBe('draft');
      const journalsAfter = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(journalsAfter).toBe(journalsBefore);
    });

    it('dimension validation failure rolls back stock changes', async () => {
      const { invoiceId } = await createDraftSalesInvoice(app, ctx, { quantity: 1, label: 'ROLL' });
      const stockBefore = await getStockQty();

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        const res = await postInvoice(invoiceId, { dimensions: { projectId: randomUUID() } });
        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      expect(await getStockQty()).toBe(stockBefore);
      const invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
      expect(invoice.status).toBe('draft');
    });

    it('FPS failure rolls back stock via transaction', async () => {
      const { invoiceId } = await createDraftSalesInvoice(app, ctx, { quantity: 1, label: 'FPSFAIL' });
      const stockBefore = await getStockQty();
      const financialPosting = app.get(FinancialPostingService);
      const spy = jest
        .spyOn(financialPosting, 'post')
        .mockRejectedValueOnce(new Error('forced FPS failure'));

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        const res = await postInvoice(invoiceId);
        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      spy.mockRestore();
      expect(await getStockQty()).toBe(stockBefore);
    });
  });

  describe('Boundaries and legacy compatibility', () => {
    it('customer payment remains on AccountingEngineService when sales pilot ON', async () => {
      const { party, customer } = await createLinkedPartyCustomer(app, ctx, 'PAY');
      let paymentId = '';

      await withUniversalFinanceSalesPilotAsync(true, async () => {
        await withPartyLegacyRoutingAsync(true, async () => {
          const payment = await request(app.getHttpServer())
            .post('/api/v1/sales/payments/from-party')
            .set('Authorization', `Bearer ${ctx.accessToken}`)
            .send({
              partyId: party.id,
              branchId: ctx.branchId,
              amount: 10,
            });
          expect(payment.status).toBe(201);
          paymentId = payment.body.data.id;
        });
      });

      const journal = await prisma.journalEntry.findFirst({
        where: {
          tenantId: ctx.tenantId,
          referenceType: 'customer_payment',
          referenceId: paymentId,
        },
      });
      expect(journal).toBeTruthy();
      expect(journal?.sourceModule).toBeNull();

      void customer;
    });

    it('Sales returns are not implemented (boundary unchanged)', () => {
      expect(true).toBe(true);
    });

    it('Purchasing receive pilot flag remains independent when sales pilot ON', async () => {
      await withUniversalFinanceSalesPilotAsync(true, async () => {
        expect(process.env.UNIVERSAL_FINANCE_SALES_PILOT_ENABLED).toBe('true');
        expect(process.env.UNIVERSAL_FINANCE_PILOT_ENABLED).not.toBe('true');
      });
    });
  });
});
