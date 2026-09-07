import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, loginAdmin, request } from './test-app';

describe('Resilience integration (Phase 0)', () => {
  let app: INestApplication;
  let accessToken = '';
  let tenantId = '';
  let branchId = '';
  let warehouseId = '';
  let productId = '';
  let unitId = '';

  beforeAll(async () => {
    app = await createTestApp();
    const auth = await loginAdmin(app);
    accessToken = auth.accessToken;
    tenantId = auth.user.tenantId;
    branchId = auth.user.branchId ?? '';

    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Authorization', `Bearer ${accessToken}`);
    unitId = units.body.data[0].id;

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        sku: `P0-R-${Date.now()}`,
        name: 'Phase0 Resilience Product',
        unitId,
        salePrice: 10,
        costPrice: 5,
      });
    productId = productRes.body.data.id;

    const warehouses = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${accessToken}`);
    warehouseId = warehouses.body.data[0].id;

    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjust')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ warehouseId, productId, quantity: 50 });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects invalid and expired refresh tokens', async () => {
    const invalid = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not-a-real-token' });
    expect(invalid.status).toBe(401);

    const auth = await loginAdmin(app);
    const prisma = app.get(PrismaService);
    const session = await prisma.session.findFirst({
      where: { refreshToken: auth.refreshToken },
    });
    expect(session).toBeTruthy();
    await prisma.session.update({
      where: { id: session!.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const expired = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: auth.refreshToken });
    expect(expired.status).toBe(401);
  });

  it('rejects malformed access tokens', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/settings')
      .set('Authorization', 'Bearer not.a.valid.jwt');
    expect(res.status).toBe(401);
  });

  it('rolls back failed inventory adjustments without changing stock', async () => {
    const server = app.getHttpServer();
    const before = await request(server)
      .get('/api/v1/inventory/balances')
      .set('Authorization', `Bearer ${accessToken}`);
    const startingQty = Number(
      before.body.data.find((row: { product: { id: string } }) => row.product.id === productId)?.quantity ?? 0,
    );

    const failure = await request(server)
      .post('/api/v1/inventory/adjust')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ warehouseId, productId, quantity: -(startingQty + 500) });
    expect(failure.status).toBeGreaterThanOrEqual(400);

    const after = await request(server)
      .get('/api/v1/inventory/balances')
      .set('Authorization', `Bearer ${accessToken}`);
    const endingQty = Number(
      after.body.data.find((row: { product: { id: string } }) => row.product.id === productId)?.quantity ?? 0,
    );
    expect(endingQty).toBe(startingQty);
  });

  it('does not create invoice rows when posting fails due to insufficient stock', async () => {
    const server = app.getHttpServer();
    const invoicesBefore = await request(server)
      .get('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${accessToken}`);
    const countBefore = invoicesBefore.body.data.length;

    const draft = await request(server)
      .post('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        warehouseId,
        lines: [{ productId, description: 'Rollback test', quantity: 999999, unitPrice: 1 }],
      });
    expect(draft.status).toBe(201);
    const invoiceId = draft.body.data.id as string;

    const post = await request(server)
      .post(`/api/v1/sales/invoices/${invoiceId}/post`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(post.status).toBeGreaterThanOrEqual(400);

    const invoice = await request(server)
      .get(`/api/v1/sales/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(invoice.body.data.status).toBe('draft');

    const invoicesAfter = await request(server)
      .get('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(invoicesAfter.body.data.length).toBe(countBefore + 1);
  });

  it('allows concurrent updates to the same customer record from two clients', async () => {
    const server = app.getHttpServer();
    const create = await request(server)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: `P0-C-${Date.now()}`,
        name: 'Concurrent Customer',
      });
    expect(create.status).toBe(201);
    const customerId = create.body.data.id as string;

    const [clientA, clientB] = await Promise.all([loginAdmin(app), loginAdmin(app)]);
    const [updateA, updateB] = await Promise.all([
      request(server)
        .patch(`/api/v1/customers/${customerId}`)
        .set('Authorization', `Bearer ${clientA.accessToken}`)
        .send({ phone: '111' }),
      request(server)
        .patch(`/api/v1/customers/${customerId}`)
        .set('Authorization', `Bearer ${clientB.accessToken}`)
        .send({ phone: '222' }),
    ]);

    expect(updateA.status).toBe(200);
    expect(updateB.status).toBe(200);

    const customer = await request(server)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(['111', '222']).toContain(customer.body.data.phone);
  });

  it('allocates unique payment numbers under concurrent payment requests', async () => {
    const server = app.getHttpServer();
    const customer = await request(server)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: `P0-P-${Date.now()}`,
        name: 'Concurrent Payment Customer',
      });
    const customerId = customer.body.data.id as string;

    const payments = Array.from({ length: 6 }, (_, index) =>
      request(server)
        .post('/api/v1/sales/payments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId,
          customerId,
          amount: 1,
          reference: `Concurrent payment ${index}`,
        }),
    );

    const responses = await Promise.all(payments);
    for (const res of responses) {
      expect(res.status).toBe(201);
    }

    const numbers = responses.map((res) => res.body.data.number as string);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('rejects invoice create with unknown product foreign key without partial writes', async () => {
    const server = app.getHttpServer();
    const before = await request(server)
      .get('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${accessToken}`);
    const countBefore = before.body.data.length;

    const res = await request(server)
      .post('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        warehouseId,
        lines: [{
          productId: randomUUID(),
          description: 'Invalid product',
          quantity: 1,
          unitPrice: 10,
        }],
      });

    expect(res.status).toBeGreaterThanOrEqual(400);

    const after = await request(server)
      .get('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(after.body.data.length).toBe(countBefore);
  });
});
