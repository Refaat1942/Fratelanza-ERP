import type { INestApplication } from '@nestjs/common';
import { resetAppConfigCache } from '../src/config/app-config';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, loginAdmin, request, resetDemoTenant } from './test-app';

describe('Commercial deployment foundation (Phase 10.0)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;
  let accessToken: string;
  const originalInstallationId = process.env.FRATELANZA_INSTALLATION_ID;

  beforeAll(async () => {
    delete process.env.FRATELANZA_INSTALLATION_ID;
    resetAppConfigCache();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const auth = await loginAdmin(app);
    accessToken = auth.accessToken;
    tenantId = auth.user.tenantId;
    await resetDemoTenant(app);
  });

  afterAll(async () => {
    if (originalInstallationId) {
      process.env.FRATELANZA_INSTALLATION_ID = originalInstallationId;
    } else {
      delete process.env.FRATELANZA_INSTALLATION_ID;
    }
    resetAppConfigCache();
    await app.close();
  });

  it('GET /system/version returns unified API version', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/system/version');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.apiVersion).toBeTruthy();
    expect(res.body.data.product).toBe('Fratelanza Business Platform');
  });

  it('GET /health returns version from unified source', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBeTruthy();
    expect(res.body.data.status).toMatch(/healthy|degraded/);
  });

  it('GET /system/diagnostics requires authentication and settings read permission', async () => {
    const unauth = await request(app.getHttpServer()).get('/api/v1/system/diagnostics');
    expect(unauth.status).toBe(401);

    const res = await request(app.getHttpServer())
      .get('/api/v1/system/diagnostics')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.apiVersion).toBeTruthy();
    expect(res.body.data.tenant).toMatchObject({ id: tenantId });
    expect(res.body.data.server).toBeTruthy();
    expect(res.body.data.database).toBeTruthy();
    expect(res.body.data).not.toHaveProperty('jwtSecret');
    expect(res.body.data).not.toHaveProperty('license');
    expect(res.body.data).not.toHaveProperty('entitlements');
  });
});
