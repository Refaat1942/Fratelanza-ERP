import type { INestApplication } from '@nestjs/common';
import { PartyRoleType, PartyType } from '../../../packages/database/generated/server';
import { resetAppConfigCache } from '../src/config/app-config';
import { PrismaService } from '../src/database/prisma.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { PartyLegacyAdapterService } from '../src/modules/parties/party-legacy-adapter.service';
import { PartiesService } from '../src/modules/parties/parties.service';
import { PartyRolesService } from '../src/modules/parties/party-roles.service';
import { loginAdmin, request } from './test-app';

export interface SalesTestContext {
  tenantId: string;
  branchId: string;
  adminUserId: string;
  accessToken: string;
  warehouseId: string;
  productId: string;
  unitId: string;
}

export async function loadSalesTestContext(app: INestApplication): Promise<SalesTestContext> {
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
      sku: `S5-${Date.now()}`,
      name: 'Phase 5 Sales Product',
      unitId,
      salePrice: 25,
      costPrice: 10,
      trackInventory: true,
    });
  const productId = productRes.body.data.id;

  const warehouses = await request(app.getHttpServer())
    .get('/api/v1/warehouses')
    .set('Authorization', `Bearer ${auth.accessToken}`);
  const warehouseId = warehouses.body.data[0].id;

  await request(app.getHttpServer())
    .post('/api/v1/inventory/adjust')
    .set('Authorization', `Bearer ${auth.accessToken}`)
    .send({ warehouseId, productId, quantity: 100 });

  return {
    tenantId: auth.user.tenantId,
    branchId: auth.user.branchId ?? '',
    adminUserId: admin!.id,
    accessToken: auth.accessToken,
    warehouseId,
    productId,
    unitId,
  };
}

export async function createLinkedPartyCustomer(
  app: INestApplication,
  ctx: SalesTestContext,
  label: string,
) {
  const parties = app.get(PartiesService);
  const partyRoles = app.get(PartyRolesService);
  const customers = app.get(CustomersService);
  const legacyAdapter = app.get(PartyLegacyAdapterService);

  const party = await parties.create(ctx.tenantId, ctx.adminUserId, {
    type: PartyType.organization,
    code: `PTY-S5-${label}-${Date.now()}`,
    displayName: `${label} Party Co`,
  });
  await partyRoles.assignRole(
    ctx.tenantId,
    party.id,
    ctx.adminUserId,
    PartyRoleType.customer,
  );

  const customer = await customers.create(ctx.tenantId, {
    code: `C-S5-${label}-${Date.now()}`,
    name: `${label} Legacy Customer`,
    branchId: ctx.branchId,
  });

  await legacyAdapter.linkCustomer(
    ctx.tenantId,
    party.id,
    customer.id,
    ctx.adminUserId,
  );

  return { party, customer };
}

export function invoiceLine(productId: string, quantity = 1) {
  return {
    productId,
    description: 'Sales test line',
    quantity,
    unitPrice: 25,
  };
}

export function withPartyLegacyRouting<T>(enabled: boolean, fn: () => T): T {
  const previous = process.env.PARTY_LEGACY_ROUTING_ENABLED;
  process.env.PARTY_LEGACY_ROUTING_ENABLED = enabled ? 'true' : 'false';
  resetAppConfigCache();
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.PARTY_LEGACY_ROUTING_ENABLED;
    } else {
      process.env.PARTY_LEGACY_ROUTING_ENABLED = previous;
    }
    resetAppConfigCache();
  }
}

export async function withPartyLegacyRoutingAsync<T>(
  enabled: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = process.env.PARTY_LEGACY_ROUTING_ENABLED;
  process.env.PARTY_LEGACY_ROUTING_ENABLED = enabled ? 'true' : 'false';
  resetAppConfigCache();
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.PARTY_LEGACY_ROUTING_ENABLED;
    } else {
      process.env.PARTY_LEGACY_ROUTING_ENABLED = previous;
    }
    resetAppConfigCache();
  }
}

export async function withUniversalFinanceSalesPilotAsync<T>(
  enabled: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = process.env.UNIVERSAL_FINANCE_SALES_PILOT_ENABLED;
  process.env.UNIVERSAL_FINANCE_SALES_PILOT_ENABLED = enabled ? 'true' : 'false';
  resetAppConfigCache();
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.UNIVERSAL_FINANCE_SALES_PILOT_ENABLED;
    } else {
      process.env.UNIVERSAL_FINANCE_SALES_PILOT_ENABLED = previous;
    }
    resetAppConfigCache();
  }
}

export async function createDraftSalesInvoice(
  app: INestApplication,
  ctx: SalesTestContext,
  options?: {
    productId?: string;
    quantity?: number;
    unitPrice?: number;
    description?: string;
    useParty?: boolean;
    label?: string;
  },
) {
  const quantity = options?.quantity ?? 2;
  const unitPrice = options?.unitPrice ?? 25;
  const line = {
    productId: options?.productId ?? ctx.productId,
    description: options?.description ?? 'Sales migration test line',
    quantity,
    unitPrice,
  };

  if (options?.useParty) {
    const { party } = await createLinkedPartyCustomer(
      app,
      ctx,
      options.label ?? 'MIG',
    );
    let invoiceId = '';
    await withPartyLegacyRoutingAsync(true, async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/invoices/from-party')
        .set('Authorization', `Bearer ${ctx.accessToken}`)
        .send({
          partyId: party.id,
          branchId: ctx.branchId,
          warehouseId: ctx.warehouseId,
          lines: [line],
        });
      if (res.status !== 201) {
        throw new Error(`Failed to create party invoice: ${JSON.stringify(res.body)}`);
      }
      invoiceId = res.body.data.id;
    });
    return { invoiceId, party };
  }

  const res = await request(app.getHttpServer())
    .post('/api/v1/sales/invoices')
    .set('Authorization', `Bearer ${ctx.accessToken}`)
    .send({
      branchId: ctx.branchId,
      warehouseId: ctx.warehouseId,
      lines: [line],
    });
  if (res.status !== 201) {
    throw new Error(`Failed to create invoice: ${JSON.stringify(res.body)}`);
  }
  return { invoiceId: res.body.data.id as string };
}
