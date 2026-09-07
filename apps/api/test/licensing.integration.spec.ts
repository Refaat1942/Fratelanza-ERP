import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { LicenseService } from '../src/modules/license/license.service';
import { DEMO_ENABLED_MODULES } from '../src/modules/license/catalog/module-catalog';
import { DEMO_ENABLED_FEATURES } from '../src/modules/license/catalog/feature-catalog';
import {
  buildTestActivationInput,
  signTestActivationForTenant,
} from './license-test.helpers';
import { createTestApp, loginAdmin, request } from './test-app';
import { defaultModuleEntries } from '../src/modules/license/verification/license-verifier.interface';

describe('Licensing integration (Phase 4.5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let licenseService: LicenseService;
  let tenantId: string;
  let accessToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    licenseService = app.get(LicenseService);
    const auth = await loginAdmin(app);
    accessToken = auth.accessToken;
    tenantId = auth.user.tenantId;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await licenseService.seedDemoLicense(tenantId);
  });

  it('accepts active license for licensed module access', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it('rejects expired time-limited license for licensed module operations', async () => {
    const signed = await signTestActivationForTenant(prisma, tenantId, {
      licenseType: 'time_limited',
      expiresAt: new Date('2010-01-01').toISOString(),
      graceDays: 0,
    });
    await licenseService.activateLicense(tenantId, signed);

    const res = await request(app.getHttpServer())
      .get('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it('allows grace-state time-limited licensed operations', async () => {
    const expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const signed = await signTestActivationForTenant(prisma, tenantId, {
      licenseType: 'time_limited',
      expiresAt: expiresAt.toISOString(),
      graceDays: 30,
    });
    await licenseService.activateLicense(tenantId, signed);

    const res = await request(app.getHttpServer())
      .get('/api/v1/parties')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it('rejects suspended license for licensed modules', async () => {
    await licenseService.updateLicenseStatus(tenantId, 'suspended');
    const res = await request(app.getHttpServer())
      .get('/api/v1/pms/patients')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
    await licenseService.seedDemoLicense(tenantId);
  });

  it('rejects revoked license for licensed modules', async () => {
    await licenseService.updateLicenseStatus(tenantId, 'revoked');
    const res = await request(app.getHttpServer())
      .get('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
    await licenseService.seedDemoLicense(tenantId);
  });

  it('still allows core settings access when time-limited license expired', async () => {
    const signed = await signTestActivationForTenant(prisma, tenantId, {
      licenseType: 'time_limited',
      expiresAt: new Date('2010-01-01').toISOString(),
      graceDays: 0,
    });
    await licenseService.activateLicense(tenantId, signed);

    const res = await request(app.getHttpServer())
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it('rejects unlicensed module via signed activation payload', async () => {
    const signed = await signTestActivationForTenant(prisma, tenantId, {
      modules: defaultModuleEntries(
        DEMO_ENABLED_MODULES.filter((m) => m !== 'pms'),
      ),
    });
    await licenseService.activateLicense(tenantId, signed);

    const res = await request(app.getHttpServer())
      .get('/api/v1/pms/patients')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it('enforces module dependency configuration on activation', async () => {
    const payload = buildTestActivationInput(tenantId, {
      licenseKey: 'FRZ-INVALID-DEPS',
      modules: [{ key: 'construction', termType: 'perpetual', expiresAt: null }],
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/license/activate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload);
    expect(res.status).toBe(400);
    expect(String(res.body.error?.message ?? res.body.message)).toMatch(/projects/i);
  });

  it('rejects unlicensed feature via signed activation payload', async () => {
    const signed = await signTestActivationForTenant(prisma, tenantId, {
      features: DEMO_ENABLED_FEATURES.filter((f) => f !== 'finance.financial-posting'),
    });
    await licenseService.activateLicense(tenantId, signed);

    const branch = await prisma.branch.findFirst({ where: { tenantId } });
    const res = await request(app.getHttpServer())
      .post('/api/v1/finance/postings/lines')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId: branch!.id,
        postingDate: new Date().toISOString(),
        description: 'Feature gate test',
        sourceModule: 'test',
        sourceType: 'test',
        sourceId: 'test-feature-gate',
        sourceEvent: 'post',
        lines: [
          { accountRole: 'cash', debit: '1.00', credit: '0.00' },
          { accountRole: 'revenue', debit: '0.00', credit: '1.00' },
        ],
      });
    expect(res.status).toBe(403);
  });

  it('accepts usage below user limit', async () => {
    const activeUsers = await prisma.user.count({
      where: { tenantId, deletedAt: null, isActive: true },
    });
    await prisma.tenantLicense.update({
      where: { tenantId },
      data: { maxUsers: activeUsers + 5 },
    });
    const role = await prisma.role.findFirst({ where: { tenantId, code: 'owner' } });
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: `limit-ok-${Date.now()}@fratelanza.local`,
        password: 'Admin@123456',
        firstName: 'Limit',
        lastName: 'Ok',
        roleId: role!.id,
      });
    expect(res.status).toBe(201);
  });

  it('allows user creation up to licensed max users', async () => {
    const activeUsers = await prisma.user.count({
      where: { tenantId, deletedAt: null, isActive: true },
    });
    await prisma.tenantLicense.update({
      where: { tenantId },
      data: { maxUsers: activeUsers + 1 },
    });
    const role = await prisma.role.findFirst({ where: { tenantId, code: 'owner' } });
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: `limit-max-${Date.now()}@fratelanza.local`,
        password: 'Admin@123456',
        firstName: 'Limit',
        lastName: 'Max',
        roleId: role!.id,
      });
    expect(res.status).toBe(201);
  });

  it('rejects user creation at license limit', async () => {
    const activeUsers = await prisma.user.count({
      where: { tenantId, deletedAt: null, isActive: true },
    });
    await prisma.tenantLicense.update({
      where: { tenantId },
      data: { maxUsers: activeUsers },
    });

    const role = await prisma.role.findFirst({ where: { tenantId, code: 'owner' } });
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: `limit-block-${Date.now()}@fratelanza.local`,
        password: 'Admin@123456',
        firstName: 'Limit',
        lastName: 'Block',
        roleId: role!.id,
      });
    expect(res.status).toBe(403);
    expect(String(res.body.error?.message ?? res.body.message)).toMatch(/maxUsers/i);

    await prisma.tenantLicense.update({
      where: { tenantId },
      data: { maxUsers: 100 },
    });
  });

  it('rejects branch creation at license limit', async () => {
    const activeBranches = await prisma.branch.count({
      where: { tenantId, deletedAt: null, isActive: true },
    });
    await prisma.tenantLicense.update({
      where: { tenantId },
      data: { maxBranches: activeBranches },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Limit Branch', code: `LB-${Date.now()}` });
    expect(res.status).toBe(403);

    await prisma.tenantLicense.update({
      where: { tenantId },
      data: { maxBranches: 20 },
    });
  });

  it('returns entitlement snapshot for current tenant only', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/license/entitlements')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.edition).toBeTruthy();
    expect(res.body.data.modules.some((m: { key: string }) => m.key === 'finance')).toBe(true);
    expect(res.body.data).not.toHaveProperty('payloadDigest');
    expect(JSON.stringify(res.body.data)).not.toMatch(/private/i);
  });

  it('does not expose license admin data without permission on /license', async () => {
    const limitedRole = await prisma.role.create({
      data: {
        tenantId,
        name: 'Limited',
        code: `limited-${Date.now()}`,
      },
    });
    const readParties = await prisma.permission.findFirst({
      where: { module: 'parties', feature: 'parties', action: 'read' },
    });
    await prisma.rolePermission.create({
      data: { roleId: limitedRole.id, permissionId: readParties!.id },
    });
    const limitedUser = await prisma.user.create({
      data: {
        tenantId,
        email: `limited-${Date.now()}@fratelanza.local`,
        passwordHash: await hashPassword('Admin@123456'),
        firstName: 'Limited',
        lastName: 'User',
        roleId: limitedRole.id,
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: limitedUser.email, password: 'Admin@123456' });
    expect(login.status).toBe(200);

    const adminView = await request(app.getHttpServer())
      .get('/api/v1/license')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(adminView.status).toBe(403);
  });

  it('rejects licensed + unauthorized user (RBAC)', async () => {
    const role = await prisma.role.create({
      data: { tenantId, name: 'No Finance', code: `no-fin-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `no-fin-${Date.now()}@fratelanza.local`,
        passwordHash: await hashPassword('Admin@123456'),
        firstName: 'No',
        lastName: 'Finance',
        roleId: role.id,
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'Admin@123456' });
    expect(login.status).toBe(200);

    const res = await request(app.getHttpServer())
      .get('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects unlicensed module even when user has RBAC permission', async () => {
    const signed = await signTestActivationForTenant(prisma, tenantId, {
      modules: defaultModuleEntries(
        DEMO_ENABLED_MODULES.filter((m) => m !== 'finance' && m !== 'accounting'),
      ),
    });
    await licenseService.activateLicense(tenantId, signed);

    const res = await request(app.getHttpServer())
      .get('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it('isolates license data across tenants', async () => {
    const otherTenant = await prisma.tenant.create({
      data: {
        name: 'Other Tenant',
        code: `OTHER-${Date.now()}`,
        settings: {},
      },
    });
    await licenseService.seedDemoLicense(otherTenant.id);

    const otherLicense = await prisma.tenantLicense.findUnique({
      where: { tenantId: otherTenant.id },
    });
    const demoLicense = await prisma.tenantLicense.findUnique({
      where: { tenantId },
    });

    expect(otherLicense?.licenseKey).not.toBe(demoLicense?.licenseKey);
    expect(otherLicense?.tenantId).not.toBe(tenantId);
  });

  it('does not leak secrets in license admin response', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/license')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.license).not.toHaveProperty('payloadDigest');
  });

  it('activates license with valid signed payload via admin endpoint', async () => {
    const payload = await signTestActivationForTenant(prisma, tenantId, {
      licenseKey: `FRZ-TEST-${Date.now()}`,
      modules: defaultModuleEntries(DEMO_ENABLED_MODULES, 'perpetual'),
      features: DEMO_ENABLED_FEATURES,
      maxUsers: 100,
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/license/activate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload);
    expect(res.status).toBe(201);
    expect(res.body.data?.status ?? res.body.data?.license?.status).toBeTruthy();
  });
});

async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, 12);
}
