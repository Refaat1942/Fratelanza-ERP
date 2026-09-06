import { PrismaClient } from '../generated/server';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const CORE_PERMISSIONS = [
  { module: 'core', feature: 'dashboard', action: 'read' },
  { module: 'core', feature: 'tenants', action: 'read' },
  { module: 'core', feature: 'tenants', action: 'create' },
  { module: 'core', feature: 'tenants', action: 'update' },
  { module: 'core', feature: 'branches', action: 'read' },
  { module: 'core', feature: 'branches', action: 'create' },
  { module: 'core', feature: 'branches', action: 'update' },
  { module: 'core', feature: 'users', action: 'read' },
  { module: 'core', feature: 'users', action: 'create' },
  { module: 'core', feature: 'users', action: 'update' },
  { module: 'core', feature: 'users', action: 'delete' },
  { module: 'core', feature: 'roles', action: 'read' },
  { module: 'core', feature: 'roles', action: 'create' },
  { module: 'core', feature: 'roles', action: 'update' },
  { module: 'core', feature: 'devices', action: 'read' },
  { module: 'core', feature: 'devices', action: 'update' },
  { module: 'core', feature: 'settings', action: 'read' },
  { module: 'core', feature: 'settings', action: 'update' },
  { module: 'core', feature: 'audit', action: 'read' },
];

async function main() {
  console.log('Seeding database...');

  for (const perm of CORE_PERMISSIONS) {
    await prisma.permission.upsert({
      where: {
        module_feature_action: {
          module: perm.module,
          feature: perm.feature,
          action: perm.action,
        },
      },
      update: {},
      create: perm,
    });
  }

  const tenant = await prisma.tenant.upsert({
    where: { code: 'FRATELANZA' },
    update: {},
    create: {
      name: 'Fratelanza Demo Company',
      code: 'FRATELANZA',
      settings: {
        defaultLocale: 'en',
        defaultCurrency: 'EGP',
        timezone: 'Africa/Cairo',
        fiscalYearStart: 1,
      },
    },
  });

  const branch = await prisma.branch.upsert({
    where: {
      tenantId_code: { tenantId: tenant.id, code: 'HQ' },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Head Office',
      code: 'HQ',
      isDefault: true,
      address: 'Cairo, Egypt',
    },
  });

  await prisma.warehouse.upsert({
    where: {
      tenantId_code: { tenantId: tenant.id, code: 'WH-HQ' },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      name: 'Main Warehouse',
      code: 'WH-HQ',
    },
  });

  const allPermissions = await prisma.permission.findMany();

  const ownerRole = await prisma.role.upsert({
    where: {
      tenantId_code: { tenantId: tenant.id, code: 'owner' },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Owner',
      code: 'owner',
      description: 'Full system access',
      isSystem: true,
    },
  });

  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: ownerRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: ownerRole.id,
        permissionId: permission.id,
      },
    });
  }

  const passwordHash = await bcrypt.hash('Admin@123456', 12);

  await prisma.user.upsert({
    where: {
      tenantId_email: { tenantId: tenant.id, email: 'admin@fratelanza.local' },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      roleId: ownerRole.id,
      email: 'admin@fratelanza.local',
      passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      locale: 'en',
    },
  });

  await prisma.tenantModule.upsert({
    where: {
      tenantId_moduleId: { tenantId: tenant.id, moduleId: 'core' },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      moduleId: 'core',
      isEnabled: true,
    },
  });

  console.log('Seed completed.');
  console.log('  Tenant: Fratelanza Demo Company (FRATELANZA)');
  console.log('  Admin:  admin@fratelanza.local / Admin@123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
