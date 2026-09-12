import type { INestApplication } from '@nestjs/common';
import { createTestApp, loginAdmin, request } from './test-app';

describe('Control Center API protection', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('tenant admin cannot access platform organizations API', async () => {
    const auth = await loginAdmin(app);
    const res = await request(app.getHttpServer())
      .get('/api/v1/platform/organizations')
      .set('Authorization', `Bearer ${auth.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('tenant admin cannot access platform dashboard API', async () => {
    const auth = await loginAdmin(app);
    const res = await request(app.getHttpServer())
      .get('/api/v1/platform/dashboard')
      .set('Authorization', `Bearer ${auth.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('platform admin can access Control Center APIs', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        username: 'platform-admin',
        password: process.env.DEMO_SEED_PASSWORD ?? 'Eval@2026!Demo',
      });
    expect(login.status).toBe(200);
    const token = login.body.data.accessToken as string;

    const orgs = await request(app.getHttpServer())
      .get('/api/v1/platform/organizations')
      .set('Authorization', `Bearer ${token}`);
    expect(orgs.status).toBe(200);
    expect(Array.isArray(orgs.body.data)).toBe(true);

    const dashboard = await request(app.getHttpServer())
      .get('/api/v1/platform/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(dashboard.status).toBe(200);
  });

  it('unauthenticated requests to platform APIs are rejected', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/platform/organizations');
    expect(res.status).toBe(401);
  });
});
