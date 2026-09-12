import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, request } from './test-app';
import { createTenantWithTwoBranches, type TenantBranchFixture } from './tenant-isolation.helpers';

describe('Tenant + branch isolation acceptance', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TenantBranchFixture;
  let tenantB: TenantBranchFixture;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    tenantA = await createTenantWithTwoBranches(app, 'A', 'EG');
    tenantB = await createTenantWithTwoBranches(app, 'B', 'SA');
  });

  afterAll(async () => {
    await app.close();
  });

  it('Tenant A cannot read Tenant B customer by ID', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/customers/${tenantB.customerId}`)
      .set('Authorization', `Bearer ${tenantA.adminToken}`);
    expect(res.status).toBe(404);
  });

  it('Tenant A cannot create sales invoice using Tenant B customer', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${tenantA.adminToken}`)
      .send({
        branchId: tenantA.branchAId,
        customerId: tenantB.customerId,
        warehouseId: tenantA.warehouseAId,
        lines: [{ description: 'Cross tenant', quantity: 1, unitPrice: 10, taxRate: 0 }],
      });
    expect(res.status).toBe(400);
  });

  it('Tenant A cannot read Tenant B sales invoice by ID', async () => {
    const invoice = await prisma.salesInvoice.create({
      data: {
        tenantId: tenantB.tenantId,
        branchId: tenantB.branchAId,
        number: `INV-B-${Date.now()}`,
        status: 'draft',
        subtotal: 100,
        taxAmount: 0,
        total: 100,
        lines: {
          create: [{
            description: 'B invoice',
            quantity: 1,
            unitPrice: 100,
            discount: 0,
            taxRate: 0,
            taxAmount: 0,
            lineTotal: 100,
          }],
        },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/sales/invoices/${invoice.id}`)
      .set('Authorization', `Bearer ${tenantA.adminToken}`);
    expect(res.status).toBe(404);
  });

  it('Tenant A branch user cannot read invoices from another branch in same tenant', async () => {
    const invoice = await prisma.salesInvoice.create({
      data: {
        tenantId: tenantA.tenantId,
        branchId: tenantA.branchBId,
        number: `INV-A-BR-B-${Date.now()}`,
        status: 'draft',
        subtotal: 50,
        taxAmount: 0,
        total: 50,
        lines: {
          create: [{
            description: 'Branch B only',
            quantity: 1,
            unitPrice: 50,
            discount: 0,
            taxRate: 0,
            taxAmount: 0,
            lineTotal: 50,
          }],
        },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/sales/invoices/${invoice.id}`)
      .set('Authorization', `Bearer ${tenantA.branchAUserToken}`);
    expect(res.status).toBe(404);
  });

  it('Tenant A branch user list excludes other branch invoices', async () => {
    await prisma.salesInvoice.create({
      data: {
        tenantId: tenantA.tenantId,
        branchId: tenantA.branchBId,
        number: `INV-LIST-B-${Date.now()}`,
        status: 'draft',
        subtotal: 20,
        taxAmount: 0,
        total: 20,
        lines: {
          create: [{
            description: 'Hidden from branch A user',
            quantity: 1,
            unitPrice: 20,
            discount: 0,
            taxRate: 0,
            taxAmount: 0,
            lineTotal: 20,
          }],
        },
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${tenantA.branchAUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((row: { branchId: string }) => row.branchId === tenantA.branchAId)).toBe(true);
  });

  it('Tenant A cannot adjust stock in Tenant B warehouse', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjust')
      .set('Authorization', `Bearer ${tenantA.adminToken}`)
      .send({
        warehouseId: tenantB.warehouseAId,
        productId: tenantA.productId,
        quantity: 1,
      });
    expect(res.status).toBe(400);
  });

  it('Tenant A cannot transfer stock to Tenant B warehouse', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/transfer')
      .set('Authorization', `Bearer ${tenantA.adminToken}`)
      .send({
        fromWarehouseId: tenantA.warehouseAId,
        toWarehouseId: tenantB.warehouseAId,
        productId: tenantA.productId,
        quantity: 1,
      });
    expect(res.status).toBe(400);
  });

  it('Branch A user cannot create invoice for Branch B', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${tenantA.branchAUserToken}`)
      .send({
        branchId: tenantA.branchBId,
        warehouseId: tenantA.warehouseBId,
        lines: [{ description: 'Wrong branch', quantity: 1, unitPrice: 10, taxRate: 0 }],
      });
    expect(res.status).toBe(403);
  });

  it('Tenant admin can access both branches in same tenant', async () => {
    await prisma.salesInvoice.create({
      data: {
        tenantId: tenantA.tenantId,
        branchId: tenantA.branchAId,
        number: `INV-ADMIN-A-${Date.now()}`,
        status: 'draft',
        subtotal: 10,
        taxAmount: 0,
        total: 10,
        lines: {
          create: [{
            description: 'Admin scope A',
            quantity: 1,
            unitPrice: 10,
            discount: 0,
            taxRate: 0,
            taxAmount: 0,
            lineTotal: 10,
          }],
        },
      },
    });
    await prisma.salesInvoice.create({
      data: {
        tenantId: tenantA.tenantId,
        branchId: tenantA.branchBId,
        number: `INV-ADMIN-B-${Date.now()}`,
        status: 'draft',
        subtotal: 20,
        taxAmount: 0,
        total: 20,
        lines: {
          create: [{
            description: 'Admin scope B',
            quantity: 1,
            unitPrice: 20,
            discount: 0,
            taxRate: 0,
            taxAmount: 0,
            lineTotal: 20,
          }],
        },
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${tenantA.adminToken}`);
    expect(res.status).toBe(200);
    const branchIds = new Set(res.body.data.map((row: { branchId: string }) => row.branchId));
    expect(branchIds.has(tenantA.branchAId)).toBe(true);
    expect(branchIds.has(tenantA.branchBId)).toBe(true);
  });

  it('warehouse-restricted user cannot read balances from another warehouse', async () => {
    await prisma.stockBalance.upsert({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: tenantA.tenantId,
          warehouseId: tenantA.warehouseBId,
          productId: tenantA.productId,
        },
      },
      update: { quantity: 25 },
      create: {
        tenantId: tenantA.tenantId,
        warehouseId: tenantA.warehouseBId,
        productId: tenantA.productId,
        quantity: 25,
        avgCost: 10,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/inventory/balances')
      .set('Authorization', `Bearer ${tenantA.warehouseAUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((row: { warehouseId: string }) => row.warehouseId === tenantA.warehouseAId)).toBe(true);
  });

  it('warehouse-restricted user cannot transfer from unauthorized warehouse', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/transfer')
      .set('Authorization', `Bearer ${tenantA.warehouseAUserToken}`)
      .send({
        fromWarehouseId: tenantA.warehouseBId,
        toWarehouseId: tenantA.warehouseAId,
        productId: tenantA.productId,
        quantity: 1,
      });
    expect(res.status).toBe(403);
  });
});
