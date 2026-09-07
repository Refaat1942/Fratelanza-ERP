import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import {
  ConstructionCostCategory,
  PartyRoleType,
} from '../../../packages/database/generated/server';
import { LicenseService } from '../src/modules/license/license.service';
import { PrismaService } from '../src/database/prisma.service';
import {
  activateConstructionLicense,
  createUniversalProject,
  enableConstructionProfile,
  loadConstructionTestContext,
} from './construction-test.helpers';
import { signTestActivationForTenant, buildTestActivationInput } from './license-test.helpers';
import { DEMO_ENABLED_MODULES } from '../src/modules/license/catalog/module-catalog';
import { defaultModuleEntries } from '../src/modules/license/verification/license-verifier.interface';
import { createTestApp, loginAdmin, request } from './test-app';

describe('Construction foundation (Phase 9.0)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let licenseService: LicenseService;
  let ctx: Awaited<ReturnType<typeof loadConstructionTestContext>>;
  let projectId: string;
  let costCenterId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    licenseService = app.get(LicenseService);
    ctx = await loadConstructionTestContext(app);
    await activateConstructionLicense(prisma, ctx.tenantId, licenseService);

    const project = await createUniversalProject(app, ctx.accessToken);
    projectId = project.id;

    const cc = await request(app.getHttpServer())
      .post('/api/v1/cost-centers')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        code: `CC-CON-${Date.now()}`,
        name: 'Concrete Works',
        projectId,
      });
    expect(cc.status).toBe(201);
    costCenterId = cc.body.data.id;

    await enableConstructionProfile(app, ctx.accessToken, projectId);
  });

  afterAll(async () => {
    await licenseService.seedDemoLicense(ctx.tenantId);
    await app.close();
  });

  function api() {
    return {
      get: (url: string) =>
        request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${ctx.accessToken}`),
      post: (url: string) =>
        request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${ctx.accessToken}`),
    };
  }

  describe('Licensing', () => {
    it('rejects construction routes without construction module entitlement', async () => {
      const signed = await signTestActivationForTenant(prisma, ctx.tenantId, {
        modules: defaultModuleEntries(
          DEMO_ENABLED_MODULES.filter((m) => m !== 'construction'),
          'perpetual',
        ),
      });
      await licenseService.activateLicense(ctx.tenantId, signed);

      const res = await api().get(`/api/v1/construction/projects/${projectId}/profile`);
      expect(res.status).toBe(403);

      await activateConstructionLicense(prisma, ctx.tenantId, licenseService);
    });

    it('rejects construction activation when projects module is missing', async () => {
      const payload = buildTestActivationInput(ctx.tenantId, {
        licenseKey: 'FRZ-NO-PROJECTS-CON',
        modules: defaultModuleEntries(
          ['core', 'finance', 'party', 'construction'],
          'perpetual',
        ),
        features: ['construction.foundation'],
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/license/activate')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send(payload);
      expect(res.status).toBe(400);
      expect(String(res.body.error?.message ?? res.body.message)).toMatch(/projects/i);
    });
  });

  describe('Project profile extension', () => {
    it('returns construction profile linked to universal project', async () => {
      const res = await api().get(`/api/v1/construction/projects/${projectId}/profile`);
      expect(res.status).toBe(200);
      expect(res.body.data.projectId).toBe(projectId);
      expect(res.body.data.project.code).toBeDefined();
      expect(res.body.data.project.name).toBeDefined();
    });

    it('rejects duplicate profile for same project', async () => {
      const res = await api().post(`/api/v1/construction/projects/${projectId}/profile`).send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Cost subledger', () => {
    const sourceId = randomUUID();

    it('records append-only cost entry with project and cost center', async () => {
      const res = await api()
        .post(`/api/v1/construction/projects/${projectId}/cost-entries`)
        .send({
          category: ConstructionCostCategory.material,
          amount: '1500.5000',
          costCenterId,
          sourceModule: 'construction',
          sourceType: 'manual',
          sourceId,
          sourceEvent: 'record',
          description: 'Cement delivery',
          occurredAt: new Date().toISOString().slice(0, 10),
        });

      expect(res.status).toBe(201);
      expect(res.body.meta.created).toBe(true);
      expect(res.body.data.amount).toBe('1500.5');
      expect(res.body.data.projectId).toBe(projectId);
      expect(res.body.data.costCenterId).toBe(costCenterId);
    });

    it('is idempotent for duplicate source identity', async () => {
      const res = await api()
        .post(`/api/v1/construction/projects/${projectId}/cost-entries`)
        .send({
          category: ConstructionCostCategory.material,
          amount: '1500.5000',
          costCenterId,
          sourceModule: 'construction',
          sourceType: 'manual',
          sourceId,
          sourceEvent: 'record',
          occurredAt: new Date().toISOString().slice(0, 10),
        });

      expect(res.status).toBe(201);
      expect(res.body.meta.created).toBe(false);

      const count = await prisma.constructionCostEntry.count({
        where: {
          tenantId: ctx.tenantId,
          sourceModule: 'construction',
          sourceType: 'manual',
          sourceId,
          sourceEvent: 'record',
        },
      });
      expect(count).toBe(1);
    });

    it('lists cost entries for project', async () => {
      const res = await api().get(`/api/v1/construction/projects/${projectId}/cost-entries`);
      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('rejects mismatched project/cost center', async () => {
      const otherProject = await createUniversalProject(app, ctx.accessToken);
      await enableConstructionProfile(app, ctx.accessToken, otherProject.id);

      const res = await api()
        .post(`/api/v1/construction/projects/${otherProject.id}/cost-entries`)
        .send({
          category: ConstructionCostCategory.labor,
          amount: '100.0000',
          costCenterId,
          sourceModule: 'construction',
          sourceType: 'manual',
          sourceId: randomUUID(),
          sourceEvent: 'record',
          occurredAt: new Date().toISOString().slice(0, 10),
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects cost entry when construction profile is missing', async () => {
      const bareProject = await createUniversalProject(app, ctx.accessToken);

      const res = await api()
        .post(`/api/v1/construction/projects/${bareProject.id}/cost-entries`)
        .send({
          category: ConstructionCostCategory.other,
          amount: '50.0000',
          sourceModule: 'construction',
          sourceType: 'manual',
          sourceId: randomUUID(),
          sourceEvent: 'record',
          occurredAt: new Date().toISOString().slice(0, 10),
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Party construction roles', () => {
    it('assigns contractor and subcontractor roles on the same party', async () => {
      const party = await request(app.getHttpServer())
        .post('/api/v1/parties')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ type: 'organization', displayName: `SubCo ${Date.now()}` });
      expect(party.status).toBe(201);

      const partyId = party.body.data.id;

      const contractor = await request(app.getHttpServer())
        .post(`/api/v1/parties/${partyId}/roles`)
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ role: PartyRoleType.contractor });
      expect(contractor.status).toBe(201);

      const subcontractor = await request(app.getHttpServer())
        .post(`/api/v1/parties/${partyId}/roles`)
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ role: PartyRoleType.subcontractor });
      expect(subcontractor.status).toBe(201);

      const supplier = await request(app.getHttpServer())
        .post(`/api/v1/parties/${partyId}/roles`)
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ role: PartyRoleType.supplier });
      expect(supplier.status).toBe(201);
    });
  });

  describe('Boundaries', () => {
    it('does not create journal entries when recording construction cost', async () => {
      const before = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });

      await api()
        .post(`/api/v1/construction/projects/${projectId}/cost-entries`)
        .send({
          category: ConstructionCostCategory.equipment,
          amount: '75.0000',
          sourceModule: 'construction',
          sourceType: 'boundary',
          sourceId: randomUUID(),
          sourceEvent: 'record',
          occurredAt: new Date().toISOString().slice(0, 10),
        });

      const after = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(after).toBe(before);
    });
  });
});
