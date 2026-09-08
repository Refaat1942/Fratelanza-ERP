import type { INestApplication } from '@nestjs/common';
import { PartyRoleType, PartyType, ProjectStatus } from '../../../packages/database/generated/server';
import { PrismaService } from '../src/database/prisma.service';
import { SuppliersService } from '../src/modules/suppliers/suppliers.service';
import { PartiesService } from '../src/modules/parties/parties.service';
import { PartyRolesService } from '../src/modules/parties/party-roles.service';
import { createIsolatedTenant } from './pms-test.helpers';
import {
  createLinkedPartySupplier,
  loadPurchasingTestContext,
  poLine,
  type PurchasingTestContext,
  withPurchasingPartyRoutingAsync,
  withUniversalFinancePilotAsync,
} from './purchasing-test.helpers';
import { createTestApp, loginAdmin, request } from './test-app';

describe('Universal Purchasing foundation (Phase 6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: PurchasingTestContext;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ctx = await loadPurchasingTestContext(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Party/Supplier resolution', () => {
    it('resolves Party to linked Supplier for Party-aware order create', async () => {
      const { party, supplier } = await createLinkedPartySupplier(app, ctx, 'OK');

      await withPurchasingPartyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/purchasing/orders/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [poLine(ctx.productId)],
          });

        expect(res.status).toBe(201);
        expect(res.body.data.supplierId).toBe(supplier.id);
      });
    });

    it('rejects Party without supplier role', async () => {
      const parties = app.get(PartiesService);
      const party = await parties.create(ctx.tenantId, ctx.adminUserId, {
        type: PartyType.organization,
        code: `PTY-NOROLE-${Date.now()}`,
        displayName: 'No Supplier Role',
      });

      await withPurchasingPartyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/purchasing/orders/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [poLine(ctx.productId)],
          });

        expect(res.status).toBe(400);
        expect(String(res.body.error?.message ?? res.body.message)).toMatch(/supplier role/i);
      });
    });

    it('rejects Party with supplier role but no linked Supplier', async () => {
      const parties = app.get(PartiesService);
      const partyRoles = app.get(PartyRolesService);
      const party = await parties.create(ctx.tenantId, ctx.adminUserId, {
        type: PartyType.organization,
        code: `PTY-NOLINK-${Date.now()}`,
        displayName: 'Unlinked Supplier Party',
      });
      await partyRoles.assignRole(
        ctx.tenantId,
        party.id,
        ctx.adminUserId,
        PartyRoleType.supplier,
      );

      await withPurchasingPartyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/purchasing/orders/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [poLine(ctx.productId)],
          });

        expect(res.status).toBe(400);
        expect(String(res.body.error?.message ?? res.body.message)).toMatch(/linked to a legacy Supplier/i);
      });
    });

    it('rejects Party from another tenant', async () => {
      const isolated = await createIsolatedTenant(prisma, 'po-party');
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
        PartyRoleType.supplier,
      );

      await withPurchasingPartyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/purchasing/orders/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [poLine(ctx.productId)],
          });

        expect(res.status).toBe(404);
      });
    });

    it('rejects Supplier from another tenant on legacy order create', async () => {
      const isolated = await createIsolatedTenant(prisma, 'po-sup');
      const foreignSupplier = await prisma.supplier.create({
        data: {
          tenantId: isolated.tenantId,
          code: `S-XT-${Date.now()}`,
          name: 'Foreign Supplier',
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/purchasing/orders')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          branchId: ctx.branchId,
          supplierId: foreignSupplier.id,
          warehouseId: ctx.warehouseId,
          lines: [poLine(ctx.productId)],
        });

      expect(res.status).toBe(400);
      expect(String(res.body.error?.message ?? res.body.message)).toMatch(/Supplier not found/i);
    });
  });

  describe('Feature flag', () => {
    it('preserves existing Supplier-based order create when flag is OFF', async () => {
      const suppliers = app.get(SuppliersService);
      const supplier = await suppliers.create(ctx.tenantId, {
        code: `S-LEG-${Date.now()}`,
        name: 'Legacy Supplier PO',
      });

      await withPurchasingPartyRoutingAsync(false, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/purchasing/orders')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            branchId: ctx.branchId,
            supplierId: supplier.id,
            warehouseId: ctx.warehouseId,
            lines: [poLine(ctx.productId)],
          });

        expect(res.status).toBe(201);
        expect(res.body.data.supplierId).toBe(supplier.id);
      });
    });

    it('disables Party-aware endpoint when flag is OFF', async () => {
      const { party } = await createLinkedPartySupplier(app, ctx, 'FLAG');

      await withPurchasingPartyRoutingAsync(false, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/purchasing/orders/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [poLine(ctx.productId)],
          });

        expect(res.status).toBe(404);
      });
    });

    it('enables Party-aware flow when flag is ON', async () => {
      const { party } = await createLinkedPartySupplier(app, ctx, 'FLAGON');

      await withPurchasingPartyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/purchasing/orders/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [poLine(ctx.productId)],
          });

        expect(res.status).toBe(201);
      });
    });
  });

  describe('Purchasing behavior', () => {
    it('creates audit metadata for Party-aware order', async () => {
      const { party, supplier } = await createLinkedPartySupplier(app, ctx, 'AUD');

      await withPurchasingPartyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/purchasing/orders/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [poLine(ctx.productId)],
          });
        expect(res.status).toBe(201);

        const logs = await prisma.auditLog.findMany({
          where: {
            tenantId: ctx.tenantId,
            entity: 'purchase_order',
            entityId: res.body.data.id,
            action: 'purchasing.order.created_from_party',
          },
        });
        expect(logs.length).toBe(1);
        expect((logs[0].newValue as { partyId: string }).partyId).toBe(party.id);
        expect((logs[0].newValue as { supplierId: string }).supplierId).toBe(supplier.id);
      });
    });

    it('keeps PO numbering correct for Party-aware create', async () => {
      const { party } = await createLinkedPartySupplier(app, ctx, 'NUM');

      await withPurchasingPartyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/purchasing/orders/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [poLine(ctx.productId)],
          });

        expect(res.status).toBe(201);
        expect(res.body.data.number).toMatch(/^PO-\d{4}-\d{6}$/);
      });
    });

    it('receives Party-aware order with stock increase', async () => {
      const { party } = await createLinkedPartySupplier(app, ctx, 'RCV');

      await withPurchasingPartyRoutingAsync(true, async () => {
        const before = await request(app.getHttpServer())
          .get('/api/v1/inventory/balances')
          .set('Authorization', `Bearer ${ctx.accessToken}`);
        const startingQty = Number(
          before.body.data.find(
            (row: { product: { id: string } }) => row.product.id === ctx.productId,
          )?.quantity ?? 0,
        );

        const draft = await request(app.getHttpServer())
          .post('/api/v1/purchasing/orders/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [poLine(ctx.productId, 5)],
          });
        expect(draft.status).toBe(201);

        const receive = await request(app.getHttpServer())
          .post(`/api/v1/purchasing/orders/${draft.body.data.id}/receive`)
          .set('Authorization', `Bearer ${ctx.accessToken}`);
        expect(receive.status).toBe(201);

        const after = await request(app.getHttpServer())
          .get('/api/v1/inventory/balances')
          .set('Authorization', `Bearer ${ctx.accessToken}`);
        const endingQty = Number(
          after.body.data.find(
            (row: { product: { id: string } }) => row.product.id === ctx.productId,
          )?.quantity ?? 0,
        );
        expect(endingQty).toBe(startingQty + 5);
      });
    });

    it('does not duplicate receive when order already received', async () => {
      const suppliers = app.get(SuppliersService);
      const supplier = await suppliers.create(ctx.tenantId, {
        code: `S-RCV2-${Date.now()}`,
        name: 'Receive Twice Supplier',
      });

      const draft = await request(app.getHttpServer())
        .post('/api/v1/purchasing/orders')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          branchId: ctx.branchId,
          supplierId: supplier.id,
          warehouseId: ctx.warehouseId,
          lines: [poLine(ctx.productId, 3)],
        });
      expect(draft.status).toBe(201);

      const first = await request(app.getHttpServer())
        .post(`/api/v1/purchasing/orders/${draft.body.data.id}/receive`)
        .set('Authorization', `Bearer ${ctx.accessToken}`);
      expect(first.status).toBe(201);

      const second = await request(app.getHttpServer())
        .post(`/api/v1/purchasing/orders/${draft.body.data.id}/receive`)
        .set('Authorization', `Bearer ${ctx.accessToken}`);
      expect(second.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Finance boundary', () => {
    it('does not create journals on draft Party-aware order', async () => {
      const { party } = await createLinkedPartySupplier(app, ctx, 'GLDRAFT');
      const journalsBefore = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });

      await withPurchasingPartyRoutingAsync(true, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/purchasing/orders/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [poLine(ctx.productId)],
          });
        expect(res.status).toBe(201);
      });

      const journalsAfter = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      expect(journalsAfter).toBe(journalsBefore);
    });

    it('uses legacy AccountingEngineService path on receive', async () => {
      const { party } = await createLinkedPartySupplier(app, ctx, 'GLRCV');

      await withPurchasingPartyRoutingAsync(true, async () => {
        const draft = await request(app.getHttpServer())
          .post('/api/v1/purchasing/orders/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [poLine(ctx.productId, 2)],
          });
        expect(draft.status).toBe(201);

        const receive = await request(app.getHttpServer())
          .post(`/api/v1/purchasing/orders/${draft.body.data.id}/receive`)
          .set('Authorization', `Bearer ${ctx.accessToken}`);
        expect(receive.status).toBe(201);

        const legacyJournal = await prisma.journalEntry.findFirst({
          where: {
            tenantId: ctx.tenantId,
            referenceType: 'purchase_order',
            referenceId: draft.body.data.id,
          },
        });
        expect(legacyJournal).toBeTruthy();
        expect(legacyJournal?.sourceModule).toBeNull();

        const fpsJournal = await prisma.journalEntry.findFirst({
          where: {
            tenantId: ctx.tenantId,
            sourceModule: 'purchasing',
            sourceId: draft.body.data.id,
          },
        });
        expect(fpsJournal).toBeNull();
      });
    });
  });

  describe('Adapter integrity', () => {
    it('does not create duplicate Party-Supplier relationships during Purchasing', async () => {
      const { party, supplier } = await createLinkedPartySupplier(app, ctx, 'DUP');

      await withPurchasingPartyRoutingAsync(true, async () => {
        await request(app.getHttpServer())
          .post('/api/v1/purchasing/orders/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [poLine(ctx.productId)],
          });
      });

      const links = await prisma.supplier.count({
        where: { tenantId: ctx.tenantId, partyId: party.id },
      });
      expect(links).toBe(1);

      const refreshed = await prisma.supplier.findUnique({ where: { id: supplier.id } });
      expect(refreshed?.partyId).toBe(party.id);
    });
  });

  describe('RBAC', () => {
    it('rejects Purchasing create when user lacks RBAC permission', async () => {
      const role = await prisma.role.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'No PO Create',
          code: `no-po-${Date.now()}`,
        },
      });
      const readPerm = await prisma.permission.findFirst({
        where: { module: 'purchasing', feature: 'orders', action: 'read' },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: readPerm!.id },
      });
      const username = `no-po-create-${Date.now()}`;
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

      const suppliers = app.get(SuppliersService);
      const supplier = await suppliers.create(ctx.tenantId, {
        code: `S-RBAC-${Date.now()}`,
        name: 'RBAC Supplier',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/purchasing/orders')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .send({
          branchId: ctx.branchId,
          supplierId: supplier.id,
          warehouseId: ctx.warehouseId,
          lines: [poLine(ctx.productId)],
        });
      expect(res.status).toBe(403);
    });
  });

  describe('Phase 8.2 Universal Finance pilot (PO receive)', () => {
    async function createDraftOrderViaParty(label: string) {
      const { party } = await createLinkedPartySupplier(app, ctx, label);
      let orderId = '';
      await withPurchasingPartyRoutingAsync(true, async () => {
        const draft = await request(app.getHttpServer())
          .post('/api/v1/purchasing/orders/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [poLine(ctx.productId, 3, 15)],
          });
        expect(draft.status).toBe(201);
        orderId = draft.body.data.id;
      });
      return orderId;
    }

    it('uses FinancialPostingService when pilot flag is ON (no legacy journal)', async () => {
      const orderId = await createDraftOrderViaParty('PILOT-FPS');

      await withUniversalFinancePilotAsync(true, async () => {
        await withPurchasingPartyRoutingAsync(true, async () => {
          const receive = await request(app.getHttpServer())
            .post(`/api/v1/purchasing/orders/${orderId}/receive`)
            .set('Authorization', `Bearer ${ctx.accessToken}`)
            .send({});
          expect(receive.status).toBe(201);

          const fpsJournal = await prisma.journalEntry.findFirst({
            where: {
              tenantId: ctx.tenantId,
              sourceModule: 'purchasing',
              sourceType: 'order',
              sourceId: orderId,
              sourceEvent: 'receive',
            },
            include: { lines: true },
          });
          expect(fpsJournal).toBeTruthy();
          expect(fpsJournal?.fiscalPeriodId).not.toBeNull();
          expect(fpsJournal?.lines).toHaveLength(2);

          const legacyJournal = await prisma.journalEntry.findFirst({
            where: {
              tenantId: ctx.tenantId,
              referenceType: 'purchase_order',
              referenceId: orderId,
              sourceModule: null,
            },
          });
          expect(legacyJournal).toBeNull();

          const journalCount = await prisma.journalEntry.count({
            where: {
              tenantId: ctx.tenantId,
              OR: [
                { referenceType: 'purchase_order', referenceId: orderId },
                { sourceModule: 'purchasing', sourceId: orderId },
              ],
            },
          });
          expect(journalCount).toBe(1);
        });
      });
    });

    it('persists optional dimensions on pilot receive', async () => {
      const project = await prisma.project.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          code: `PRJ-P82-${Date.now()}`,
          name: 'Pilot Receive Project',
          status: ProjectStatus.active,
        },
      });
      const costCenter = await prisma.costCenter.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          code: `CC-P82-${Date.now()}`,
          name: 'Pilot Receive CC',
          projectId: project.id,
          isActive: true,
        },
      });
      const orderId = await createDraftOrderViaParty('PILOT-DIM');

      await withUniversalFinancePilotAsync(true, async () => {
        await withPurchasingPartyRoutingAsync(true, async () => {
          const receive = await request(app.getHttpServer())
            .post(`/api/v1/purchasing/orders/${orderId}/receive`)
            .set('Authorization', `Bearer ${ctx.accessToken}`)
            .send({
              dimensions: {
                projectId: project.id,
                costCenterId: costCenter.id,
              },
            });
          expect(receive.status).toBe(201);

          const lines = await prisma.journalLine.findMany({
            where: {
              entry: {
                tenantId: ctx.tenantId,
                sourceModule: 'purchasing',
                sourceId: orderId,
                sourceEvent: 'receive',
              },
            },
          });
          expect(lines).toHaveLength(2);
          for (const line of lines) {
            expect(line.projectId).toBe(project.id);
            expect(line.costCenterId).toBe(costCenter.id);
          }
        });
      });
    });

    it('keeps legacy AccountingEngineService when pilot flag is OFF', async () => {
      const orderId = await createDraftOrderViaParty('PILOT-LEG');

      await withUniversalFinancePilotAsync(false, async () => {
        await withPurchasingPartyRoutingAsync(true, async () => {
          const receive = await request(app.getHttpServer())
            .post(`/api/v1/purchasing/orders/${orderId}/receive`)
            .set('Authorization', `Bearer ${ctx.accessToken}`);
          expect(receive.status).toBe(201);

          const legacyJournal = await prisma.journalEntry.findFirst({
            where: {
              tenantId: ctx.tenantId,
              referenceType: 'purchase_order',
              referenceId: orderId,
            },
          });
          expect(legacyJournal).toBeTruthy();
          expect(legacyJournal?.sourceModule).toBeNull();

          const fpsJournal = await prisma.journalEntry.findFirst({
            where: {
              tenantId: ctx.tenantId,
              sourceModule: 'purchasing',
              sourceId: orderId,
            },
          });
          expect(fpsJournal).toBeNull();
        });
      });
    });

    it('still updates inventory and supplier balance under pilot posting', async () => {
      const { party, supplier } = await createLinkedPartySupplier(app, ctx, 'PILOT-STK');
      const supplierBefore = await prisma.supplier.findUnique({ where: { id: supplier.id } });
      const balanceBefore = Number(supplierBefore?.balance ?? 0);

      let orderId = '';
      let orderTotal = 0;
      await withPurchasingPartyRoutingAsync(true, async () => {
        const draft = await request(app.getHttpServer())
          .post('/api/v1/purchasing/orders/from-party')
          .set('Authorization', `Bearer ${ctx.accessToken}`)
          .send({
            partyId: party.id,
            branchId: ctx.branchId,
            warehouseId: ctx.warehouseId,
            lines: [poLine(ctx.productId, 4, 20)],
          });
        expect(draft.status).toBe(201);
        orderId = draft.body.data.id;
        orderTotal = Number(draft.body.data.total);
      });

      const stockBefore = await prisma.stockBalance.findUnique({
        where: {
          tenantId_warehouseId_productId: {
            tenantId: ctx.tenantId,
            warehouseId: ctx.warehouseId,
            productId: ctx.productId,
          },
        },
      });

      await withUniversalFinancePilotAsync(true, async () => {
        await withPurchasingPartyRoutingAsync(true, async () => {
          const receive = await request(app.getHttpServer())
            .post(`/api/v1/purchasing/orders/${orderId}/receive`)
            .set('Authorization', `Bearer ${ctx.accessToken}`)
            .send({});
          expect(receive.status).toBe(201);
        });
      });

      const stockAfter = await prisma.stockBalance.findUnique({
        where: {
          tenantId_warehouseId_productId: {
            tenantId: ctx.tenantId,
            warehouseId: ctx.warehouseId,
            productId: ctx.productId,
          },
        },
      });
      expect(Number(stockAfter?.quantity)).toBe(Number(stockBefore?.quantity ?? 0) + 4);

      const supplierAfter = await prisma.supplier.findUnique({ where: { id: supplier.id } });
      expect(Number(supplierAfter?.balance)).toBeCloseTo(balanceBefore + orderTotal, 2);
    });
  });
});
