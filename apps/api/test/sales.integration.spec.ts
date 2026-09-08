import type { INestApplication } from '@nestjs/common';
import { PartyRoleType, PartyType } from '../../../packages/database/generated/server';
import { PrismaService } from '../src/database/prisma.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { PartiesService } from '../src/modules/parties/parties.service';
import { PartyLegacyAdapterService } from '../src/modules/parties/party-legacy-adapter.service';
import { PartyRolesService } from '../src/modules/parties/party-roles.service';
import { createIsolatedTenant } from './pms-test.helpers';
import {
  createLinkedPartyCustomer,
  invoiceLine,
  loadSalesTestContext,
  type SalesTestContext,
  withPartyLegacyRoutingAsync,
} from './sales-test.helpers';
import { createTestApp, loginAdmin, request } from './test-app';

describe('Universal Sales foundation (Phase 5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: SalesTestContext;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ctx = await loadSalesTestContext(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Party routing', () => {
    it('resolves Party to linked Customer for Party-aware invoice create', async () => {
      const { party, customer } = await createLinkedPartyCustomer(app, ctx, 'OK');

      await withPartyLegacyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/sales/invoices/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [invoiceLine(ctx.productId)],
          });

        expect(res.status).toBe(201);
        expect(res.body.data.customerId).toBe(customer.id);
      });
    });

    it('rejects Party without customer role', async () => {
      const parties = app.get(PartiesService);
      const party = await parties.create(ctx.tenantId, ctx.adminUserId, {
        type: PartyType.organization,
        code: `PTY-NOROLE-${Date.now()}`,
        displayName: 'No Role Party',
      });

      await withPartyLegacyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/sales/invoices/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [invoiceLine(ctx.productId)],
          });

        expect(res.status).toBe(400);
        expect(String(res.body.error?.message ?? res.body.message)).toMatch(/customer role/i);
      });
    });

    it('rejects Party with customer role but no linked Customer', async () => {
      const parties = app.get(PartiesService);
      const partyRoles = app.get(PartyRolesService);
      const party = await parties.create(ctx.tenantId, ctx.adminUserId, {
        type: PartyType.organization,
        code: `PTY-NOLINK-${Date.now()}`,
        displayName: 'Unlinked Party',
      });
      await partyRoles.assignRole(
        ctx.tenantId,
        party.id,
        ctx.adminUserId,
        PartyRoleType.customer,
      );

      await withPartyLegacyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/sales/invoices/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [invoiceLine(ctx.productId)],
          });

        expect(res.status).toBe(400);
        expect(String(res.body.error?.message ?? res.body.message)).toMatch(/linked to a legacy Customer/i);
      });
    });

    it('rejects Party from another tenant', async () => {
      const isolated = await createIsolatedTenant(prisma, 'sales-party');
      const parties = app.get(PartiesService);
      const partyRoles = app.get(PartyRolesService);
      const party = await parties.create(isolated.tenantId, ctx.adminUserId, {
        type: PartyType.organization,
        code: `PTY-XT-${Date.now()}`,
        displayName: 'Cross Tenant Party',
      });
      await partyRoles.assignRole(
        isolated.tenantId,
        party.id,
        ctx.adminUserId,
        PartyRoleType.customer,
      );

      await withPartyLegacyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/sales/invoices/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [invoiceLine(ctx.productId)],
          });

        expect(res.status).toBe(404);
      });
    });

    it('rejects Customer from another tenant on legacy invoice create', async () => {
      const isolated = await createIsolatedTenant(prisma, 'sales-cust');
      const foreignCustomer = await prisma.customer.create({
        data: {
          tenantId: isolated.tenantId,
          branchId: isolated.branchId,
          code: `C-XT-${Date.now()}`,
          name: 'Foreign Customer',
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/invoices')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          branchId: ctx.branchId,
          customerId: foreignCustomer.id,
          warehouseId: ctx.warehouseId,
          lines: [invoiceLine(ctx.productId)],
        });

      expect(res.status).toBe(400);
      expect(String(res.body.error?.message ?? res.body.message)).toMatch(/Customer not found/i);
    });
  });

  describe('Feature flag', () => {
    it('preserves existing Customer-based invoice create when flag is OFF', async () => {
      const customers = app.get(CustomersService);
      const customer = await customers.create(ctx.tenantId, {
        code: `C-LEG-${Date.now()}`,
        name: 'Legacy Customer Invoice',
        branchId: ctx.branchId,
      });

      await withPartyLegacyRoutingAsync(false, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/sales/invoices')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            branchId: ctx.branchId,
            customerId: customer.id,
            warehouseId: ctx.warehouseId,
            lines: [invoiceLine(ctx.productId)],
          });

        expect(res.status).toBe(201);
        expect(res.body.data.customerId).toBe(customer.id);
      });
    });

    it('disables Party-aware endpoint when flag is OFF', async () => {
      const { party } = await createLinkedPartyCustomer(app, ctx, 'FLAG');

      await withPartyLegacyRoutingAsync(false, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/sales/invoices/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [invoiceLine(ctx.productId)],
          });

        expect(res.status).toBe(404);
      });
    });

    it('enables Party-aware flow when flag is ON', async () => {
      const { party } = await createLinkedPartyCustomer(app, ctx, 'FLAGON');

      await withPartyLegacyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/sales/invoices/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [invoiceLine(ctx.productId)],
          });

        expect(res.status).toBe(201);
      });
    });
  });

  describe('Sales behavior', () => {
    it('creates audit metadata for Party-aware invoice', async () => {
      const { party, customer } = await createLinkedPartyCustomer(app, ctx, 'AUD');

      await withPartyLegacyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/sales/invoices/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [invoiceLine(ctx.productId)],
          });
        expect(res.status).toBe(201);

        const logs = await prisma.auditLog.findMany({
          where: {
            tenantId: ctx.tenantId,
            entity: 'sales_invoice',
            entityId: res.body.data.id,
            action: 'sales.invoice.created_from_party',
          },
        });
        expect(logs.length).toBe(1);
        expect((logs[0].newValue as { partyId: string }).partyId).toBe(party.id);
        expect((logs[0].newValue as { customerId: string }).customerId).toBe(customer.id);
      });
    });

    it('keeps invoice numbering correct for Party-aware create', async () => {
      const { party } = await createLinkedPartyCustomer(app, ctx, 'NUM');

      await withPartyLegacyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/sales/invoices/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [invoiceLine(ctx.productId)],
          });

        expect(res.status).toBe(201);
        expect(res.body.data.number).toMatch(/^INV-\d{4}-\d{6}$/);
      });
    });

    it('posts Party-aware invoice with atomic stock update', async () => {
      const { party } = await createLinkedPartyCustomer(app, ctx, 'STK');

      await withPartyLegacyRoutingAsync(true, async () => {
        const before = await request(app.getHttpServer())
          .get('/api/v1/inventory/balances')
          .set('Authorization', `Bearer ${ctx.accessToken}`);
        const startingQty = Number(
          before.body.data.find(
            (row: { product: { id: string } }) => row.product.id === ctx.productId,
          )?.quantity ?? 0,
        );

        const draft = await request(app.getHttpServer())
          .post('/api/v1/sales/invoices/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [invoiceLine(ctx.productId, 2)],
          });
        expect(draft.status).toBe(201);

        const post = await request(app.getHttpServer())
          .post(`/api/v1/sales/invoices/${draft.body.data.id}/post`)
          .set('Authorization', `Bearer ${ctx.accessToken}`);
        expect(post.status).toBe(201);

        const after = await request(app.getHttpServer())
          .get('/api/v1/inventory/balances')
          .set('Authorization', `Bearer ${ctx.accessToken}`);
        const endingQty = Number(
          after.body.data.find(
            (row: { product: { id: string } }) => row.product.id === ctx.productId,
          )?.quantity ?? 0,
        );
        expect(endingQty).toBe(startingQty - 2);
      });
    });
  });

  describe('Finance boundary', () => {
    it('does not create journals on draft Party-aware invoice', async () => {
      const { party } = await createLinkedPartyCustomer(app, ctx, 'GLDRAFT');
      const journalsBefore = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });

      await withPartyLegacyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/sales/invoices/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [invoiceLine(ctx.productId)],
          });
        expect(res.status).toBe(201);
      });

      const journalsAfter = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(journalsAfter).toBe(journalsBefore);
    });

    it('uses legacy AccountingEngineService path on post (referenceType sales_invoice)', async () => {
      const { party } = await createLinkedPartyCustomer(app, ctx, 'GLPOST');

      await withPartyLegacyRoutingAsync(true, async () => {
        const draft = await request(app.getHttpServer())
          .post('/api/v1/sales/invoices/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [invoiceLine(ctx.productId, 1)],
          });
        expect(draft.status).toBe(201);

        const post = await request(app.getHttpServer())
          .post(`/api/v1/sales/invoices/${draft.body.data.id}/post`)
          .set('Authorization', `Bearer ${ctx.accessToken}`);
        expect(post.status).toBe(201);

        const journal = await prisma.journalEntry.findFirst({
          where: {
            tenantId: ctx.tenantId,
            referenceType: 'sales_invoice',
            referenceId: draft.body.data.id,
          },
        });
        expect(journal).toBeTruthy();
        expect(journal?.sourceModule).toBeNull();
        expect(journal?.fiscalPeriodId).toBeNull();
      });
    });

    it('does not create FinancialPostingService sourceModule journals during Sales flow', async () => {
      const { party } = await createLinkedPartyCustomer(app, ctx, 'GLFPS');

      await withPartyLegacyRoutingAsync(true, async () => {
        const draft = await request(app.getHttpServer())
          .post('/api/v1/sales/invoices/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [invoiceLine(ctx.productId, 1)],
          });
        expect(draft.status).toBe(201);

        const post = await request(app.getHttpServer())
          .post(`/api/v1/sales/invoices/${draft.body.data.id}/post`)
          .set('Authorization', `Bearer ${ctx.accessToken}`);
        expect(post.status).toBe(201);

        const fpsJournal = await prisma.journalEntry.findFirst({
          where: {
            tenantId: ctx.tenantId,
            sourceModule: 'sales',
            sourceId: draft.body.data.id,
          },
        });
        expect(fpsJournal).toBeNull();

        const legacyJournal = await prisma.journalEntry.findFirst({
          where: {
            tenantId: ctx.tenantId,
            referenceType: 'sales_invoice',
            referenceId: draft.body.data.id,
          },
        });
        expect(legacyJournal).toBeTruthy();
      });
    });
  });

  describe('Adapter integrity', () => {
    it('does not create duplicate Party-Customer relationships during Sales', async () => {
      const { party, customer } = await createLinkedPartyCustomer(app, ctx, 'DUP');

      await withPartyLegacyRoutingAsync(true, async () => {
        await request(app.getHttpServer())
          .post('/api/v1/sales/invoices/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [invoiceLine(ctx.productId)],
          });
      });

      const links = await prisma.customer.count({
        where: { tenantId: ctx.tenantId, partyId: party.id },
      });
      expect(links).toBe(1);

      const refreshed = await prisma.customer.findUnique({ where: { id: customer.id } });
      expect(refreshed?.partyId).toBe(party.id);
    });
  });

  describe('RBAC', () => {
    it('rejects Sales create when user lacks Sales RBAC permission', async () => {
      const role = await prisma.role.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'No Sales Create',
          code: `no-sales-${Date.now()}`,
        },
      });
      const readPerm = await prisma.permission.findFirst({
        where: { module: 'sales', feature: 'invoices', action: 'read' },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: readPerm!.id },
      });
      const username = `no-sales-create-${Date.now()}`;
      const user = await prisma.user.create({
        data: {
          tenantId: ctx.tenantId,
          email: `${username}@fratelanza.local`,
          passwordHash: '$2a$12$placeholder',
          firstName: 'No',
          lastName: 'Create',
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
        .post('/api/v1/sales/invoices')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .send({
          branchId: ctx.branchId,
          warehouseId: ctx.warehouseId,
          lines: [invoiceLine(ctx.productId)],
        });
      expect(res.status).toBe(403);
    });
  });
});
