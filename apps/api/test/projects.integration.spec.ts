import type { INestApplication } from '@nestjs/common';
import { PartyType } from '../../../packages/database/generated/server';
import { PrismaService } from '../src/database/prisma.service';
import { PartiesService } from '../src/modules/parties/parties.service';
import { createIsolatedTenant } from './pms-test.helpers';
import { loadProjectsTestContext, type ProjectsTestContext } from './projects-test.helpers';
import { createTestApp, loginAdmin, request } from './test-app';

describe('Universal Projects foundation (Phase 8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ProjectsTestContext;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ctx = await loadProjectsTestContext(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Project CRUD', () => {
    it('creates a project with auto-numbered code', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          name: 'Phase 8 Test Project',
          description: 'Universal project',
          branchId: ctx.branchId,
        });
      expect(res.status).toBe(201);
      expect(res.body.data.code).toMatch(/^PRJ-/);
      expect(res.body.data.status).toBe('draft');
    });

    it('reads a project by id', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ name: 'Read Project', code: `PRJ-R-${Date.now()}` });
      expect(created.status).toBe(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${created.body.data.id}`)
        .set('Authorization', `Bearer ${ctx.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Read Project');
    });

    it('updates a project and transitions status', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ name: 'Update Project', code: `PRJ-U-${Date.now()}` });
      expect(created.status).toBe(201);

      const active = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${created.body.data.id}`)
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ status: 'active', name: 'Updated Project Name' });
      expect(active.status).toBe(200);
      expect(active.body.data.status).toBe('active');
    });

    it('archives a project', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ name: 'Archive Project', code: `PRJ-A-${Date.now()}` });
      expect(created.status).toBe(201);

      const archived = await request(app.getHttpServer())
        .post(`/api/v1/projects/${created.body.data.id}/archive`)
        .set('Authorization', `Bearer ${ctx.accessToken}`);
      expect(archived.status).toBe(201);
      expect(archived.body.data.status).toBe('archived');
    });

    it('supports search and pagination', async () => {
      const code = `PRJ-SRCH-${Date.now()}`;
      await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ name: 'Searchable Widget Project', code });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects?search=${encodeURIComponent('Searchable Widget')}&limit=5&page=1`)
        .set('Authorization', `Bearer ${ctx.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
      expect(res.body.data.some((p: { code: string }) => p.code === code)).toBe(true);
    });

    it('rejects duplicate project codes', async () => {
      const code = `PRJ-DUP-${Date.now()}`;
      const first = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ name: 'First', code });
      expect(first.status).toBe(201);

      const second = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ name: 'Second', code });
      expect(second.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects cross-tenant project read', async () => {
      const isolated = await createIsolatedTenant(prisma, 'prj-read');
      const isolatedProject = await prisma.project.create({
        data: {
          tenantId: isolated.tenantId,
          code: `ISO-P-${Date.now()}`,
          name: 'Isolated Project',
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${isolatedProject.id}`)
        .set('Authorization', `Bearer ${ctx.accessToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Cost Center CRUD', () => {
    it('creates a cost center', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          code: `CC-${Date.now()}`,
          name: 'Operations',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.isActive).toBe(true);
    });

    it('reads and updates a cost center', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ code: `CC-R-${Date.now()}`, name: 'Read CC' });
      expect(created.status).toBe(201);

      const read = await request(app.getHttpServer())
        .get(`/api/v1/cost-centers/${created.body.data.id}`)
        .set('Authorization', `Bearer ${ctx.accessToken}`);
      expect(read.status).toBe(200);

      const updated = await request(app.getHttpServer())
        .patch(`/api/v1/cost-centers/${created.body.data.id}`)
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ name: 'Updated CC', isActive: false });
      expect(updated.status).toBe(200);
      expect(updated.body.data.isActive).toBe(false);
    });

    it('archives a cost center', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ code: `CC-A-${Date.now()}`, name: 'Archive CC' });
      expect(created.status).toBe(201);

      const archived = await request(app.getHttpServer())
        .post(`/api/v1/cost-centers/${created.body.data.id}/archive`)
        .set('Authorization', `Bearer ${ctx.accessToken}`);
      expect(archived.status).toBe(201);
      expect(archived.body.data.isActive).toBe(false);
    });

    it('rejects duplicate cost center codes', async () => {
      const code = `CC-DUP-${Date.now()}`;
      const first = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ code, name: 'First CC' });
      expect(first.status).toBe(201);

      const second = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ code, name: 'Second CC' });
      expect(second.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects cross-tenant cost center read', async () => {
      const isolated = await createIsolatedTenant(prisma, 'cc-read');
      const cc = await prisma.costCenter.create({
        data: {
          tenantId: isolated.tenantId,
          code: `ISO-CC-${Date.now()}`,
          name: 'Isolated CC',
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/cost-centers/${cc.id}`)
        .set('Authorization', `Bearer ${ctx.accessToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Hierarchy', () => {
    it('supports parent and child cost centers', async () => {
      const parent = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ code: `CC-P-${Date.now()}`, name: 'Operations' });
      expect(parent.status).toBe(201);

      const child = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          code: `CC-C-${Date.now()}`,
          name: 'Maintenance',
          parentId: parent.body.data.id,
        });
      expect(child.status).toBe(201);
      expect(child.body.data.parentId).toBe(parent.body.data.id);
    });

    it('rejects self-parent assignment', async () => {
      const cc = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ code: `CC-SP-${Date.now()}`, name: 'Self Parent' });
      expect(cc.status).toBe(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/cost-centers/${cc.body.data.id}`)
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ parentId: cc.body.data.id });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects cross-tenant parent assignment', async () => {
      const isolated = await createIsolatedTenant(prisma, 'cc-parent');
      const isolatedParent = await prisma.costCenter.create({
        data: {
          tenantId: isolated.tenantId,
          code: `ISO-P-${Date.now()}`,
          name: 'Isolated Parent',
        },
      });

      const cc = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ code: `CC-XT-${Date.now()}`, name: 'Cross Tenant Child' });
      expect(cc.status).toBe(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/cost-centers/${cc.body.data.id}`)
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ parentId: isolatedParent.id });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('prevents hierarchy cycles', async () => {
      const a = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ code: `CC-CA-${Date.now()}`, name: 'Node A' });
      const b = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ code: `CC-CB-${Date.now()}`, name: 'Node B', parentId: a.body.data.id });
      expect(b.status).toBe(201);

      const cycle = await request(app.getHttpServer())
        .patch(`/api/v1/cost-centers/${a.body.data.id}`)
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ parentId: b.body.data.id });
      expect(cycle.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Project ↔ Cost Center association', () => {
    it('assigns cost centers to a project', async () => {
      const project = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ name: 'Linked Project', code: `PRJ-L-${Date.now()}`, branchId: ctx.branchId });
      expect(project.status).toBe(201);

      const cc = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          code: `CC-L-${Date.now()}`,
          name: 'Project CC',
          projectId: project.body.data.id,
          branchId: ctx.branchId,
        });
      expect(cc.status).toBe(201);

      const list = await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.body.data.id}/cost-centers`)
        .set('Authorization', `Bearer ${ctx.accessToken}`);
      expect(list.status).toBe(200);
      expect(list.body.data.some((row: { id: string }) => row.id === cc.body.data.id)).toBe(true);
    });

    it('rejects cross-tenant project assignment on cost center', async () => {
      const isolated = await createIsolatedTenant(prisma, 'cc-proj');
      const isolatedProject = await prisma.project.create({
        data: {
          tenantId: isolated.tenantId,
          code: `ISO-PRJ-${Date.now()}`,
          name: 'Isolated Project',
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          code: `CC-BAD-${Date.now()}`,
          name: 'Bad Link',
          projectId: isolatedProject.id,
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Boundaries', () => {
    it('does not create GL journals when creating a project', async () => {
      const before = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const res = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ name: 'No GL Project', code: `PRJ-GL-${Date.now()}` });
      expect(res.status).toBe(201);
      const after = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(after).toBe(before);
    });

    it('does not mutate inventory when creating project and cost center', async () => {
      const movementsBefore = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });
      await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ name: 'No Stock Project', code: `PRJ-ST-${Date.now()}` });
      await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ code: `CC-ST-${Date.now()}`, name: 'No Stock CC' });
      const movementsAfter = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });
      expect(movementsAfter).toBe(movementsBefore);
    });

    it('does not mutate Party records when linking customerPartyId', async () => {
      const parties = app.get(PartiesService);
      const admin = await prisma.user.findFirst({ where: { email: 'admin@fratelanza.local' } });
      const party = await parties.create(ctx.tenantId, admin!.id, {
        type: PartyType.organization,
        code: `PTY-P8-${Date.now()}`,
        displayName: 'Project Client Party',
      });
      const partyBefore = await prisma.party.findUnique({ where: { id: party.id } });

      await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          name: 'Party Linked Project',
          code: `PRJ-PTY-${Date.now()}`,
          customerPartyId: party.id,
        });

      const partyAfter = await prisma.party.findUnique({ where: { id: party.id } });
      expect(partyAfter?.displayName).toBe(partyBefore?.displayName);
    });
  });

  describe('Audit', () => {
    it('creates audit events for project and cost center mutations', async () => {
      const project = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ name: 'Audit Project', code: `PRJ-AUD-${Date.now()}` });
      expect(project.status).toBe(201);

      const projectAudit = await prisma.auditLog.findFirst({
        where: {
          tenantId: ctx.tenantId,
          entity: 'project',
          entityId: project.body.data.id,
          action: 'projects.project.created',
        },
      });
      expect(projectAudit).toBeTruthy();

      const cc = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({ code: `CC-AUD-${Date.now()}`, name: 'Audit CC' });
      expect(cc.status).toBe(201);

      const ccAudit = await prisma.auditLog.findFirst({
        where: {
          tenantId: ctx.tenantId,
          entity: 'cost_center',
          entityId: cc.body.data.id,
          action: 'projects.cost_center.created',
        },
      });
      expect(ccAudit).toBeTruthy();
    });
  });

  describe('RBAC', () => {
    it('rejects user without Projects RBAC permission', async () => {
      const role = await prisma.role.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'No Projects',
          code: `no-prj-${Date.now()}`,
        },
      });
      const readPerm = await prisma.permission.findFirst({
        where: { module: 'core', feature: 'dashboard', action: 'read' },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: readPerm!.id },
      });
      const username = `no-prj-${Date.now()}`;
      const user = await prisma.user.create({
        data: {
          tenantId: ctx.tenantId,
          email: `${username}@fratelanza.local`,
          passwordHash: '$2a$12$placeholder',
          firstName: 'No',
          lastName: 'Projects',
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
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`);
      expect(res.status).toBe(403);
    });
  });
});
