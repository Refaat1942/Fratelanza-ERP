import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/database/prisma.service';

export interface TenantBranchFixture {
  tenantId: string;
  branchAId: string;
  branchBId: string;
  warehouseAId: string;
  warehouseBId: string;
  productId: string;
  customerId: string;
  supplierId: string;
  adminToken: string;
  branchAUserToken: string;
  branchBUserToken: string;
  warehouseAUserToken: string;
}

async function ensureAdminRole(prisma: PrismaService, tenantId: string) {
  let role = await prisma.role.findFirst({ where: { tenantId, code: 'ADMIN' } });
  if (!role) {
    role = await prisma.role.create({
      data: { tenantId, name: 'Administrator', code: 'ADMIN', isSystem: true },
    });
  }

  const permissions = await prisma.permission.findMany();
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }

  return role.id;
}

async function mintAccessToken(
  app: INestApplication,
  userId: string,
): Promise<string> {
  const prisma = app.get(PrismaService);
  const jwt = app.get(JwtService);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { branchAccess: { select: { branchId: true } }, warehouseAccess: { select: { warehouseId: true } } },
  });
  if (!user) throw new Error('User not found for token mint');

  const session = await prisma.session.create({
    data: {
      userId,
      refreshToken: randomUUID(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const allowedBranchIds = user.branchAccess.map((entry) => entry.branchId);
  if (user.branchId && !allowedBranchIds.includes(user.branchId)) {
    allowedBranchIds.push(user.branchId);
  }

  return jwt.sign({
    sub: user.id,
    email: user.email,
    tenantId: user.tenantId,
    branchId: user.branchId ?? undefined,
    allowedBranchIds,
    allowedWarehouseIds: user.warehouseAccess.map((entry) => entry.warehouseId),
    sessionId: session.id,
    type: 'access',
    isPlatformAdmin: user.isPlatformAdmin,
  });
}

export async function createTenantWithTwoBranches(
  app: INestApplication,
  label: string,
  country: 'EG' | 'SA',
): Promise<TenantBranchFixture> {
  const prisma = app.get(PrismaService);
  const password = process.env.DEMO_SEED_PASSWORD ?? 'Eval@2026!Demo';
  const passwordHash = await bcrypt.hash(password, 12);
  const suffix = `${label}-${Date.now()}`;

  const tenant = await prisma.tenant.create({
    data: {
      code: `ISO-${suffix}`,
      name: `Isolation Tenant ${label}`,
      country,
      currency: country === 'EG' ? 'EGP' : 'SAR',
      language: 'ar',
      settings: { timezone: country === 'EG' ? 'Africa/Cairo' : 'Asia/Riyadh' },
    },
  });

  const branchA = await prisma.branch.create({
    data: { tenantId: tenant.id, code: 'BR-A', name: `${label} Branch A`, isDefault: true },
  });
  const branchB = await prisma.branch.create({
    data: { tenantId: tenant.id, code: 'BR-B', name: `${label} Branch B` },
  });

  const warehouseA = await prisma.warehouse.create({
    data: { tenantId: tenant.id, branchId: branchA.id, code: 'WH-A', name: 'Warehouse A' },
  });
  const warehouseB = await prisma.warehouse.create({
    data: { tenantId: tenant.id, branchId: branchB.id, code: 'WH-B', name: 'Warehouse B' },
  });

  const unit = await prisma.unitOfMeasure.create({
    data: { tenantId: tenant.id, code: `U-${suffix}`, name: 'Unit', symbol: 'u' },
  });
  const product = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      sku: `SKU-${suffix}`,
      name: `Product ${label}`,
      unitId: unit.id,
      salePrice: 100,
      costPrice: 50,
      trackInventory: true,
    },
  });

  const customer = await prisma.customer.create({
    data: { tenantId: tenant.id, branchId: branchA.id, code: `C-${suffix}`, name: `Customer ${label}` },
  });
  const supplier = await prisma.supplier.create({
    data: { tenantId: tenant.id, code: `S-${suffix}`, name: `Supplier ${label}` },
  });

  const roleId = await ensureAdminRole(prisma, tenant.id);

  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      roleId,
      email: `admin-${suffix}@isolation.local`,
      passwordHash,
      firstName: 'Admin',
      lastName: label,
    },
  });

  const branchAUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      roleId,
      branchId: branchA.id,
      email: `branch-a-${suffix}@isolation.local`,
      passwordHash,
      firstName: 'BranchA',
      lastName: label,
    },
  });

  const branchBUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      roleId,
      branchId: branchB.id,
      email: `branch-b-${suffix}@isolation.local`,
      passwordHash,
      firstName: 'BranchB',
      lastName: label,
    },
  });

  const warehouseAUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      roleId,
      branchId: branchA.id,
      email: `wh-a-${suffix}@isolation.local`,
      passwordHash,
      firstName: 'WarehouseA',
      lastName: label,
    },
  });

  await prisma.userWarehouseAccess.create({
    data: { userId: warehouseAUser.id, warehouseId: warehouseA.id },
  });

  async function login(userId: string) {
    return mintAccessToken(app, userId);
  }

  return {
    tenantId: tenant.id,
    branchAId: branchA.id,
    branchBId: branchB.id,
    warehouseAId: warehouseA.id,
    warehouseBId: warehouseB.id,
    productId: product.id,
    customerId: customer.id,
    supplierId: supplier.id,
    adminToken: await login(admin.id),
    branchAUserToken: await login(branchAUser.id),
    branchBUserToken: await login(branchBUser.id),
    warehouseAUserToken: await login(warehouseAUser.id),
  };
}
