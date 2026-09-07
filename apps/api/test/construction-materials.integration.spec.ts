import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import {
  ConstructionCostCategory,
  ConstructionMaterialIssueStatus,
} from '../../../packages/database/generated/server';
import { LicenseService } from '../src/modules/license/license.service';
import { PrismaService } from '../src/database/prisma.service';
import { DEMO_ENABLED_FEATURES } from '../src/modules/license/catalog/feature-catalog';
import { defaultModuleEntries } from '../src/modules/license/verification/license-verifier.interface';
import {
  activateConstructionLicense,
  createUniversalProject,
  enableConstructionProfile,
  featuresWithConstruction,
  loadConstructionTestContext,
  modulesWithConstruction,
} from './construction-test.helpers';
import { seedStockBalance } from './inventory-test.helpers';
import { signTestActivationForTenant } from './license-test.helpers';
import { createIsolatedTenant } from './pms-test.helpers';
import { createTestApp, request } from './test-app';

describe('Construction materials (Phase 9.6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let licenseService: LicenseService;
  let ctx: Awaited<ReturnType<typeof loadConstructionTestContext>>;
  let projectId: string;
  let costCenterId: string;
  let warehouseId: string;
  let productId: string;
  let productId2: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    licenseService = app.get(LicenseService);
    ctx = await loadConstructionTestContext(app);
    await activateConstructionLicense(prisma, ctx.tenantId, licenseService);

    const project = await createUniversalProject(app, ctx.accessToken);
    projectId = project.id;
    await enableConstructionProfile(app, ctx.accessToken, projectId);

    const cc = await request(app.getHttpServer())
      .post('/api/v1/cost-centers')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        code: `CC-MAT-${Date.now()}`,
        name: 'Material Works',
        projectId,
      });
    expect(cc.status).toBe(201);
    costCenterId = cc.body.data.id;

    const warehouses = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${ctx.accessToken}`);
    warehouseId = warehouses.body.data[0].id;

    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Authorization', `Bearer ${ctx.accessToken}`);
    const unitId = units.body.data[0].id;

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        sku: `MAT-${Date.now()}`,
        name: 'Cement Bag',
        unitId,
        salePrice: 50,
        costPrice: 10,
        trackInventory: true,
      });
    expect(productRes.status).toBe(201);
    productId = productRes.body.data.id;

    const productRes2 = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .send({
        sku: `MAT2-${Date.now()}`,
        name: 'Steel Rebar',
        unitId,
        salePrice: 80,
        costPrice: 25,
        trackInventory: true,
      });
    productId2 = productRes2.body.data.id;

    await seedStockBalance(prisma, ctx.tenantId, warehouseId, productId, 500, 12.5);
    await seedStockBalance(prisma, ctx.tenantId, warehouseId, productId2, 200, 30);
  });

  afterAll(async () => {
    await licenseService.seedDemoLicense(ctx.tenantId);
    await app.close();
  });

  function featuresWithoutMaterials() {
    return [
      ...DEMO_ENABLED_FEATURES,
      'construction.foundation',
      'construction.contracts',
      'construction.boq',
      'construction.progress',
      'construction.variations',
      'construction.retention',
      'construction.subcontractors',
    ];
  }

  function api(token = ctx.accessToken) {
    return {
      get: (url: string) =>
        request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
      post: (url: string) =>
        request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`),
    };
  }

  async function hashPassword(password: string): Promise<string> {
    const bcrypt = await import('bcryptjs');
    return bcrypt.hash(password, 12);
  }

  async function loginAsUser(email: string, password = 'Admin@123456') {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(login.status).toBe(200);
    return login.body.data.accessToken as string;
  }

  async function createDraft(
    overrides: {
      quantity?: string;
      productId?: string;
      costCenterId?: string;
      warehouseId?: string;
      projectId?: string;
      sourceModule?: string;
      sourceType?: string;
      sourceId?: string;
      sourceEvent?: string;
    } = {},
  ) {
    return api().post('/api/v1/construction/material-issues').send({
      projectId: overrides.projectId ?? projectId,
      warehouseId: overrides.warehouseId ?? warehouseId,
      costCenterId: overrides.costCenterId ?? costCenterId,
      sourceModule: overrides.sourceModule,
      sourceType: overrides.sourceType,
      sourceId: overrides.sourceId,
      sourceEvent: overrides.sourceEvent,
      lines: [
        {
          productId: overrides.productId ?? productId,
          quantity: overrides.quantity ?? '10',
        },
      ],
    });
  }

  async function issueMaterial(issueId: string, token = ctx.accessToken) {
    return api(token).post(`/api/v1/construction/material-issues/${issueId}/issue`);
  }

  describe('Valid material issue', () => {
    it('creates draft and issues materials with inventory movement and cost entry', async () => {
      const draft = await createDraft({ quantity: '15' });
      expect(draft.status).toBe(201);
      expect(draft.body.meta.created).toBe(true);
      expect(draft.body.data.status).toBe(ConstructionMaterialIssueStatus.draft);
      expect(draft.body.data.number).toMatch(/^MIS-\d{4}-\d{6}$/);

      const issued = await issueMaterial(draft.body.data.id);
      expect(issued.status).toBe(201);
      expect(issued.body.meta.issued).toBe(true);
      expect(issued.body.data.status).toBe(ConstructionMaterialIssueStatus.issued);
      expect(Number(issued.body.data.totalCost)).toBeCloseTo(15 * 12.5, 4);

      const movement = await prisma.inventoryMovement.findFirst({
        where: {
          tenantId: ctx.tenantId,
          referenceType: 'construction_material_issue',
          referenceId: draft.body.data.id,
          movementType: 'project_issue',
        },
      });
      expect(movement).toBeTruthy();
      expect(Number(movement!.quantity)).toBe(-15);
      expect(Number(movement!.unitCost)).toBeCloseTo(12.5, 4);

      const costEntry = await prisma.constructionCostEntry.findFirst({
        where: {
          tenantId: ctx.tenantId,
          sourceModule: 'construction',
          sourceType: 'material_issue_line',
          sourceEvent: 'issue',
          category: ConstructionCostCategory.material,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(costEntry).toBeTruthy();
      expect(Number(costEntry!.amount)).toBeCloseTo(187.5, 4);
      expect(costEntry!.projectId).toBe(projectId);
      expect(costEntry!.costCenterId).toBe(costCenterId);

      const balance = await prisma.stockBalance.findUnique({
        where: {
          tenantId_warehouseId_productId: {
            tenantId: ctx.tenantId,
            warehouseId,
            productId,
          },
        },
      });
      expect(Number(balance!.quantity)).toBeCloseTo(485, 4);
    });
  });

  describe('Insufficient stock', () => {
    it('rejects issue when stock is insufficient', async () => {
      const draft = await createDraft({ quantity: '99999' });
      expect(draft.status).toBe(201);

      const issued = await issueMaterial(draft.body.data.id);
      expect(issued.status).toBeGreaterThanOrEqual(400);

      const issue = await prisma.constructionMaterialIssue.findFirst({
        where: { id: draft.body.data.id },
      });
      expect(issue!.status).toBe(ConstructionMaterialIssueStatus.draft);

      const movementCount = await prisma.inventoryMovement.count({
        where: {
          tenantId: ctx.tenantId,
          referenceId: draft.body.data.id,
          referenceType: 'construction_material_issue',
        },
      });
      expect(movementCount).toBe(0);
    });
  });

  describe('Transaction rollback', () => {
    it('rolls back cost entry when inventory movement fails', async () => {
      const costBefore = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId, projectId },
      });

      const draft = await createDraft({ quantity: '50000' });
      const issued = await issueMaterial(draft.body.data.id);
      expect(issued.status).toBeGreaterThanOrEqual(400);

      const costAfter = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId, projectId },
      });
      expect(costAfter).toBe(costBefore);
    });
  });

  describe('Validations', () => {
    it('rejects issue without construction profile', async () => {
      const bareProject = await createUniversalProject(app, ctx.accessToken);
      const res = await createDraft({ projectId: bareProject.id });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects invalid warehouse', async () => {
      const res = await createDraft({ warehouseId: randomUUID() });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects invalid product', async () => {
      const res = await api().post('/api/v1/construction/material-issues').send({
        projectId,
        warehouseId,
        lines: [{ productId: randomUUID(), quantity: '5' }],
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects mismatched cost center project', async () => {
      const otherProject = await createUniversalProject(app, ctx.accessToken);
      await enableConstructionProfile(app, ctx.accessToken, otherProject.id);
      const otherCc = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          code: `CC-OTHER-${Date.now()}`,
          name: 'Other CC',
          projectId: otherProject.id,
        });
      const res = await createDraft({ costCenterId: otherCc.body.data.id });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects zero quantity', async () => {
      const res = await createDraft({ quantity: '0' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Decimal quantity and actual cost', () => {
    it('supports decimal quantities and uses avgCost from stock balance', async () => {
      await seedStockBalance(prisma, ctx.tenantId, warehouseId, productId2, 100, 33.3333);

      const draft = await api().post('/api/v1/construction/material-issues').send({
        projectId,
        warehouseId,
        costCenterId,
        lines: [{ productId: productId2, quantity: '2.5000' }],
      });
      expect(draft.status).toBe(201);

      const issued = await issueMaterial(draft.body.data.id);
      expect(issued.status).toBe(201);
      expect(Number(issued.body.data.totalCost)).toBeCloseTo(2.5 * 33.3333, 2);

      const line = issued.body.data.lines[0];
      expect(Number(line.unitCost)).toBeCloseTo(33.3333, 4);
      expect(Number(line.quantity)).toBeCloseTo(2.5, 4);
    });
  });

  describe('Source identity idempotency', () => {
    it('returns existing draft for duplicate source identity on create', async () => {
      const sourceId = randomUUID();
      const first = await createDraft({
        quantity: '3',
        sourceModule: 'construction',
        sourceType: 'external_requisition',
        sourceId,
        sourceEvent: 'create',
      });
      expect(first.status).toBe(201);
      expect(first.body.meta.created).toBe(true);

      const second = await createDraft({
        quantity: '3',
        sourceModule: 'construction',
        sourceType: 'external_requisition',
        sourceId,
        sourceEvent: 'create',
      });
      expect(second.status).toBe(201);
      expect(second.body.meta.created).toBe(false);
      expect(second.body.data.id).toBe(first.body.data.id);
    });
  });

  describe('Concurrency and idempotency', () => {
    it('does not duplicate inventory movement when issue is called twice', async () => {
      const draft = await createDraft({ quantity: '4' });
      expect(draft.status).toBe(201);
      const issueId = draft.body.data.id;

      const first = await issueMaterial(issueId);
      expect(first.status).toBe(201);
      expect(first.body.meta.issued).toBe(true);

      const second = await issueMaterial(issueId);
      expect(second.status).toBe(201);
      expect(second.body.meta.issued).toBe(false);
      expect(second.body.data.id).toBe(issueId);

      const movements = await prisma.inventoryMovement.count({
        where: {
          tenantId: ctx.tenantId,
          referenceType: 'construction_material_issue',
          referenceId: issueId,
        },
      });
      expect(movements).toBe(1);

      const costEntries = await prisma.constructionCostEntry.count({
        where: {
          tenantId: ctx.tenantId,
          sourceType: 'material_issue_line',
          sourceId: first.body.data.lines[0].id,
          sourceEvent: 'issue',
        },
      });
      expect(costEntries).toBe(1);
    });
  });

  describe('Tenant isolation', () => {
    it('returns 404 for cross-tenant material issue access', async () => {
      const isolated = await createIsolatedTenant(prisma, 'mat-read');
      const isolatedProject = await prisma.project.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `ISO-PRJ-MAT-${Date.now()}`,
          name: 'Isolated Material Project',
        },
      });
      const isolatedWarehouse = await prisma.warehouse.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `ISO-WH-${Date.now()}`,
          name: 'Isolated Warehouse',
        },
      });
      const isolatedIssue = await prisma.constructionMaterialIssue.create({
        data: {
          tenantId: isolated.tenantId,
          projectId: isolatedProject.id,
          branchId: isolated.branchId,
          warehouseId: isolatedWarehouse.id,
          number: `MIS-ISO-${Date.now()}`,
          lines: {
            create: {
              tenantId: isolated.tenantId,
              lineNumber: 1,
              productId,
              quantity: 1,
            },
          },
        },
      });

      const res = await api().get(
        `/api/v1/construction/material-issues/${isolatedIssue.id}`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Licensing', () => {
    it('rejects material routes when construction.materials feature is disabled', async () => {
      const signed = await signTestActivationForTenant(prisma, ctx.tenantId, {
        modules: defaultModuleEntries(modulesWithConstruction(), 'perpetual'),
        features: featuresWithoutMaterials(),
      });
      await licenseService.activateLicense(ctx.tenantId, signed);

      const res = await api().get('/api/v1/construction/material-issues');
      expect(res.status).toBe(403);

      await activateConstructionLicense(prisma, ctx.tenantId, licenseService);
    });
  });

  describe('RBAC', () => {
    it('rejects licensed user without materials RBAC permission', async () => {
      const role = await prisma.role.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'Foundation Only Mat',
          code: `foundation-only-mat-${Date.now()}`,
        },
      });
      const foundationPerms = await prisma.permission.findMany({
        where: { module: 'construction', feature: 'foundation' },
      });
      for (const perm of foundationPerms) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: perm.id },
        });
      }
      const user = await prisma.user.create({
        data: {
          tenantId: ctx.tenantId,
          email: `foundation-only-mat-${Date.now()}@fratelanza.local`,
          passwordHash: await hashPassword('Admin@123456'),
          firstName: 'Foundation',
          lastName: 'Only',
          roleId: role.id,
          isActive: true,
        },
      });
      const token = await loginAsUser(user.email);

      const profileRes = await api(token).get(
        `/api/v1/construction/projects/${projectId}/profile`,
      );
      expect(profileRes.status).toBe(200);

      const matRes = await api(token).get('/api/v1/construction/material-issues');
      expect(matRes.status).toBe(403);
    });
  });

  describe('Audit', () => {
    it('creates audit events on create and issue', async () => {
      const draft = await createDraft({ quantity: '1' });
      expect(draft.status).toBe(201);

      const createAudit = await prisma.auditLog.findFirst({
        where: {
          tenantId: ctx.tenantId,
          entity: 'construction_material_issue',
          entityId: draft.body.data.id,
          action: 'construction.material.issue.created',
        },
      });
      expect(createAudit).toBeTruthy();

      await issueMaterial(draft.body.data.id);

      const issueAudit = await prisma.auditLog.findFirst({
        where: {
          tenantId: ctx.tenantId,
          entity: 'construction_material_issue',
          entityId: draft.body.data.id,
          action: 'construction.material.issue.issued',
        },
      });
      expect(issueAudit).toBeTruthy();
    });
  });

  describe('No GL posting', () => {
    it('does not create journal entries on material issue', async () => {
      const before = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const draft = await createDraft({ quantity: '2' });
      await issueMaterial(draft.body.data.id);
      const after = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(after).toBe(before);
    });
  });

  describe('Cancel draft', () => {
    it('cancels draft material issue', async () => {
      const draft = await createDraft({ quantity: '1' });
      const cancelled = await api().post(
        `/api/v1/construction/material-issues/${draft.body.data.id}/cancel`,
      );
      expect(cancelled.status).toBe(201);
      expect(cancelled.body.data.status).toBe(ConstructionMaterialIssueStatus.cancelled);
    });
  });
});
