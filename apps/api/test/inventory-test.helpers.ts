import type { INestApplication } from '@nestjs/common';
import { Prisma } from '../../../packages/database/generated/server';
import { PrismaService } from '../src/database/prisma.service';
import { loginAdmin, request } from './test-app';

export interface InventoryTestContext {
  tenantId: string;
  branchId: string;
  adminUserId: string;
  accessToken: string;
  warehouseId: string;
  productId: string;
  unitId: string;
}

export async function loadInventoryTestContext(
  app: INestApplication,
): Promise<InventoryTestContext> {
  const auth = await loginAdmin(app);
  const prisma = app.get(PrismaService);
  const admin = await prisma.user.findFirst({
    where: { email: 'admin@fratelanza.local' },
  });

  const units = await request(app.getHttpServer())
    .get('/api/v1/units-of-measure')
    .set('Authorization', `Bearer ${auth.accessToken}`);
  const unitId = units.body.data[0].id;

  const productRes = await request(app.getHttpServer())
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${auth.accessToken}`)
    .send({
      sku: `P7-${Date.now()}`,
      name: 'Phase 7 Inventory Product',
      unitId,
      salePrice: 20,
      costPrice: 8,
      trackInventory: true,
    });
  const productId = productRes.body.data.id;

  const warehouses = await request(app.getHttpServer())
    .get('/api/v1/warehouses')
    .set('Authorization', `Bearer ${auth.accessToken}`);
  const warehouseId = warehouses.body.data[0].id;

  await request(app.getHttpServer())
    .post('/api/v1/inventory/adjust')
    .set('Authorization', `Bearer ${auth.accessToken}`)
    .send({ warehouseId, productId, quantity: 100, notes: 'Phase 7 seed' });

  return {
    tenantId: auth.user.tenantId,
    branchId: auth.user.branchId ?? '',
    adminUserId: admin!.id,
    accessToken: auth.accessToken,
    warehouseId,
    productId,
    unitId,
  };
}

export async function seedStockBalance(
  prisma: PrismaService,
  tenantId: string,
  warehouseId: string,
  productId: string,
  quantity: number,
  avgCost = 8,
) {
  return prisma.stockBalance.upsert({
    where: {
      tenantId_warehouseId_productId: { tenantId, warehouseId, productId },
    },
    update: {
      quantity: new Prisma.Decimal(quantity),
      avgCost: new Prisma.Decimal(avgCost),
    },
    create: {
      tenantId,
      warehouseId,
      productId,
      quantity: new Prisma.Decimal(quantity),
      avgCost: new Prisma.Decimal(avgCost),
    },
  });
}
