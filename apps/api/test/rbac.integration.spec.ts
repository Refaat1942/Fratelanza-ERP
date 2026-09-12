import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, loginAdmin, request } from './test-app';
import {
  createRoleWithPermissions,
  createTenantUserWithRole,
  perm,
} from './rbac-test.helpers';

describe('RBAC role scenarios', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const auth = await loginAdmin(app);
    tenantId = auth.user.tenantId;

    await prisma.tenantModuleAccess.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId: 'sales' } },
      create: { tenantId, moduleId: 'sales', enabled: true },
      update: { enabled: true },
    });
    await prisma.tenantModuleAccess.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId: 'purchasing' } },
      create: { tenantId, moduleId: 'purchasing', enabled: true },
      update: { enabled: true },
    });
    await prisma.tenantModuleAccess.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId: 'inventory' } },
      create: { tenantId, moduleId: 'inventory', enabled: true },
      update: { enabled: true },
    });
    await prisma.tenantModuleAccess.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId: 'accounting' } },
      create: { tenantId, moduleId: 'accounting', enabled: true },
      update: { enabled: true },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('sales-only user can read sales but not purchasing or accounting journals', async () => {
    const roleId = await createRoleWithPermissions(app, tenantId, `SALES-${Date.now()}`, [
      perm('core', 'dashboard', 'read'),
      perm('sales', 'invoices', 'read'),
      perm('sales', 'invoices', 'create'),
      perm('customers', 'customers', 'read'),
    ]);
    const { token } = await createTenantUserWithRole(app, tenantId, roleId, 'sales-only');

    const sales = await request(app.getHttpServer())
      .get('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${token}`);
    expect(sales.status).toBe(200);

    const purchasing = await request(app.getHttpServer())
      .get('/api/v1/purchasing/orders')
      .set('Authorization', `Bearer ${token}`);
    expect(purchasing.status).toBe(403);

    const journals = await request(app.getHttpServer())
      .get('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${token}`);
    expect(journals.status).toBe(403);
  });

  it('accounting-only user can read journals but not create sales invoices', async () => {
    const roleId = await createRoleWithPermissions(app, tenantId, `ACCT-${Date.now()}`, [
      perm('core', 'dashboard', 'read'),
      perm('accounting', 'journals', 'read'),
      perm('accounting', 'accounts', 'read'),
    ]);
    const { token } = await createTenantUserWithRole(app, tenantId, roleId, 'accounting-only');

    const journals = await request(app.getHttpServer())
      .get('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${token}`);
    expect(journals.status).toBe(200);

    const createInvoice = await request(app.getHttpServer())
      .post('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId: '', lines: [{ description: 'blocked', quantity: 1, unitPrice: 1 }] });
    expect(createInvoice.status).toBe(403);
  });

  it('purchasing-only user can read orders but not sales invoices', async () => {
    const roleId = await createRoleWithPermissions(app, tenantId, `PUR-${Date.now()}`, [
      perm('core', 'dashboard', 'read'),
      perm('purchasing', 'orders', 'read'),
      perm('purchasing', 'orders', 'create'),
      perm('suppliers', 'suppliers', 'read'),
    ]);
    const { token } = await createTenantUserWithRole(app, tenantId, roleId, 'purchasing-only');

    const orders = await request(app.getHttpServer())
      .get('/api/v1/purchasing/orders')
      .set('Authorization', `Bearer ${token}`);
    expect(orders.status).toBe(200);

    const sales = await request(app.getHttpServer())
      .get('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${token}`);
    expect(sales.status).toBe(403);
  });

  it('inventory-only user can read balances but not post sales invoices', async () => {
    const roleId = await createRoleWithPermissions(app, tenantId, `INV-${Date.now()}`, [
      perm('core', 'dashboard', 'read'),
      perm('inventory', 'stock', 'read'),
      perm('inventory', 'movements', 'read'),
    ]);
    const { token } = await createTenantUserWithRole(app, tenantId, roleId, 'inventory-only');

    const balances = await request(app.getHttpServer())
      .get('/api/v1/inventory/balances')
      .set('Authorization', `Bearer ${token}`);
    expect(balances.status).toBe(200);

    const post = await request(app.getHttpServer())
      .post('/api/v1/sales/invoices/fake-id/post')
      .set('Authorization', `Bearer ${token}`);
    expect(post.status).toBe(403);
  });

  it('admin user retains broad access', async () => {
    const auth = await loginAdmin(app);

    const sales = await request(app.getHttpServer())
      .get('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${auth.accessToken}`);
    expect(sales.status).toBe(200);

    const purchasing = await request(app.getHttpServer())
      .get('/api/v1/purchasing/orders')
      .set('Authorization', `Bearer ${auth.accessToken}`);
    expect(purchasing.status).toBe(200);
  });

  it('module access guard blocks sales when module disabled even with permissions', async () => {
    const auth = await loginAdmin(app);
    await prisma.tenantModuleAccess.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId: 'sales' } },
      create: { tenantId, moduleId: 'sales', enabled: false },
      update: { enabled: false },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${auth.accessToken}`);
    expect(res.status).toBe(403);

    await prisma.tenantModuleAccess.update({
      where: { tenantId_moduleId: { tenantId, moduleId: 'sales' } },
      data: { enabled: true },
    });
  });
});
