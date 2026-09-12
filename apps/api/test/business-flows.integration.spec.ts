import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, loginAdmin, request } from './test-app';
import { loadPurchasingTestContext, poLine, type PurchasingTestContext } from './purchasing-test.helpers';
import { createTenantWithTwoBranches } from './tenant-isolation.helpers';

describe('Business flow validation', () => {
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

  it('purchasing: PO receive increases inventory, supplier balance, and allows payment', async () => {
    const supplier = await prisma.supplier.findFirst({ where: { tenantId: ctx.tenantId } });
    expect(supplier).toBeTruthy();

    const supplierBefore = await prisma.supplier.findUnique({ where: { id: supplier!.id } });
    const stockBefore = await prisma.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: ctx.tenantId,
          warehouseId: ctx.warehouseId,
          productId: ctx.productId,
        },
      },
    });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/purchasing/orders')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        branchId: ctx.branchId,
        supplierId: supplier!.id,
        warehouseId: ctx.warehouseId,
        lines: [poLine(ctx.productId, 10, 100)],
      });
    expect(createRes.status).toBe(201);
    const orderId = createRes.body.data.id as string;
    const orderTotal = Number(createRes.body.data.total);

    const receiveRes = await request(app.getHttpServer())
      .post(`/api/v1/purchasing/orders/${orderId}/receive`)
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({});
    expect(receiveRes.status).toBe(201);

    const stockAfterReceive = await prisma.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: ctx.tenantId,
          warehouseId: ctx.warehouseId,
          productId: ctx.productId,
        },
      },
    });
    expect(Number(stockAfterReceive?.quantity ?? 0)).toBe(Number(stockBefore?.quantity ?? 0) + 10);

    const supplierAfterReceive = await prisma.supplier.findUnique({ where: { id: supplier!.id } });
    expect(Number(supplierAfterReceive?.balance ?? 0)).toBe(
      Number(supplierBefore?.balance ?? 0) + orderTotal,
    );

    const payRes = await request(app.getHttpServer())
      .post('/api/v1/purchasing/payments')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        branchId: ctx.branchId,
        supplierId: supplier!.id,
        purchaseOrderId: orderId,
        amount: orderTotal,
      });
    expect(payRes.status).toBe(201);

    const supplierAfterPay = await prisma.supplier.findUnique({ where: { id: supplier!.id } });
    expect(Number(supplierAfterPay?.balance ?? 0)).toBe(Number(supplierBefore?.balance ?? 0));
  });

  it('sales: invoice post decreases inventory and payment clears customer balance', async () => {
    const customer = await prisma.customer.findFirst({ where: { tenantId: ctx.tenantId } });
    expect(customer).toBeTruthy();

    const stockBefore = await prisma.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: ctx.tenantId,
          warehouseId: ctx.warehouseId,
          productId: ctx.productId,
        },
      },
    });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        branchId: ctx.branchId,
        customerId: customer!.id,
        warehouseId: ctx.warehouseId,
        lines: [{ productId: ctx.productId, description: 'Flow test', quantity: 2, unitPrice: 150, taxRate: 15 }],
      });
    expect(createRes.status).toBe(201);
    const invoiceId = createRes.body.data.id as string;
    const invoiceTotal = Number(createRes.body.data.total);

    const postRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/invoices/${invoiceId}/post`)
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({});
    expect(postRes.status).toBe(201);

    const stockAfter = await prisma.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: ctx.tenantId,
          warehouseId: ctx.warehouseId,
          productId: ctx.productId,
        },
      },
    });
    expect(Number(stockAfter?.quantity ?? 0)).toBe(Number(stockBefore?.quantity ?? 0) - 2);

    const customerAfterPost = await prisma.customer.findUnique({ where: { id: customer!.id } });
    expect(Number(customerAfterPost?.balance ?? 0)).toBe(Number(customer!.balance) + invoiceTotal);

    const payRes = await request(app.getHttpServer())
      .post('/api/v1/sales/payments')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        branchId: ctx.branchId,
        customerId: customer!.id,
        invoiceId,
        amount: invoiceTotal,
      });
    expect(payRes.status).toBe(201);

    const customerAfterPay = await prisma.customer.findUnique({ where: { id: customer!.id } });
    expect(Number(customerAfterPay?.balance ?? 0)).toBe(Number(customer!.balance));
  });

  it('inventory: transfer moves stock between warehouses with audit log', async () => {
    let secondWarehouse = await prisma.warehouse.findFirst({
      where: { tenantId: ctx.tenantId, id: { not: ctx.warehouseId }, branchId: ctx.branchId },
    });
    if (!secondWarehouse) {
      const createWh = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          branchId: ctx.branchId,
          code: `WH-B-${Date.now()}`,
          name: 'Warehouse B Flow Test',
        });
      expect(createWh.status).toBe(201);
      secondWarehouse = createWh.body.data;
    }
    const warehouseB = secondWarehouse!;

    const sourceBefore = await prisma.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: ctx.tenantId,
          warehouseId: ctx.warehouseId,
          productId: ctx.productId,
        },
      },
    });
    const destBefore = await prisma.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: ctx.tenantId,
          warehouseId: warehouseB.id,
          productId: ctx.productId,
        },
      },
    });

    const transferRes = await request(app.getHttpServer())
      .post('/api/v1/inventory/transfer')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        fromWarehouseId: ctx.warehouseId,
        toWarehouseId: warehouseB.id,
        productId: ctx.productId,
        quantity: 1,
      });
    expect(transferRes.status).toBe(201);

    const sourceAfter = await prisma.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: ctx.tenantId,
          warehouseId: ctx.warehouseId,
          productId: ctx.productId,
        },
      },
    });
    const destAfter = await prisma.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: ctx.tenantId,
          warehouseId: warehouseB.id,
          productId: ctx.productId,
        },
      },
    });

    expect(Number(sourceAfter?.quantity ?? 0)).toBe(Number(sourceBefore?.quantity ?? 0) - 1);
    expect(Number(destAfter?.quantity ?? 0)).toBe(Number(destBefore?.quantity ?? 0) + 1);

    const audit = await prisma.auditLog.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'inventory.transfer.completed',
        entityId: transferRes.body.data.outMovement.id,
      },
    });
    expect(audit).toBeTruthy();
  });

  it('inventory: rejects cross-tenant stock transfer', async () => {
    const otherTenant = await createTenantWithTwoBranches(app, 'XFER', 'EG');
    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/transfer')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        fromWarehouseId: ctx.warehouseId,
        toWarehouseId: otherTenant.warehouseAId,
        productId: ctx.productId,
        quantity: 1,
      });
    expect(res.status).toBe(400);
  });

  it('purchasing: return reverses inventory, supplier balance, and creates audit log', async () => {
    const supplier = await prisma.supplier.findFirst({ where: { tenantId: ctx.tenantId } });
    expect(supplier).toBeTruthy();

    const stockBefore = await prisma.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: ctx.tenantId,
          warehouseId: ctx.warehouseId,
          productId: ctx.productId,
        },
      },
    });
    const supplierBefore = await prisma.supplier.findUnique({ where: { id: supplier!.id } });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/purchasing/orders')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        branchId: ctx.branchId,
        supplierId: supplier!.id,
        warehouseId: ctx.warehouseId,
        lines: [poLine(ctx.productId, 5, 80)],
      });
    expect(createRes.status).toBe(201);
    const orderId = createRes.body.data.id as string;
    const orderTotal = Number(createRes.body.data.total);

    const receiveRes = await request(app.getHttpServer())
      .post(`/api/v1/purchasing/orders/${orderId}/receive`)
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({});
    expect(receiveRes.status).toBe(201);

    const returnRes = await request(app.getHttpServer())
      .post(`/api/v1/purchasing/orders/${orderId}/return`)
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({});
    expect(returnRes.status).toBe(201);
    expect(returnRes.body.data.status).toBe('returned');

    const stockAfter = await prisma.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: ctx.tenantId,
          warehouseId: ctx.warehouseId,
          productId: ctx.productId,
        },
      },
    });
    expect(Number(stockAfter?.quantity ?? 0)).toBe(Number(stockBefore?.quantity ?? 0));

    const supplierAfter = await prisma.supplier.findUnique({ where: { id: supplier!.id } });
    expect(Number(supplierAfter?.balance ?? 0)).toBe(Number(supplierBefore?.balance ?? 0));

    const journal = await prisma.journalEntry.findFirst({
      where: { tenantId: ctx.tenantId, referenceType: 'purchase_order_return', referenceId: orderId },
    });
    expect(journal).toBeTruthy();

    const audit = await prisma.auditLog.findFirst({
      where: { tenantId: ctx.tenantId, action: 'purchasing.order.returned', entityId: orderId },
    });
    expect(audit).toBeTruthy();
    const auditPayload = audit?.newValue as { total?: number } | null;
    expect(Number(auditPayload?.total ?? 0)).toBe(orderTotal);
  });

  it('sales: return reverses inventory, customer balance, and accounting', async () => {
    const customer = await prisma.customer.findFirst({ where: { tenantId: ctx.tenantId } });
    expect(customer).toBeTruthy();

    const stockBefore = await prisma.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: ctx.tenantId,
          warehouseId: ctx.warehouseId,
          productId: ctx.productId,
        },
      },
    });
    const customerBefore = await prisma.customer.findUnique({ where: { id: customer!.id } });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        branchId: ctx.branchId,
        customerId: customer!.id,
        warehouseId: ctx.warehouseId,
        lines: [{ productId: ctx.productId, description: 'Return test', quantity: 3, unitPrice: 100, taxRate: 0 }],
      });
    expect(createRes.status).toBe(201);
    const invoiceId = createRes.body.data.id as string;

    const postRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/invoices/${invoiceId}/post`)
      .set('Authorization', `Bearer ${ctx.accessToken}`);
    expect(postRes.status).toBe(201);

    const returnRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/invoices/${invoiceId}/return`)
      .set('Authorization', `Bearer ${ctx.accessToken}`);
    expect(returnRes.status).toBe(201);
    expect(returnRes.body.data.status).toBe('returned');

    const stockAfter = await prisma.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: ctx.tenantId,
          warehouseId: ctx.warehouseId,
          productId: ctx.productId,
        },
      },
    });
    expect(Number(stockAfter?.quantity ?? 0)).toBe(Number(stockBefore?.quantity ?? 0));

    const customerAfter = await prisma.customer.findUnique({ where: { id: customer!.id } });
    expect(Number(customerAfter?.balance ?? 0)).toBe(Number(customerBefore?.balance ?? 0));

    const journal = await prisma.journalEntry.findFirst({
      where: { tenantId: ctx.tenantId, referenceType: 'sales_invoice_return', referenceId: invoiceId },
    });
    expect(journal).toBeTruthy();

    const audit = await prisma.auditLog.findFirst({
      where: { tenantId: ctx.tenantId, action: 'sales.invoice.returned', entityId: invoiceId },
    });
    expect(audit).toBeTruthy();
  });

  it('idempotency: duplicate post and return requests are rejected', async () => {
    const customer = await prisma.customer.findFirst({ where: { tenantId: ctx.tenantId } });
    const supplier = await prisma.supplier.findFirst({ where: { tenantId: ctx.tenantId } });
    expect(customer).toBeTruthy();
    expect(supplier).toBeTruthy();

    const invoiceRes = await request(app.getHttpServer())
      .post('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        branchId: ctx.branchId,
        customerId: customer!.id,
        warehouseId: ctx.warehouseId,
        lines: [{ productId: ctx.productId, description: 'Idempotent', quantity: 1, unitPrice: 50, taxRate: 0 }],
      });
    const invoiceId = invoiceRes.body.data.id as string;

    const firstPost = await request(app.getHttpServer())
      .post(`/api/v1/sales/invoices/${invoiceId}/post`)
      .set('Authorization', `Bearer ${ctx.accessToken}`);
    expect(firstPost.status).toBe(201);

    const secondPost = await request(app.getHttpServer())
      .post(`/api/v1/sales/invoices/${invoiceId}/post`)
      .set('Authorization', `Bearer ${ctx.accessToken}`);
    expect(secondPost.status).toBeGreaterThanOrEqual(400);

    const firstReturn = await request(app.getHttpServer())
      .post(`/api/v1/sales/invoices/${invoiceId}/return`)
      .set('Authorization', `Bearer ${ctx.accessToken}`);
    expect(firstReturn.status).toBe(201);

    const secondReturn = await request(app.getHttpServer())
      .post(`/api/v1/sales/invoices/${invoiceId}/return`)
      .set('Authorization', `Bearer ${ctx.accessToken}`);
    expect(secondReturn.status).toBeGreaterThanOrEqual(400);

    const poRes = await request(app.getHttpServer())
      .post('/api/v1/purchasing/orders')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        branchId: ctx.branchId,
        supplierId: supplier!.id,
        warehouseId: ctx.warehouseId,
        lines: [poLine(ctx.productId, 2, 20)],
      });
    const orderId = poRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/purchasing/orders/${orderId}/receive`)
      .set('Authorization', `Bearer ${ctx.accessToken}`);

    const firstPoReturn = await request(app.getHttpServer())
      .post(`/api/v1/purchasing/orders/${orderId}/return`)
      .set('Authorization', `Bearer ${ctx.accessToken}`);
    expect(firstPoReturn.status).toBe(201);

    const secondPoReturn = await request(app.getHttpServer())
      .post(`/api/v1/purchasing/orders/${orderId}/return`)
      .set('Authorization', `Bearer ${ctx.accessToken}`);
    expect(secondPoReturn.status).toBeGreaterThanOrEqual(400);
  });

  it('module access: disabled purchasing module blocks API', async () => {
    await prisma.tenantModuleAccess.upsert({
      where: { tenantId_moduleId: { tenantId: ctx.tenantId, moduleId: 'purchasing' } },
      create: { tenantId: ctx.tenantId, moduleId: 'purchasing', enabled: false },
      update: { enabled: false },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/purchasing/orders')
      .set('Authorization', `Bearer ${ctx.accessToken}`);
    expect(res.status).toBe(403);

    await prisma.tenantModuleAccess.update({
      where: { tenantId_moduleId: { tenantId: ctx.tenantId, moduleId: 'purchasing' } },
      data: { enabled: true },
    });
  });
});
