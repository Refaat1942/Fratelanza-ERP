import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createIsolatedTenant } from './pms-test.helpers';
import {
  loadInventoryTestContext,
  seedStockBalance,
  type InventoryTestContext,
} from './inventory-test.helpers';
import { createTestApp, loginAdmin, request } from './test-app';

describe('Universal Inventory foundation (Phase 7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: InventoryTestContext;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ctx = await loadInventoryTestContext(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Adjustment', () => {
    it('succeeds with correct tenant, warehouse, and product', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          warehouseId: ctx.warehouseId,
          productId: ctx.productId,
          quantity: 5,
          notes: 'Phase 7 adjust in',
          branchId: ctx.branchId,
        });
      expect(res.status).toBe(201);
      expect(res.body.data.movementType).toBe('adjustment_in');
    });

    it('rejects cross-tenant product on adjustment', async () => {
      const isolated = await createIsolatedTenant(prisma, 'inv-prod');
      const unit = await prisma.unitOfMeasure.create({
        data: {
          tenantId: isolated.tenantId,
          code: `ISO-U-${Date.now()}`,
          name: 'Isolated Unit',
        },
      });
      const isolatedProduct = await prisma.product.create({
        data: {
          tenantId: isolated.tenantId,
          sku: `ISO-P-${Date.now()}`,
          name: 'Isolated Product',
          unitId: unit.id,
          salePrice: 10,
          costPrice: 5,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          warehouseId: ctx.warehouseId,
          productId: isolatedProduct.id,
          quantity: 1,
        });
      expect(res.status).toBe(400);
      expect(String(res.body.error?.message ?? res.body.message)).toMatch(/product not found/i);
    });

    it('rejects cross-tenant warehouse on adjustment', async () => {
      const isolated = await createIsolatedTenant(prisma, 'inv-wh');
      const isolatedWarehouse = await prisma.warehouse.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `ISO-W-${Date.now()}`,
          name: 'Isolated Warehouse',
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          warehouseId: isolatedWarehouse.id,
          productId: ctx.productId,
          quantity: 1,
        });
      expect(res.status).toBe(400);
      expect(String(res.body.error?.message ?? res.body.message)).toMatch(/warehouse not found/i);
    });

    it('rejects adjustment when warehouse branch does not match branch context', async () => {
      const otherBranch = await prisma.branch.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'Secondary Branch',
          code: `BR-P7-${Date.now()}`,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          warehouseId: ctx.warehouseId,
          productId: ctx.productId,
          quantity: 1,
          branchId: otherBranch.id,
        });
      expect(res.status).toBe(400);
      expect(String(res.body.error?.message ?? res.body.message)).toMatch(/branch/i);
    });

    it('updates stock balance and creates movement ledger row', async () => {
      const before = await prisma.stockBalance.findUnique({
        where: {
          tenantId_warehouseId_productId: {
            tenantId: ctx.tenantId,
            warehouseId: ctx.warehouseId,
            productId: ctx.productId,
          },
        },
      });
      const startingQty = Number(before?.quantity ?? 0);

      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ warehouseId: ctx.warehouseId, productId: ctx.productId, quantity: -2 });
      expect(res.status).toBe(201);

      const after = await prisma.stockBalance.findUnique({
        where: {
          tenantId_warehouseId_productId: {
            tenantId: ctx.tenantId,
            warehouseId: ctx.warehouseId,
            productId: ctx.productId,
          },
        },
      });
      expect(Number(after?.quantity)).toBe(startingQty - 2);

      const movement = await prisma.inventoryMovement.findUnique({
        where: { id: res.body.data.id },
      });
      expect(movement).toBeTruthy();
      expect(movement?.movementType).toBe('adjustment_out');
    });

    it('rolls back when adjustment would cause insufficient stock', async () => {
      await seedStockBalance(prisma, ctx.tenantId, ctx.warehouseId, ctx.productId, 1);

      const movementsBefore = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId, productId: ctx.productId },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ warehouseId: ctx.warehouseId, productId: ctx.productId, quantity: -5 });
      expect(res.status).toBeGreaterThanOrEqual(400);

      const movementsAfter = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId, productId: ctx.productId },
      });
      expect(movementsAfter).toBe(movementsBefore);

      const balance = await prisma.stockBalance.findUnique({
        where: {
          tenantId_warehouseId_productId: {
            tenantId: ctx.tenantId,
            warehouseId: ctx.warehouseId,
            productId: ctx.productId,
          },
        },
      });
      expect(Number(balance?.quantity)).toBe(1);
    });
  });

  describe('Tenant isolation', () => {
    it('rejects cross-tenant warehouse filter on stock read', async () => {
      const isolated = await createIsolatedTenant(prisma, 'inv-read-bal');
      const isolatedWarehouse = await prisma.warehouse.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `ISO-RB-${Date.now()}`,
          name: 'Isolated Read Warehouse',
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances?warehouseId=${isolatedWarehouse.id}`)
        .set('Authorization', `Bearer ${ctx.accessToken}`);
      expect(res.status).toBe(400);
      expect(String(res.body.error?.message ?? res.body.message)).toMatch(/warehouse not found/i);
    });

    it('rejects cross-tenant warehouse filter on movement ledger read', async () => {
      const isolated = await createIsolatedTenant(prisma, 'inv-read-mv');
      const isolatedWarehouse = await prisma.warehouse.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `ISO-RM-${Date.now()}`,
          name: 'Isolated Movement Warehouse',
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/inventory/movements?warehouseId=${isolatedWarehouse.id}`)
        .set('Authorization', `Bearer ${ctx.accessToken}`);
      expect(res.status).toBe(400);
      expect(String(res.body.error?.message ?? res.body.message)).toMatch(/warehouse not found/i);
    });
  });

  describe('Audit', () => {
    it('creates inventory.adjustment.created audit event on adjust', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          warehouseId: ctx.warehouseId,
          productId: ctx.productId,
          quantity: 3,
          notes: 'Audit trail',
        });
      expect(res.status).toBe(201);

      const audit = await prisma.auditLog.findFirst({
        where: {
          tenantId: ctx.tenantId,
          entity: 'inventory_movement',
          entityId: res.body.data.id,
          action: 'inventory.adjustment.created',
        },
      });
      expect(audit).toBeTruthy();
      expect(audit?.newValue).toMatchObject({
        productId: ctx.productId,
        warehouseId: ctx.warehouseId,
        movementType: 'adjustment_in',
        quantity: 3,
      });
    });
  });

  describe('RBAC', () => {
    it('rejects Inventory adjust when user lacks RBAC permission', async () => {
      const role = await prisma.role.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'No Inventory Adjust',
          code: `no-inv-adj-${Date.now()}`,
        },
      });
      const readPerm = await prisma.permission.findFirst({
        where: { module: 'inventory', feature: 'stock', action: 'read' },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: readPerm!.id },
      });
      const username = `no-inv-adj-${Date.now()}`;
      const user = await prisma.user.create({
        data: {
          tenantId: ctx.tenantId,
          email: `${username}@fratelanza.local`,
          passwordHash: '$2a$12$placeholder',
          firstName: 'No',
          lastName: 'Adjust',
          roleId: role.id,
          isActive: true,
        },
      });
      const bcrypt = await import('bcryptjs');
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash('Admin@123456', 12) },
      });

      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username, password: 'Admin@123456' });
      expect(login.status).toBe(200);

      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .send({ warehouseId: ctx.warehouseId, productId: ctx.productId, quantity: 1 });
      expect(res.status).toBe(403);
    });

    it('accepts authorized Inventory read', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/inventory/movements')
        .set('Authorization', `Bearer ${ctx.accessToken}`);
      expect(res.status).toBe(200);
    });
  });
});
