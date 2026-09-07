import type { INestApplication } from '@nestjs/common';
import { PartyRoleType, PartyType } from '../../../packages/database/generated/server';
import { resetAppConfigCache } from '../src/config/app-config';
import { PrismaService } from '../src/database/prisma.service';
import { PartyLegacyAdapterService } from '../src/modules/parties/party-legacy-adapter.service';
import { PartiesService } from '../src/modules/parties/parties.service';
import { PartyRolesService } from '../src/modules/parties/party-roles.service';
import { SuppliersService } from '../src/modules/suppliers/suppliers.service';
import { loginAdmin, request } from './test-app';

export interface PurchasingTestContext {
  tenantId: string;
  branchId: string;
  adminUserId: string;
  accessToken: string;
  warehouseId: string;
  productId: string;
}

export async function loadPurchasingTestContext(
  app: INestApplication,
): Promise<PurchasingTestContext> {
  const auth = await loginAdmin(app);
  const prisma = app.get(PrismaService);
  const admin = await prisma.user.findFirst({
    where: { email: 'admin@fratelanza.local' },
  });

  const units = await request(app.getHttpServer())
    .get('/api/v1/units-of-measure')
    .set('Authorization', `Bearer ${auth.accessToken}`);
  const unitId = units.body.data[0].id;

  const productRes = await request(app.getHttpServer())
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${auth.accessToken}`)
    .send({
      sku: `P6-${Date.now()}`,
      name: 'Phase 6 Purchasing Product',
      unitId,
      salePrice: 30,
      costPrice: 12,
      trackInventory: true,
    });
  const productId = productRes.body.data.id;

  const warehouses = await request(app.getHttpServer())
    .get('/api/v1/warehouses')
    .set('Authorization', `Bearer ${auth.accessToken}`);
  const warehouseId = warehouses.body.data[0].id;

  return {
    tenantId: auth.user.tenantId,
    branchId: auth.user.branchId ?? '',
    adminUserId: admin!.id,
    accessToken: auth.accessToken,
    warehouseId,
    productId,
  };
}

export async function createLinkedPartySupplier(
  app: INestApplication,
  ctx: PurchasingTestContext,
  label: string,
) {
  const parties = app.get(PartiesService);
  const partyRoles = app.get(PartyRolesService);
  const suppliers = app.get(SuppliersService);
  const legacyAdapter = app.get(PartyLegacyAdapterService);

  const party = await parties.create(ctx.tenantId, ctx.adminUserId, {
    type: PartyType.organization,
    code: `PTY-P6-${label}-${Date.now()}`,
    displayName: `${label} Supplier Party`,
  });
  await partyRoles.assignRole(
    ctx.tenantId,
    party.id,
    ctx.adminUserId,
    PartyRoleType.supplier,
  );

  const supplier = await suppliers.create(ctx.tenantId, {
    code: `S-P6-${label}-${Date.now()}`,
    name: `${label} Legacy Supplier`,
  });

  await legacyAdapter.linkSupplier(
    ctx.tenantId,
    party.id,
    supplier.id,
    ctx.adminUserId,
  );

  return { party, supplier };
}

export function poLine(productId: string, quantity = 10, unitPrice = 12) {
  return {
    productId,
    description: 'Purchasing test line',
    quantity,
    unitPrice,
  };
}

export async function withPurchasingPartyRoutingAsync<T>(
  enabled: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = process.env.PURCHASING_PARTY_ROUTING_ENABLED;
  process.env.PURCHASING_PARTY_ROUTING_ENABLED = enabled ? 'true' : 'false';
  resetAppConfigCache();
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.PURCHASING_PARTY_ROUTING_ENABLED;
    } else {
      process.env.PURCHASING_PARTY_ROUTING_ENABLED = previous;
    }
    resetAppConfigCache();
  }
}

export async function withUniversalFinancePilotAsync<T>(
  enabled: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = process.env.UNIVERSAL_FINANCE_PILOT_ENABLED;
  process.env.UNIVERSAL_FINANCE_PILOT_ENABLED = enabled ? 'true' : 'false';
  resetAppConfigCache();
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.UNIVERSAL_FINANCE_PILOT_ENABLED;
    } else {
      process.env.UNIVERSAL_FINANCE_PILOT_ENABLED = previous;
    }
    resetAppConfigCache();
  }
}
