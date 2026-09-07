import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { LicenseService } from '../src/modules/license/license.service';
import { DEMO_ENABLED_MODULES } from '../src/modules/license/catalog/module-catalog';
import {
  buildTestActivationInput,
  getTestSigningPrivateKey,
  signTestActivationForTenant,
  signTestActivationInput,
} from './license-test.helpers';
import { createTestApp, loginAdmin, request } from './test-app';
import { defaultModuleEntries } from '../src/modules/license/verification/license-verifier.interface';

describe('License hardening (Phase 4.5.1)', () => {
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

  it('keeps PERPETUAL license active regardless of elapsed time fields', async () => {
    const resolved = await licenseService.getLicenseForTenant(tenantId);
    expect(resolved?.licenseType).toBe('perpetual');
    expect(resolved?.status).toBe('active');
    expect(resolved?.isOperational).toBe(true);

    const res = await request(app.getHttpServer())
      .get('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it('does not auto-expire PERPETUAL license when legacy expiresAt exists in DB', async () => {
    const current = await prisma.tenantLicense.findUnique({ where: { tenantId } });
    const resolved = await licenseService.resolveEffectiveStatus({
      ...current!,
      licenseType: 'perpetual',
      expiresAt: new Date('2000-01-01'),
      graceEndsAt: null,
    });
    expect(resolved.status).toBe('active');
  });

  it('expires TIME_LIMITED license after expiration date', async () => {
    const signed = await signTestActivationForTenant(prisma, tenantId, {
      licenseType: 'time_limited',
      expiresAt: new Date('2010-01-01').toISOString(),
      graceDays: 0,
    });
    await licenseService.activateLicense(tenantId, signed);

    const resolved = await licenseService.getLicenseForTenant(tenantId);
    expect(resolved?.status).toBe('expired');
    expect(resolved?.isOperational).toBe(false);
  });

  it('allows TIME_LIMITED grace period operations', async () => {
    const signed = await signTestActivationForTenant(prisma, tenantId, {
      licenseType: 'time_limited',
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
      graceDays: 30,
    });
    await licenseService.activateLicense(tenantId, signed);

    const resolved = await licenseService.getLicenseForTenant(tenantId);
    expect(resolved?.status).toBe('grace');
    expect(resolved?.isOperational).toBe(true);
  });

  it('blocks licensed modules when TIME_LIMITED license is expired', async () => {
    const signed = await signTestActivationForTenant(prisma, tenantId, {
      licenseType: 'time_limited',
      expiresAt: new Date('2015-01-01').toISOString(),
      graceDays: 0,
    });
    await licenseService.activateLicense(tenantId, signed);

    const res = await request(app.getHttpServer())
      .get('/api/v1/parties')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it('keeps perpetual module entitlement active without module expiration', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/parties')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it('blocks time-limited module after module term expiration', async () => {
    const signed = await signTestActivationForTenant(prisma, tenantId, {
      modules: [
        ...defaultModuleEntries(DEMO_ENABLED_MODULES.filter((m) => m !== 'pms'), 'perpetual'),
        {
          key: 'pms',
          termType: 'time_limited',
          expiresAt: new Date('2010-01-01').toISOString(),
        },
      ],
    });
    await licenseService.activateLicense(tenantId, signed);

    const res = await request(app.getHttpServer())
      .get('/api/v1/pms/patients')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects tampered edition in local license record', async () => {
    await prisma.tenantLicense.update({
      where: { tenantId },
      data: { edition: 'starter' },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects tampered module entitlement in local license record', async () => {
    const license = await prisma.tenantLicense.findUnique({ where: { tenantId } });
    await prisma.licenseModuleEntitlement.create({
      data: {
        tenantId,
        licenseId: license!.id,
        moduleKey: 'construction',
        termType: 'perpetual',
        isEnabled: true,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/pms/patients')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects tampered feature entitlement in local license record', async () => {
    await prisma.licenseFeatureEntitlement.delete({
      where: { tenantId_featureKey: { tenantId, featureKey: 'finance.financial-posting' } },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects tampered user limit in local license record', async () => {
    await prisma.tenantLicense.update({
      where: { tenantId },
      data: { maxUsers: 9999 },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects tampered branch limit in local license record', async () => {
    await prisma.tenantLicense.update({
      where: { tenantId },
      data: { maxBranches: 9999 },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects tampered expiration on TIME_LIMITED license record', async () => {
    const signed = await signTestActivationForTenant(prisma, tenantId, {
      licenseType: 'time_limited',
      expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      graceDays: 30,
    });
    await licenseService.activateLicense(tenantId, signed);

    await prisma.tenantLicense.update({
      where: { tenantId },
      data: { expiresAt: new Date('2099-01-01') },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects license copied to another tenant', async () => {
    const payload = await signTestActivationForTenant(prisma, tenantId);
    const otherTenant = await prisma.tenant.create({
      data: { name: 'Copy Target', code: `COPY-${Date.now()}`, settings: {} },
    });

    await expect(
      licenseService.activateLicense(otherTenant.id, {
        ...payload,
        tenantId: otherTenant.id,
      }),
    ).rejects.toThrow(/signature|tenant binding/i);
  });

  it('rejects activation when signature tenantId does not match route tenant', async () => {
    const payload = await signTestActivationForTenant(prisma, tenantId);
    const otherTenant = await prisma.tenant.create({
      data: { name: 'Mismatch', code: `MIS-${Date.now()}`, settings: {} },
    });

    await expect(
      licenseService.activateLicense(otherTenant.id, payload),
    ).rejects.toThrow(/tenant binding/i);
  });

  it('validates entitlements locally without network dependency', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/license/entitlements')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.licenseType).toBe('perpetual');
    expect(res.body.data).not.toHaveProperty('payloadSignature');
  });

  it('does not trust stale tenant_modules flags over TenantLicense', async () => {
    await prisma.tenantModule.update({
      where: { tenantId_moduleId: { tenantId, moduleId: 'finance' } },
      data: { isEnabled: false },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it('does not expose private signing material in admin license response', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/license')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.license).not.toHaveProperty('payloadSignature');
    expect(res.body.data.license).not.toHaveProperty('payloadDigest');
    expect(JSON.stringify(res.body.data)).not.toMatch(/PRIVATE KEY/i);
  });

  it('rejects PERPETUAL activation payload that includes expiresAt', async () => {
    await expect(
      licenseService.activateLicense(
        tenantId,
        buildTestActivationInput(tenantId, {
          licenseType: 'perpetual',
          expiresAt: new Date('2099-01-01').toISOString(),
        }),
      ),
    ).rejects.toThrow(/expiresAt/i);
  });

  it('requires expiresAt for TIME_LIMITED activation payload', async () => {
    await expect(
      licenseService.activateLicense(
        tenantId,
        buildTestActivationInput(tenantId, {
          licenseType: 'time_limited',
          expiresAt: null,
        }),
      ),
    ).rejects.toThrow(/expiresAt/i);
  });
});
