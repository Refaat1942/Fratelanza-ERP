import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { buildPermissionKey } from '@fratelanza/shared';
import { PrismaService } from '../src/database/prisma.service';

type PermissionDef = { module: string; feature: string; action: string };

export async function createRoleWithPermissions(
  app: INestApplication,
  tenantId: string,
  code: string,
  permissionDefs: PermissionDef[],
): Promise<string> {
  const prisma = app.get(PrismaService);
  const role = await prisma.role.create({
    data: {
      tenantId,
      code,
      name: code,
      isSystem: false,
    },
  });

  const permissions = await prisma.permission.findMany({
    where: {
      OR: permissionDefs.map((p) => ({
        module: p.module,
        feature: p.feature,
        action: p.action,
      })),
    },
  });

  for (const permission of permissions) {
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });
  }

  return role.id;
}

export async function mintUserToken(
  app: INestApplication,
  userId: string,
): Promise<string> {
  const prisma = app.get(PrismaService);
  const jwt = app.get(JwtService);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      branchAccess: { select: { branchId: true } },
      warehouseAccess: { select: { warehouseId: true } },
    },
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

export async function createTenantUserWithRole(
  app: INestApplication,
  tenantId: string,
  roleId: string,
  emailSuffix: string,
): Promise<{ userId: string; token: string }> {
  const prisma = app.get(PrismaService);
  const passwordHash = await bcrypt.hash(process.env.DEMO_SEED_PASSWORD ?? 'Eval@2026!Demo', 12);
  const user = await prisma.user.create({
    data: {
      tenantId,
      roleId,
      email: `${emailSuffix}-${Date.now()}@isolation.local`,
      passwordHash,
      firstName: 'Test',
      lastName: emailSuffix,
    },
  });
  return { userId: user.id, token: await mintUserToken(app, user.id) };
}

export function perm(module: string, feature: string, action: string): PermissionDef {
  return { module, feature, action };
}

export function permKey(def: PermissionDef): string {
  return buildPermissionKey(def.module, def.feature, def.action);
}
