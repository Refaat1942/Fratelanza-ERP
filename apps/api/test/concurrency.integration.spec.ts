import type { INestApplication } from '@nestjs/common';
import { createTestApp, loginAdmin, request } from './test-app';

describe('Concurrency integration (Phase 0)', () => {
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
        sku: `P0-${Date.now()}`,
        name: 'Phase0 Concurrency Product',
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
      .send({ warehouseId, productId, quantity: 1000 });
  });

  afterAll(async () => {
    await app.close();
  });

  it('allocates unique invoice numbers under concurrent create requests', async () => {
    const server = app.getHttpServer();
    const requests = Array.from({ length: 8 }, (_, index) =>
      request(server)
        .post('/api/v1/sales/invoices')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId,
          warehouseId,
          lines: [
            {
              productId,
              description: `Concurrent line ${index}`,
              quantity: 1,
              unitPrice: 10,
            },
          ],
        }),
    );

    const responses = await Promise.all(requests);
    for (const res of responses) {
      expect(res.status).toBe(201);
    }

    const numbers = responses.map((res) => res.body.data.number as string);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('handles concurrent inventory adjustments without losing stock', async () => {
    const server = app.getHttpServer();
    const before = await request(server)
      .get('/api/v1/inventory/balances')
      .set('Authorization', `Bearer ${accessToken}`);
    const startingQty = Number(
      before.body.data.find((row: { product: { id: string } }) => row.product.id === productId)?.quantity ?? 0,
    );

    const adjustments = Array.from({ length: 10 }, () =>
      request(server)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ warehouseId, productId, quantity: 1 }),
    );
    const results = await Promise.all(adjustments);
    for (const res of results) {
      expect(res.status).toBe(201);
    }

    const after = await request(server)
      .get('/api/v1/inventory/balances')
      .set('Authorization', `Bearer ${accessToken}`);
    const endingQty = Number(
      after.body.data.find((row: { product: { id: string } }) => row.product.id === productId)?.quantity ?? 0,
    );

    expect(endingQty).toBe(startingQty + 10);
  });

  it('supports two authenticated clients against the same tenant concurrently', async () => {
    const [clientA, clientB] = await Promise.all([loginAdmin(app), loginAdmin(app)]);
    expect(clientA.user.tenantId).toBe(tenantId);
    expect(clientB.user.tenantId).toBe(tenantId);

    const [settingsA, settingsB] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/v1/settings')
        .set('Authorization', `Bearer ${clientA.accessToken}`),
      request(app.getHttpServer())
        .get('/api/v1/settings')
        .set('Authorization', `Bearer ${clientB.accessToken}`),
    ]);

    expect(settingsA.status).toBe(200);
    expect(settingsB.status).toBe(200);
  });
});
