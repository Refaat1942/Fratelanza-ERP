import type { INestApplication } from '@nestjs/common';
import { resetAppConfigCache } from '../src/config/app-config';
import { PrismaService } from '../src/database/prisma.service';
import { LicenseService } from '../src/modules/license/license.service';
import { signTestActivationForTenant } from './license-test.helpers';
import { createTestApp, loginAdmin, request, resetDemoTenant } from './test-app';

describe('Commercial deployment foundation (Phase 10.0)', () => {
  let app: INestApplication;
  let licenseService: LicenseService;
  let prisma: PrismaService;
  let tenantId: string;
  let accessToken: string;
  const originalInstallationId = process.env.FRATELANZA_INSTALLATION_ID;

  async function restoreDemoLicense() {
    if (originalInstallationId) {
      process.env.FRATELANZA_INSTALLATION_ID = originalInstallationId;
    } else {
      delete process.env.FRATELANZA_INSTALLATION_ID;
    }
    resetAppConfigCache();
    await licenseService.seedDemoLicense(tenantId);
  }

  beforeAll(async () => {
    delete process.env.FRATELANZA_INSTALLATION_ID;
    resetAppConfigCache();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    licenseService = app.get(LicenseService);
    const auth = await loginAdmin(app);
    accessToken = auth.accessToken;
    tenantId = auth.user.tenantId;
    await resetDemoTenant(app);
  });

  afterAll(async () => {
    await restoreDemoLicense();
    await app.close();
  });

  afterEach(async () => {
    await restoreDemoLicense();
  });

  it('GET /system/version returns unified API version', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/system/version');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.apiVersion).toBeTruthy();
    expect(res.body.data.product).toBe('Fratelanza Grand ERP');
  });

  it('GET /health returns version from unified source', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBeTruthy();
    expect(res.body.data.status).toMatch(/healthy|degraded/);
  });

  it('GET /system/diagnostics requires authentication and license read permission', async () => {
    const unauth = await request(app.getHttpServer()).get('/api/v1/system/diagnostics');
    expect(unauth.status).toBe(401);

    const res = await request(app.getHttpServer())
      .get('/api/v1/system/diagnostics')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.apiVersion).toBeTruthy();
    expect(res.body.data.tenant).toMatchObject({ id: tenantId });
    expect(res.body.data.entitlements.enabledModules).toContain('core');
    expect(res.body.data.license).toBeTruthy();
    expect(res.body.data.server).toBeTruthy();
    expect(res.body.data).not.toHaveProperty('jwtSecret');
  });

  it('rejects license activation when installationId does not match server binding', async () => {
    process.env.FRATELANZA_INSTALLATION_ID = 'server-install-abc';
    resetAppConfigCache();
    const signed = await signTestActivationForTenant(prisma, tenantId, {
      installationId: 'wrong-install-id',
    });

    await expect(licenseService.activateLicense(tenantId, signed)).rejects.toThrow(
      /installation binding/,
    );
  });

  it('accepts license activation when installationId matches server binding', async () => {
    process.env.FRATELANZA_INSTALLATION_ID = 'server-install-abc';
    resetAppConfigCache();
    const signed = await signTestActivationForTenant(prisma, tenantId, {
      installationId: 'server-install-abc',
    });

    const result = await licenseService.activateLicense(tenantId, signed);
    expect(result?.installationId).toBe('server-install-abc');
  });

  it('perpetual license remains operational without expiry enforcement', async () => {
    const signed = await signTestActivationForTenant(prisma, tenantId, {
      licenseType: 'perpetual',
      expiresAt: null,
    });
    await licenseService.activateLicense(tenantId, signed);

    const res = await request(app.getHttpServer())
      .get('/api/v1/parties')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });
});
