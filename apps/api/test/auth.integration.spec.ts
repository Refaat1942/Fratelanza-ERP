import type { INestApplication } from '@nestjs/common';
import { createTestApp, loginAdmin, request } from './test-app';

describe('Auth integration (Phase 0)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in with valid credentials', async () => {
    const auth = await loginAdmin(app);
    expect(auth.accessToken).toBeTruthy();
    expect(auth.refreshToken).toBeTruthy();
  });

  it('rejects protected route without token', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/settings');
    expect(res.status).toBe(401);
  });

  it('revokes session on logout and rejects old access token', async () => {
    const auth = await loginAdmin(app);
    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${auth.accessToken}`);
    expect(logout.status).toBe(200);

    const settings = await request(app.getHttpServer())
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${auth.accessToken}`);
    expect(settings.status).toBe(401);
  });

  it('rotates refresh token and invalidates the old refresh token', async () => {
    const auth = await loginAdmin(app);
    const first = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: auth.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.data.refreshToken).not.toBe(auth.refreshToken);

    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: auth.refreshToken });
    expect(second.status).toBe(401);
  });

  it('returns service unavailable when sync is disabled', async () => {
    const auth = await loginAdmin(app);
    const res = await request(app.getHttpServer())
      .get('/api/v1/sync/status?deviceId=test-device')
      .set('Authorization', `Bearer ${auth.accessToken}`);
    expect(res.status).toBe(503);
  });
});
