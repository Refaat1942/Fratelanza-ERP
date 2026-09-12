import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, request } from './test-app';
import { loadPurchasingTestContext, type PurchasingTestContext } from './purchasing-test.helpers';

describe('Multi-country localization', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: PurchasingTestContext;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ctx = await loadPurchasingTestContext(app);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { country: 'EG', currency: 'EGP' },
    });
  });

  it('resolves Egypt tax at 14% standard rate', async () => {
    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { country: 'EG', currency: 'EGP' },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        branchId: ctx.branchId,
        warehouseId: ctx.warehouseId,
        lines: [{ description: 'Tax test', quantity: 1, unitPrice: 100, taxCategoryId: 'standard' }],
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.data.taxAmount)).toBe(14);
    expect(Number(res.body.data.subtotal)).toBe(100);
  });

  it('resolves Saudi tax at 15% standard rate', async () => {
    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { country: 'SA', currency: 'SAR' },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        branchId: ctx.branchId,
        warehouseId: ctx.warehouseId,
        lines: [{ description: 'Tax test', quantity: 1, unitPrice: 100, taxCategoryId: 'standard' }],
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.data.taxAmount)).toBe(15);
  });

  it('blocks Egyptian tenant from Saudi ZATCA integration endpoints', async () => {
    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { country: 'EG', currency: 'EGP' },
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/integrations/saudi/status')
      .set('Authorization', `Bearer ${ctx.accessToken}`);

    expect(res.status).toBe(403);
  });

  it('blocks Saudi tenant from Egyptian ETA integration endpoints', async () => {
    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { country: 'SA', currency: 'SAR' },
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/integrations/egypt/status')
      .set('Authorization', `Bearer ${ctx.accessToken}`);

    expect(res.status).toBe(403);
  });

  it('queues government integration with configuration_required when credentials are missing', async () => {
    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { country: 'EG', currency: 'EGP' },
    });
    const invoiceRes = await request(app.getHttpServer())
      .post('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        branchId: ctx.branchId,
        warehouseId: ctx.warehouseId,
        lines: [{ description: 'Gov queue', quantity: 1, unitPrice: 50, taxCategoryId: 'standard' }],
      });
    expect(invoiceRes.status).toBe(201);
    const invoiceId = invoiceRes.body.data.id as string;

    const postRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/invoices/${invoiceId}/post`)
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({});
    expect(postRes.status).toBe(201);

    const log = await prisma.governmentIntegrationLog.findFirst({
      where: { tenantId: ctx.tenantId, documentId: invoiceId, authority: 'ETA' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.status).toBe('configuration_required');
  });
});
