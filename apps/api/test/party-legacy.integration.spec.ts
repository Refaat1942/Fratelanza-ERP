import type { INestApplication } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PartyRoleType, PartyType } from '../../../packages/database/generated/server';
import { PrismaService } from '../src/database/prisma.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { PartyLegacyAdapterService } from '../src/modules/parties/party-legacy-adapter.service';
import { PartiesService } from '../src/modules/parties/parties.service';
import { PartyRolesService } from '../src/modules/parties/party-roles.service';
import { SuppliersService } from '../src/modules/suppliers/suppliers.service';
import { createIsolatedTenant, loadPmsTestContext, type PmsTestContext } from './pms-test.helpers';
import { createTestApp, loginAdmin } from './test-app';

describe('Party legacy ERP adapter (Phase 4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let partiesService: PartiesService;
  let partyRolesService: PartyRolesService;
  let legacyAdapter: PartyLegacyAdapterService;
  let customersService: CustomersService;
  let suppliersService: SuppliersService;
  let ctx: PmsTestContext;
  let adminUserId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    partiesService = app.get(PartiesService);
    partyRolesService = app.get(PartyRolesService);
    legacyAdapter = app.get(PartyLegacyAdapterService);
    customersService = app.get(CustomersService);
    suppliersService = app.get(SuppliersService);
    ctx = await loadPmsTestContext(app);
    adminUserId = ctx.adminUserId;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createPartyWithRole(
    displayName: string,
    role: PartyRoleType,
  ) {
    const party = await partiesService.create(ctx.tenantId, adminUserId, {
      type: PartyType.organization,
      code: `PTY-L4-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      displayName,
    });
    await partyRolesService.assignRole(ctx.tenantId, party.id, adminUserId, role);
    return party;
  }

  async function createLegacyCustomer(code: string, name: string) {
    return customersService.create(ctx.tenantId, {
      code,
      name,
      branchId: ctx.branchId,
    });
  }

  async function createLegacySupplier(code: string, name: string) {
    return suppliersService.create(ctx.tenantId, {
      code,
      name,
    });
  }

  describe('Customer linking', () => {
    it('links Party to Customer and resolves both directions', async () => {
      const party = await createPartyWithRole('Customer Link Co', PartyRoleType.customer);
      const customer = await createLegacyCustomer(
        `C-L4-${Date.now()}`,
        'Customer Link Co Legacy',
      );

      const linked = await legacyAdapter.linkCustomer(
        ctx.tenantId,
        party.id,
        customer.id,
        adminUserId,
      );
      expect(linked.partyId).toBe(party.id);

      const fromParty = await legacyAdapter.getLinkedCustomer(ctx.tenantId, party.id);
      expect(fromParty?.id).toBe(customer.id);

      const fromCustomer = await legacyAdapter.resolvePartyFromCustomer(
        ctx.tenantId,
        customer.id,
      );
      expect(fromCustomer?.id).toBe(party.id);
    });

    it('unlinks Customer from Party', async () => {
      const party = await createPartyWithRole('Unlink Customer Co', PartyRoleType.customer);
      const customer = await createLegacyCustomer(
        `C-UNL-${Date.now()}`,
        'Unlink Customer Co Legacy',
      );

      await legacyAdapter.linkCustomer(ctx.tenantId, party.id, customer.id, adminUserId);
      await legacyAdapter.unlinkCustomer(ctx.tenantId, party.id, adminUserId);

      const linked = await legacyAdapter.getLinkedCustomer(ctx.tenantId, party.id);
      expect(linked).toBeNull();

      const partyResolved = await legacyAdapter.resolvePartyFromCustomer(
        ctx.tenantId,
        customer.id,
      );
      expect(partyResolved).toBeNull();
    });

    it('rejects duplicate Party to Customer link', async () => {
      const party = await createPartyWithRole('Dup Customer Party', PartyRoleType.customer);
      const customerA = await createLegacyCustomer(`C-DUP-A-${Date.now()}`, 'Customer A');
      const customerB = await createLegacyCustomer(`C-DUP-B-${Date.now()}`, 'Customer B');

      await legacyAdapter.linkCustomer(ctx.tenantId, party.id, customerA.id, adminUserId);

      await expect(
        legacyAdapter.linkCustomer(ctx.tenantId, party.id, customerB.id, adminUserId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects linking when Party lacks customer role', async () => {
      const party = await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-NOROLE-${Date.now()}`,
        displayName: 'No Role Party',
      });
      const customer = await createLegacyCustomer(`C-NOROLE-${Date.now()}`, 'No Role Customer');

      await expect(
        legacyAdapter.linkCustomer(ctx.tenantId, party.id, customer.id, adminUserId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects cross-tenant Party to Customer link', async () => {
      const isolated = await createIsolatedTenant(prisma, 'party-cust');
      const party = await createPartyWithRole('Tenant A Party', PartyRoleType.customer);
      const isolatedCustomer = await prisma.customer.create({
        data: {
          tenantId: isolated.tenantId,
          code: `ISO-C-${Date.now()}`,
          name: 'Isolated Customer',
        },
      });

      await expect(
        legacyAdapter.linkCustomer(ctx.tenantId, party.id, isolatedCustomer.id, adminUserId),
      ).rejects.toBeInstanceOf(NotFoundException);

      await expect(
        legacyAdapter.resolvePartyFromCustomer(isolated.tenantId, isolatedCustomer.id),
      ).resolves.toBeNull();
    });

    it('rejects cross-tenant Customer to Party resolution', async () => {
      const party = await createPartyWithRole('Resolution Party', PartyRoleType.customer);
      const customer = await createLegacyCustomer(`C-XT-${Date.now()}`, 'Resolution Customer');
      await legacyAdapter.linkCustomer(ctx.tenantId, party.id, customer.id, adminUserId);

      const isolated = await createIsolatedTenant(prisma, 'party-cust-res');
      await expect(
        legacyAdapter.resolvePartyFromCustomer(isolated.tenantId, customer.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('Supplier linking', () => {
    it('links Party to Supplier and resolves both directions', async () => {
      const party = await createPartyWithRole('Supplier Link Co', PartyRoleType.supplier);
      const supplier = await createLegacySupplier(
        `S-L4-${Date.now()}`,
        'Supplier Link Co Legacy',
      );

      const linked = await legacyAdapter.linkSupplier(
        ctx.tenantId,
        party.id,
        supplier.id,
        adminUserId,
      );
      expect(linked.partyId).toBe(party.id);

      const fromParty = await legacyAdapter.getLinkedSupplier(ctx.tenantId, party.id);
      expect(fromParty?.id).toBe(supplier.id);

      const fromSupplier = await legacyAdapter.resolvePartyFromSupplier(
        ctx.tenantId,
        supplier.id,
      );
      expect(fromSupplier?.id).toBe(party.id);
    });

    it('unlinks Supplier from Party', async () => {
      const party = await createPartyWithRole('Unlink Supplier Co', PartyRoleType.supplier);
      const supplier = await createLegacySupplier(
        `S-UNL-${Date.now()}`,
        'Unlink Supplier Co Legacy',
      );

      await legacyAdapter.linkSupplier(ctx.tenantId, party.id, supplier.id, adminUserId);
      await legacyAdapter.unlinkSupplier(ctx.tenantId, party.id, adminUserId);

      expect(await legacyAdapter.getLinkedSupplier(ctx.tenantId, party.id)).toBeNull();
      expect(
        await legacyAdapter.resolvePartyFromSupplier(ctx.tenantId, supplier.id),
      ).toBeNull();
    });

    it('rejects duplicate Party to Supplier link', async () => {
      const party = await createPartyWithRole('Dup Supplier Party', PartyRoleType.supplier);
      const supplierA = await createLegacySupplier(`S-DUP-A-${Date.now()}`, 'Supplier A');
      const supplierB = await createLegacySupplier(`S-DUP-B-${Date.now()}`, 'Supplier B');

      await legacyAdapter.linkSupplier(ctx.tenantId, party.id, supplierA.id, adminUserId);

      await expect(
        legacyAdapter.linkSupplier(ctx.tenantId, party.id, supplierB.id, adminUserId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects linking when Party lacks supplier role', async () => {
      const party = await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-NOSUP-${Date.now()}`,
        displayName: 'No Supplier Role Party',
      });
      const supplier = await createLegacySupplier(`S-NOROLE-${Date.now()}`, 'No Role Supplier');

      await expect(
        legacyAdapter.linkSupplier(ctx.tenantId, party.id, supplier.id, adminUserId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects cross-tenant Party to Supplier link', async () => {
      const party = await createPartyWithRole('Tenant A Supplier Party', PartyRoleType.supplier);
      const isolated = await createIsolatedTenant(prisma, 'party-sup');
      const isolatedSupplier = await prisma.supplier.create({
        data: {
          tenantId: isolated.tenantId,
          code: `ISO-S-${Date.now()}`,
          name: 'Isolated Supplier',
        },
      });

      await expect(
        legacyAdapter.linkSupplier(ctx.tenantId, party.id, isolatedSupplier.id, adminUserId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects cross-tenant Supplier to Party resolution', async () => {
      const party = await createPartyWithRole('Supplier Resolution Party', PartyRoleType.supplier);
      const supplier = await createLegacySupplier(`S-XT-${Date.now()}`, 'Resolution Supplier');
      await legacyAdapter.linkSupplier(ctx.tenantId, party.id, supplier.id, adminUserId);

      const isolated = await createIsolatedTenant(prisma, 'party-sup-res');
      await expect(
        legacyAdapter.resolvePartyFromSupplier(isolated.tenantId, supplier.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('Dual role', () => {
    it('allows the same Party to link one Customer and one Supplier', async () => {
      const party = await partiesService.create(ctx.tenantId, adminUserId, {
        type: PartyType.organization,
        code: `PTY-DUAL-${Date.now()}`,
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

      const customer = await createLegacyCustomer(`C-DUAL-${Date.now()}`, 'Dual Customer');
      const supplier = await createLegacySupplier(`S-DUAL-${Date.now()}`, 'Dual Supplier');

      await legacyAdapter.linkCustomer(ctx.tenantId, party.id, customer.id, adminUserId);
      await legacyAdapter.linkSupplier(ctx.tenantId, party.id, supplier.id, adminUserId);

      const linkedCustomer = await legacyAdapter.getLinkedCustomer(ctx.tenantId, party.id);
      const linkedSupplier = await legacyAdapter.getLinkedSupplier(ctx.tenantId, party.id);

      expect(linkedCustomer?.id).toBe(customer.id);
      expect(linkedSupplier?.id).toBe(supplier.id);
      expect(linkedCustomer?.id).not.toBe(linkedSupplier?.id);
    });
  });

  describe('Boundaries and audit', () => {
    it('does not create GL journals or PMS ledger entries during linking', async () => {
      const journalBefore = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const ledgerBefore = await prisma.ledgerEntry.count({ where: { tenantId: ctx.tenantId } });

      const party = await createPartyWithRole('Boundary Party', PartyRoleType.customer);
      const customer = await createLegacyCustomer(`C-BND-${Date.now()}`, 'Boundary Customer');
      await legacyAdapter.linkCustomer(ctx.tenantId, party.id, customer.id, adminUserId);
      await legacyAdapter.unlinkCustomer(ctx.tenantId, party.id, adminUserId);

      const journalAfter = await prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
      const ledgerAfter = await prisma.ledgerEntry.count({ where: { tenantId: ctx.tenantId } });

      expect(journalAfter).toBe(journalBefore);
      expect(ledgerAfter).toBe(ledgerBefore);
    });

    it('creates audit events for link and unlink', async () => {
      const party = await createPartyWithRole('Audit Party', PartyRoleType.customer);
      const customer = await createLegacyCustomer(`C-AUD-${Date.now()}`, 'Audit Customer');

      await legacyAdapter.linkCustomer(ctx.tenantId, party.id, customer.id, adminUserId);
      await legacyAdapter.unlinkCustomer(ctx.tenantId, party.id, adminUserId);

      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: ctx.tenantId,
          entity: 'party_legacy_customer',
          entityId: customer.id,
        },
        orderBy: { createdAt: 'asc' },
      });

      expect(logs.some((log) => log.action === 'linked')).toBe(true);
      expect(logs.some((log) => log.action === 'unlinked')).toBe(true);
    });
  });
});
