import type { INestApplication } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  PartyIdentifierType,
  PartyRoleType,
  PartyStatus,
  PartyType,
} from '../../../packages/database/generated/server';
import { PrismaService } from '../src/database/prisma.service';
import { PartiesService } from '../src/modules/parties/parties.service';
import { PartyContactsService } from '../src/modules/parties/party-contacts.service';
import { PartyRolesService } from '../src/modules/parties/party-roles.service';
import { createIsolatedTenant, loadPmsTestContext, type PmsTestContext } from './pms-test.helpers';
import { createTestApp, loginAdmin, request, resetDemoTenant } from './test-app';

describe('Universal Party (Phase 3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let partiesService: PartiesService;
  let partyRolesService: PartyRolesService;
  let partyContactsService: PartyContactsService;
  let ctx: PmsTestContext;
  let token: string;
  let adminUserId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDemoTenant(app);
    prisma = app.get(PrismaService);
    partiesService = app.get(PartiesService);
    partyRolesService = app.get(PartyRolesService);
    partyContactsService = app.get(PartyContactsService);
    ctx = await loadPmsTestContext(app);
    const auth = await loginAdmin(app);
    token = auth.accessToken;
    adminUserId = ctx.adminUserId;
  });

  afterAll(async () => {
    await resetDemoTenant(app);
    await app.close();
  });

  function api() {
    return {
      get: (url: string) =>
        request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
      post: (url: string) =>
        request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`),
      patch: (url: string) =>
        request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${token}`),
      delete: (url: string) =>
        request(app.getHttpServer()).delete(url).set('Authorization', `Bearer ${token}`),
    };
  }

  describe('Party CRUD', () => {
    it('creates an individual party with auto-generated code', async () => {
      const party = await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.individual,
        displayName: 'Ahmed Hassan',
        email: 'ahmed@example.com',
        phone: '+201000000001',
      });

      expect(party.type).toBe(PartyType.individual);
      expect(party.code).toMatch(/^PTY-\d{4}-\d{6}$/);
      expect(party.displayName).toBe('Ahmed Hassan');
      expect(party.status).toBe(PartyStatus.active);
    });

    it('creates an organization party with identifiers and addresses', async () => {
      const code = `PTY-TEST-${Date.now()}`;
      const party = await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code,
        displayName: 'ABC Trading Co.',
        legalName: 'ABC Trading Company LLC',
        identifiers: [
          {
            type: PartyIdentifierType.tax_id,
            value: `TAX-${Date.now()}`,
            isPrimary: true,
          },
        ],
        addresses: [
          {
            line1: '10 Nile Street',
            city: 'Cairo',
            country: 'EG',
            isPrimary: true,
          },
        ],
      });

      expect(party.type).toBe(PartyType.organization);
      expect(party.identifiers).toHaveLength(1);
      expect(party.addresses).toHaveLength(1);
    });

    it('updates a party', async () => {
      const created = await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.individual,
        code: `PTY-UPD-${Date.now()}`,
        displayName: 'Before Update',
      });

      const updated = await partiesService.update(ctx.tenantId, created.id, adminUserId, {
        displayName: 'After Update',
        phone: '+201111111111',
      });

      expect(updated.displayName).toBe('After Update');
      expect(updated.phone).toBe('+201111111111');
    });

    it('archives a party and deactivates roles', async () => {
      const party = await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-ARC-${Date.now()}`,
        displayName: 'Archive Target',
      });

      await partyRolesService.assignRole(
        ctx.tenantId,
        party.id,
        adminUserId,
        PartyRoleType.customer,
      );

      const archived = await partiesService.archive(ctx.tenantId, party.id, adminUserId);
      expect(archived.status).toBe(PartyStatus.archived);
      expect(archived.deletedAt).toBeTruthy();
      expect(archived.roles.every((role) => !role.isActive)).toBe(true);
    });

    it('prevents duplicate party codes within a tenant', async () => {
      const code = `PTY-DUP-${Date.now()}`;
      await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.individual,
        code,
        displayName: 'First Party',
      });

      await expect(
        partiesService.create(ctx.tenantId, adminUserId, {
          type: PartyType.individual,
          code,
          displayName: 'Second Party',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('searches parties by display name and paginates deterministically', async () => {
      const suffix = Date.now();
      await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-SRCH-A-${suffix}`,
        displayName: `Searchable Alpha ${suffix}`,
      });
      await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-SRCH-B-${suffix}`,
        displayName: `Searchable Beta ${suffix}`,
      });

      const result = await partiesService.list(ctx.tenantId, {
        search: `Searchable Alpha ${suffix}`,
        page: 1,
        limit: 10,
      });

      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.items.some((item) => item.displayName.includes('Alpha'))).toBe(true);
    });
  });

  describe('Party roles', () => {
    it('assigns customer and supplier roles to the same party', async () => {
      const party = await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-ROLE-${Date.now()}`,
        displayName: 'Dual Role Trading',
      });

      await partyRolesService.assignRole(
        ctx.tenantId,
        party.id,
        adminUserId,
        PartyRoleType.customer,
      );
      await partyRolesService.assignRole(
        ctx.tenantId,
        party.id,
        adminUserId,
        PartyRoleType.supplier,
      );

      const refreshed = await partiesService.findById(ctx.tenantId, party.id);
      const roles = refreshed.roles.map((role) => role.role);
      expect(roles).toContain(PartyRoleType.customer);
      expect(roles).toContain(PartyRoleType.supplier);
    });

    it('prevents duplicate active role assignment', async () => {
      const party = await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-ROLE-DUP-${Date.now()}`,
        displayName: 'Role Dup Test',
      });

      await partyRolesService.assignRole(
        ctx.tenantId,
        party.id,
        adminUserId,
        PartyRoleType.customer,
      );

      await expect(
        partyRolesService.assignRole(
          ctx.tenantId,
          party.id,
          adminUserId,
          PartyRoleType.customer,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('removes an active role safely', async () => {
      const party = await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-ROLE-RM-${Date.now()}`,
        displayName: 'Role Remove Test',
      });

      await partyRolesService.assignRole(
        ctx.tenantId,
        party.id,
        adminUserId,
        PartyRoleType.supplier,
      );
      await partyRolesService.removeRole(
        ctx.tenantId,
        party.id,
        adminUserId,
        PartyRoleType.supplier,
      );

      const refreshed = await partiesService.findById(ctx.tenantId, party.id);
      expect(refreshed.roles.some((role) => role.role === PartyRoleType.supplier)).toBe(false);
    });
  });

  describe('Party contacts', () => {
    it('creates, updates, and archives organization contacts', async () => {
      const party = await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-CONT-${Date.now()}`,
        displayName: 'Contact Org',
      });

      const contact = await partyContactsService.createContact(
        ctx.tenantId,
        party.id,
        adminUserId,
        {
          name: 'Finance Manager',
          title: 'Finance',
          email: 'finance@contact-org.test',
          isPrimary: true,
        },
      );

      const updated = await partyContactsService.updateContact(
        ctx.tenantId,
        party.id,
        contact.id,
        adminUserId,
        { title: 'Head of Finance' },
      );
      expect(updated.title).toBe('Head of Finance');

      await partyContactsService.archiveContact(
        ctx.tenantId,
        party.id,
        contact.id,
        adminUserId,
      );

      const contacts = await partyContactsService.listContacts(ctx.tenantId, party.id);
      expect(contacts).toHaveLength(0);
    });

    it('rejects contacts on individual parties', async () => {
      const party = await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.individual,
        code: `PTY-IND-${Date.now()}`,
        displayName: 'Individual Only',
      });

      await expect(
        partyContactsService.createContact(ctx.tenantId, party.id, adminUserId, {
          name: 'Should Fail',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Tenant isolation', () => {
    it('blocks cross-tenant party read, update, archive, roles, and contacts', async () => {
      const isolated = await createIsolatedTenant(prisma, 'party');
      const party = await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-ISO-${Date.now()}`,
        displayName: 'Tenant A Party',
      });

      await expect(
        partiesService.findById(isolated.tenantId, party.id),
      ).rejects.toBeInstanceOf(NotFoundException);

      await expect(
        partiesService.update(isolated.tenantId, party.id, adminUserId, {
          displayName: 'Hacked',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      await expect(
        partiesService.archive(isolated.tenantId, party.id, adminUserId),
      ).rejects.toBeInstanceOf(NotFoundException);

      await expect(
        partyRolesService.assignRole(
          isolated.tenantId,
          party.id,
          adminUserId,
          PartyRoleType.customer,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      await expect(
        partyContactsService.listContacts(isolated.tenantId, party.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('Financial boundary', () => {
    it('does not create GL journals during party operations', async () => {
      const beforeCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });

      const party = await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-GL-${Date.now()}`,
        displayName: 'No GL Party',
      });

      await partyRolesService.assignRole(
        ctx.tenantId,
        party.id,
        adminUserId,
        PartyRoleType.customer,
      );
      await partyRolesService.assignRole(
        ctx.tenantId,
        party.id,
        adminUserId,
        PartyRoleType.supplier,
      );
      await partyContactsService.createContact(ctx.tenantId, party.id, adminUserId, {
        name: 'Contact',
      });
      await partiesService.archive(ctx.tenantId, party.id, adminUserId);

      const afterCount = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(afterCount).toBe(beforeCount);
    });
  });

  describe('HTTP API', () => {
    it('exposes party endpoints under /api/v1/parties', async () => {
      const createRes = await api()
        .post('/api/v1/parties')
        .send({
          type: PartyType.organization,
          code: `PTY-API-${Date.now()}`,
          displayName: 'API Party',
        });
      expect([200, 201]).toContain(createRes.status);
      const partyId = createRes.body.data.id as string;

      const listRes = await api().get('/api/v1/parties?search=API Party');
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

      const roleRes = await api()
        .post(`/api/v1/parties/${partyId}/roles`)
        .send({ role: PartyRoleType.customer });
      expect([200, 201]).toContain(roleRes.status);

      const contactRes = await api()
        .post(`/api/v1/parties/${partyId}/contacts`)
        .send({ name: 'API Contact', isPrimary: true });
      expect([200, 201]).toContain(contactRes.status);
    });
  });
});
