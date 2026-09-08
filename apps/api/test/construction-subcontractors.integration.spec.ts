import type { INestApplication } from '@nestjs/common';
import {
  ConstructionContractDirection,
  ConstructionContractPricingModel,
  ConstructionContractStatus,
  ConstructionSubcontractorAssignmentStatus,
  ConstructionSubcontractorProfileStatus,
  PartyRoleType,
  PartyType,
} from '../../../packages/database/generated/server';
import { PrismaService } from '../src/database/prisma.service';
import { PartiesService } from '../src/modules/parties/parties.service';
import { PartyRolesService } from '../src/modules/parties/party-roles.service';
import {
  createPartyWithRole,
  createUniversalProject,
  enableConstructionProfile,
  loadConstructionTestContext,
  prepareConstructionTestSuite,
  restoreDemoTenantLicense,
} from './construction-test.helpers';
import { createIsolatedTenant } from './pms-test.helpers';
import { createTestApp, request } from './test-app';

describe('Construction subcontractors (Phase 9.5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: Awaited<ReturnType<typeof loadConstructionTestContext>>;
  let adminUserId: string;
  let projectId: string;
  let subcontractorPartyId: string;
  let customerPartyId: string;
  let profileId: string;

  beforeAll(async () => {
    app = await createTestApp();
    ({ ctx, prisma } = await prepareConstructionTestSuite(app));

    const admin = await prisma.user.findFirst({
      where: { email: 'admin@fratelanza.local' },
    });
    adminUserId = admin!.id;

    const project = await createUniversalProject(app, ctx.accessToken);
    projectId = project.id;
    await enableConstructionProfile(app, ctx.accessToken, projectId);

    const customer = await createPartyWithRole(
      app,
      ctx.tenantId,
      adminUserId,
      PartyRoleType.customer,
      'SUB-CUST',
    );
    customerPartyId = customer.id;

    const subcontractor = await createPartyWithRole(
      app,
      ctx.tenantId,
      adminUserId,
      PartyRoleType.subcontractor,
      'SUB',
    );
    subcontractorPartyId = subcontractor.id;
  });

  afterAll(async () => {
    await restoreDemoTenantLicense(app);
    await app.close();
  });

  function api(token = ctx.accessToken) {
    return {
      get: (url: string) =>
        request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
      post: (url: string) =>
        request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`),
      patch: (url: string) =>
        request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${token}`),
    };
  }

  async function hashPassword(password: string): Promise<string> {
    const bcrypt = await import('bcryptjs');
    return bcrypt.hash(password, 12);
  }

  async function loginAsUser(username: string, password = 'Admin@123456') {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password });
    expect(login.status).toBe(200);
    return login.body.data.accessToken as string;
  }

  async function createProfile(
    partyId = subcontractorPartyId,
    overrides: {
      trade?: string;
      specialty?: string;
      complianceNotes?: string;
    } = {},
  ) {
    const res = await api().post('/api/v1/construction/subcontractors').send({
      partyId,
      trade: overrides.trade ?? 'Electrical',
      specialty: overrides.specialty ?? 'Low voltage',
      complianceNotes: overrides.complianceNotes,
    });
    return res;
  }

  async function createSubcontractorContract(
    partyId = subcontractorPartyId,
    title = 'Subcontractor Agreement',
  ) {
    const res = await api().post('/api/v1/construction/contracts').send({
      projectId,
      title,
      direction: ConstructionContractDirection.subcontractor,
      partyId,
      pricingModel: ConstructionContractPricingModel.lump_sum,
    });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; partyId: string };
  }

  describe('Profile CRUD', () => {
    it('creates a subcontractor profile linked to Party', async () => {
      const res = await createProfile();
      expect(res.status).toBe(201);
      expect(res.body.data.partyId).toBe(subcontractorPartyId);
      expect(res.body.data.trade).toBe('Electrical');
      expect(res.body.data.status).toBe(ConstructionSubcontractorProfileStatus.active);
      expect(res.body.data.party.displayName).toBeDefined();
      expect(res.body.data.party.roles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: PartyRoleType.subcontractor }),
        ]),
      );
      profileId = res.body.data.id;
    });

    it('lists subcontractor profiles', async () => {
      const res = await api().get('/api/v1/construction/subcontractors');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('gets profile by id', async () => {
      const res = await api().get(`/api/v1/construction/subcontractors/${profileId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(profileId);
    });

    it('updates profile metadata', async () => {
      const res = await api()
        .patch(`/api/v1/construction/subcontractors/${profileId}`)
        .send({
          specialty: 'High voltage',
          status: ConstructionSubcontractorProfileStatus.inactive,
        });
      expect(res.status).toBe(200);
      expect(res.body.data.specialty).toBe('High voltage');
      expect(res.body.data.status).toBe(ConstructionSubcontractorProfileStatus.inactive);

      await api()
        .patch(`/api/v1/construction/subcontractors/${profileId}`)
        .send({ status: ConstructionSubcontractorProfileStatus.active });
    });
  });

  describe('Party role validation', () => {
    it('rejects profile when party lacks subcontractor role', async () => {
      const parties = app.get(PartiesService);
      const party = await parties.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-NOSUB-PROF-${Date.now()}`,
        displayName: 'No Sub Role',
      });

      const res = await createProfile(party.id);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Supplier role compatibility', () => {
    it('allows profile when party has subcontractor and supplier roles', async () => {
      const parties = app.get(PartiesService);
      const partyRoles = app.get(PartyRolesService);
      const party = await parties.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-SUB-SUP-${Date.now()}`,
        displayName: 'Sub And Supplier',
      });
      await partyRoles.assignRole(
        ctx.tenantId,
        party.id,
        adminUserId,
        PartyRoleType.subcontractor,
      );
      await partyRoles.assignRole(
        ctx.tenantId,
        party.id,
        adminUserId,
        PartyRoleType.supplier,
      );

      const res = await createProfile(party.id, {
        trade: 'Plumbing',
        specialty: 'Commercial',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.party.roles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: PartyRoleType.subcontractor }),
          expect.objectContaining({ role: PartyRoleType.supplier }),
        ]),
      );
    });
  });

  describe('Duplicate prevention', () => {
    it('rejects duplicate profile for same party', async () => {
      const res = await createProfile();
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Project assignments', () => {
    it('assigns subcontractor to project without contract', async () => {
      const res = await api()
        .post(`/api/v1/construction/subcontractors/${profileId}/assignments`)
        .send({ projectId, notes: 'Site mobilization' });
      expect(res.status).toBe(201);
      expect(res.body.data.projectId).toBe(projectId);
      expect(res.body.data.contractId).toBeNull();
      expect(res.body.data.status).toBe(
        ConstructionSubcontractorAssignmentStatus.active,
      );
    });

    it('rejects duplicate project-only assignment', async () => {
      const res = await api()
        .post(`/api/v1/construction/subcontractors/${profileId}/assignments`)
        .send({ projectId });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('lists assignments for profile', async () => {
      const res = await api().get(
        `/api/v1/construction/subcontractors/${profileId}/assignments`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects assignment when project lacks construction profile', async () => {
      const bareProject = await createUniversalProject(app, ctx.accessToken, {
        name: 'No Construction Profile',
      });

      const res = await api()
        .post(`/api/v1/construction/subcontractors/${profileId}/assignments`)
        .send({ projectId: bareProject.id });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Contract relation', () => {
    it('assigns subcontractor to project with matching contract', async () => {
      const contract = await createSubcontractorContract(
        subcontractorPartyId,
        'Electrical Subcontract',
      );

      const res = await api()
        .post(`/api/v1/construction/subcontractors/${profileId}/assignments`)
        .send({ projectId, contractId: contract.id });
      expect(res.status).toBe(201);
      expect(res.body.data.contractId).toBe(contract.id);
      expect(res.body.data.contract.direction).toBe(
        ConstructionContractDirection.subcontractor,
      );
    });

    it('rejects contract assignment when contract party mismatches profile party', async () => {
      const otherSub = await createPartyWithRole(
        app,
        ctx.tenantId,
        adminUserId,
        PartyRoleType.subcontractor,
        'OTHER-SUB',
      );
      const wrongContract = await createSubcontractorContract(
        otherSub.id,
        'Wrong Party Contract',
      );

      const res = await api()
        .post(`/api/v1/construction/subcontractors/${profileId}/assignments`)
        .send({ projectId, contractId: wrongContract.id });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects customer-direction contract on subcontractor assignment', async () => {
      const customerContract = await api().post('/api/v1/construction/contracts').send({
        projectId,
        title: 'Customer Contract For Sub Test',
        direction: ConstructionContractDirection.customer,
        partyId: customerPartyId,
        pricingModel: ConstructionContractPricingModel.lump_sum,
      });
      expect(customerContract.status).toBe(201);

      const res = await api()
        .post(`/api/v1/construction/subcontractors/${profileId}/assignments`)
        .send({ projectId, contractId: customerContract.body.data.id });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Assignment updates', () => {
    it('updates assignment status and notes', async () => {
      const assignment = await prisma.constructionSubcontractorAssignment.findFirst({
        where: { tenantId: ctx.tenantId, profileId },
      });
      expect(assignment).toBeTruthy();

      const res = await api()
        .patch(
          `/api/v1/construction/subcontractors/assignments/${assignment!.id}`,
        )
        .send({
          status: ConstructionSubcontractorAssignmentStatus.completed,
          notes: 'Work finished',
        });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(
        ConstructionSubcontractorAssignmentStatus.completed,
      );
      expect(res.body.data.notes).toBe('Work finished');
    });
  });

  describe('Tenant isolation', () => {
    it('rejects cross-tenant profile read', async () => {
      const isolated = await createIsolatedTenant(prisma, 'sub-read');
      const isolatedParty = await prisma.party.create({
        data: {
          tenantId: isolated.tenantId,
          type: PartyType.organization,
          code: `ISO-SUB-${Date.now()}`,
          displayName: 'Isolated Sub',
        },
      });
      const isolatedProfile = await prisma.constructionSubcontractorProfile.create({
        data: {
          tenantId: isolated.tenantId,
          partyId: isolatedParty.id,
          trade: 'Isolated',
        },
      });

      const res = await api().get(
        `/api/v1/construction/subcontractors/${isolatedProfile.id}`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('RBAC', () => {
    it('rejects user without subcontractors RBAC permission', async () => {
      const role = await prisma.role.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'Contracts Only Sub',
          code: `contracts-only-sub-${Date.now()}`,
        },
      });
      const contractPerms = await prisma.permission.findMany({
        where: {
          module: 'construction',
          feature: { in: ['foundation', 'contracts'] },
        },
      });
      for (const perm of contractPerms) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: perm.id },
        });
      }
      const username = `contracts-only-sub-${Date.now()}`;
      const user = await prisma.user.create({
        data: {
          tenantId: ctx.tenantId,
          email: `${username}@fratelanza.local`,
          passwordHash: await hashPassword('Admin@123456'),
          firstName: 'Contracts',
          lastName: 'Only',
          roleId: role.id,
          isActive: true,
        },
      });
      const token = await loginAsUser(username);

      const contractRes = await api(token).get('/api/v1/construction/contracts');
      expect(contractRes.status).toBe(200);

      const subRes = await api(token).get('/api/v1/construction/subcontractors');
      expect(subRes.status).toBe(403);
    });
  });

  describe('Audit', () => {
    it('creates audit event on profile create', async () => {
      const party = await createPartyWithRole(
        app,
        ctx.tenantId,
        adminUserId,
        PartyRoleType.subcontractor,
        'AUDIT',
      );
      const created = await createProfile(party.id, { trade: 'HVAC' });
      expect(created.status).toBe(201);

      const audit = await prisma.auditLog.findFirst({
        where: {
          tenantId: ctx.tenantId,
          entity: 'construction_subcontractor_profile',
          entityId: created.body.data.id,
          action: 'construction.subcontractor.profile.created',
        },
      });
      expect(audit).toBeTruthy();
    });
  });

  describe('No identity duplication', () => {
    it('does not create duplicate Party or Supplier records on profile create', async () => {
      const partyCountBefore = await prisma.party.count({
        where: { tenantId: ctx.tenantId },
      });
      const supplierCountBefore = await prisma.supplier.count({
        where: { tenantId: ctx.tenantId },
      });

      const party = await createPartyWithRole(
        app,
        ctx.tenantId,
        adminUserId,
        PartyRoleType.subcontractor,
        'NO-DUP',
      );
      const created = await createProfile(party.id);
      expect(created.status).toBe(201);

      const partyCountAfter = await prisma.party.count({
        where: { tenantId: ctx.tenantId },
      });
      const supplierCountAfter = await prisma.supplier.count({
        where: { tenantId: ctx.tenantId },
      });

      expect(partyCountAfter).toBe(partyCountBefore + 1);
      expect(supplierCountAfter).toBe(supplierCountBefore);
      expect(created.body.data.partyId).toBe(party.id);
    });
  });

  describe('Regression boundaries', () => {
    it('does not create journal entries on profile or assignment create', async () => {
      const before = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });

      const party = await createPartyWithRole(
        app,
        ctx.tenantId,
        adminUserId,
        PartyRoleType.subcontractor,
        'BOUND-GL',
      );
      const profile = await createProfile(party.id);
      expect(profile.status).toBe(201);

      const project2 = await createUniversalProject(app, ctx.accessToken, {
        name: 'Boundary Project',
      });
      await enableConstructionProfile(app, ctx.accessToken, project2.id);
      await api()
        .post(`/api/v1/construction/subcontractors/${profile.body.data.id}/assignments`)
        .send({ projectId: project2.id });

      const after = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(after).toBe(before);
    });

    it('does not create ConstructionCostEntry on subcontractor operations', async () => {
      const before = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId },
      });

      await api().get(`/api/v1/construction/subcontractors/${profileId}`);

      const after = await prisma.constructionCostEntry.count({
        where: { tenantId: ctx.tenantId },
      });
      expect(after).toBe(before);
    });

    it('does not mutate inventory on subcontractor operations', async () => {
      const before = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });

      await api().get('/api/v1/construction/subcontractors');

      const after = await prisma.inventoryMovement.count({
        where: { tenantId: ctx.tenantId },
      });
      expect(after).toBe(before);
    });
  });
});
