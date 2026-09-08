import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { bootstrapAppConfig } from '../src/config/app-config';
import { PrismaService } from '../src/database/prisma.service';
import { FinanceSetupService } from '../src/modules/finance/finance-setup.service';
import { LicenseService } from '../src/modules/license/license.service';
import request from './http-client';

export { request };

const DEMO_TENANT_CODE = 'FRATELANZA';

async function getDemoTenant(prisma: PrismaService) {
  return prisma.tenant.findUnique({ where: { code: DEMO_TENANT_CODE } });
}

async function minNextDocumentNumber(
  prisma: PrismaService,
  tenantId: string,
  prefix: string,
  fiscalYear: number,
  fallback = 1,
): Promise<number> {
  const matchers: Array<Promise<string | null>> = [];

  if (prefix === 'INV') {
    matchers.push(
      prisma.salesInvoice
        .findFirst({
          where: { tenantId, number: { startsWith: `${prefix}-${fiscalYear}-` } },
          orderBy: { number: 'desc' },
          select: { number: true },
        })
        .then((row) => row?.number ?? null),
    );
  }
  if (prefix === 'PO') {
    matchers.push(
      prisma.purchaseOrder
        .findFirst({
          where: { tenantId, number: { startsWith: `${prefix}-${fiscalYear}-` } },
          orderBy: { number: 'desc' },
          select: { number: true },
        })
        .then((row) => row?.number ?? null),
    );
  }
  if (prefix === 'JE') {
    matchers.push(
      prisma.journalEntry
        .findFirst({
          where: { tenantId, number: { startsWith: `${prefix}-${fiscalYear}-` } },
          orderBy: { number: 'desc' },
          select: { number: true },
        })
        .then((row) => row?.number ?? null),
    );
  }
  if (prefix === 'BLG') {
    matchers.push(
      prisma.constructionBilling
        .findFirst({
          where: { tenantId, number: { startsWith: `${prefix}-${fiscalYear}-` } },
          orderBy: { number: 'desc' },
          select: { number: true },
        })
        .then((row) => row?.number ?? null),
    );
  }
  if (prefix === 'PRG') {
    matchers.push(
      prisma.constructionProgress
        .findFirst({
          where: { tenantId, number: { startsWith: `${prefix}-${fiscalYear}-` } },
          orderBy: { number: 'desc' },
          select: { number: true },
        })
        .then((row) => row?.number ?? null),
    );
  }
  if (prefix === 'VAR') {
    matchers.push(
      prisma.constructionVariation
        .findFirst({
          where: { tenantId, number: { startsWith: `${prefix}-${fiscalYear}-` } },
          orderBy: { number: 'desc' },
          select: { number: true },
        })
        .then((row) => row?.number ?? null),
    );
  }
  if (prefix === 'MIS') {
    matchers.push(
      prisma.constructionMaterialIssue
        .findFirst({
          where: { tenantId, number: { startsWith: `${prefix}-${fiscalYear}-` } },
          orderBy: { number: 'desc' },
          select: { number: true },
        })
        .then((row) => row?.number ?? null),
    );
  }
  if (prefix === 'CNT') {
    matchers.push(
      prisma.constructionContract
        .findFirst({
          where: { tenantId, number: { startsWith: `${prefix}-${fiscalYear}-` } },
          orderBy: { number: 'desc' },
          select: { number: true },
        })
        .then((row) => row?.number ?? null),
    );
  }
  if (prefix === 'BOQ') {
    matchers.push(
      prisma.constructionBoq
        .findFirst({
          where: { tenantId, number: { startsWith: `${prefix}-${fiscalYear}-` } },
          orderBy: { number: 'desc' },
          select: { number: true },
        })
        .then((row) => row?.number ?? null),
    );
  }
  if (prefix === 'PAT') {
    matchers.push(
      prisma.patient
        .findFirst({
          where: { tenantId, code: { startsWith: `${prefix}-${fiscalYear}-` } },
          orderBy: { code: 'desc' },
          select: { code: true },
        })
        .then((row) => row?.code ?? null),
    );
  }
  if (prefix === 'PRJ') {
    matchers.push(
      prisma.project
        .findFirst({
          where: { tenantId, code: { startsWith: `${prefix}-${fiscalYear}-` } },
          orderBy: { code: 'desc' },
          select: { code: true },
        })
        .then((row) => row?.code ?? null),
    );
  }
  const numbers = (await Promise.all(matchers)).filter(Boolean) as string[];
  if (numbers.length === 0) {
    return fallback;
  }

  const maxUsed = numbers.reduce((max, number) => {
    const match = number.match(new RegExp(`^${prefix}-${fiscalYear}-(\\d+)$`));
    if (!match) {
      return max;
    }
    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isFinite(parsed) || parsed > 10_000_000) {
      return max;
    }
    return Math.max(max, parsed);
  }, 0);

  return maxUsed > 0 ? maxUsed + 1 : fallback;
}

async function ensureDocumentSequences(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const tenant = await getDemoTenant(prisma);
  if (!tenant) return;

  const branch = await prisma.branch.findFirst({
    where: { tenantId: tenant.id, isDefault: true },
  });
  if (!branch) return;

  const fiscalYear = new Date().getFullYear();

  const sequences = [
    { documentType: 'INV', prefix: 'INV', minNextNumber: await minNextDocumentNumber(prisma, tenant.id, 'INV', fiscalYear, 2) },
    { documentType: 'PO', prefix: 'PO', minNextNumber: await minNextDocumentNumber(prisma, tenant.id, 'PO', fiscalYear, 2) },
    { documentType: 'RCP', prefix: 'RCP', minNextNumber: 1 },
    { documentType: 'JE', prefix: 'JE', minNextNumber: await minNextDocumentNumber(prisma, tenant.id, 'JE', fiscalYear, 1) },
    { documentType: 'PAT', prefix: 'PAT', minNextNumber: await minNextDocumentNumber(prisma, tenant.id, 'PAT', fiscalYear, 2) },
    { documentType: 'ENC', prefix: 'ENC', minNextNumber: 1 },
    { documentType: 'CHG', prefix: 'CHG', minNextNumber: 1 },
    { documentType: 'PMT', prefix: 'PMT', minNextNumber: 1 },
    { documentType: 'REF', prefix: 'REF', minNextNumber: 1 },
    { documentType: 'ADJ', prefix: 'ADJ', minNextNumber: 1 },
    { documentType: 'PTY', prefix: 'PTY', minNextNumber: 1 },
    { documentType: 'PRJ', prefix: 'PRJ', minNextNumber: await minNextDocumentNumber(prisma, tenant.id, 'PRJ', fiscalYear, 1) },
    { documentType: 'BLG', prefix: 'BLG', minNextNumber: await minNextDocumentNumber(prisma, tenant.id, 'BLG', fiscalYear, 1) },
    { documentType: 'PRG', prefix: 'PRG', minNextNumber: await minNextDocumentNumber(prisma, tenant.id, 'PRG', fiscalYear, 1) },
    { documentType: 'VAR', prefix: 'VAR', minNextNumber: await minNextDocumentNumber(prisma, tenant.id, 'VAR', fiscalYear, 1) },
    { documentType: 'MIS', prefix: 'MIS', minNextNumber: await minNextDocumentNumber(prisma, tenant.id, 'MIS', fiscalYear, 1) },
    { documentType: 'CNT', prefix: 'CNT', minNextNumber: await minNextDocumentNumber(prisma, tenant.id, 'CNT', fiscalYear, 1) },
    { documentType: 'BOQ', prefix: 'BOQ', minNextNumber: await minNextDocumentNumber(prisma, tenant.id, 'BOQ', fiscalYear, 1) },
  ];

  for (const seq of sequences) {
    const existing = await prisma.numberSequence.findUnique({
      where: {
        tenantId_branchId_documentType_fiscalYear: {
          tenantId: tenant.id,
          branchId: branch.id,
          documentType: seq.documentType,
          fiscalYear,
        },
      },
    });

    await prisma.numberSequence.upsert({
      where: {
        tenantId_branchId_documentType_fiscalYear: {
          tenantId: tenant.id,
          branchId: branch.id,
          documentType: seq.documentType,
          fiscalYear,
        },
      },
      update: {
        nextNumber: Math.max(existing?.nextNumber ?? 0, seq.minNextNumber),
      },
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        documentType: seq.documentType,
        prefix: seq.prefix,
        fiscalYear,
        nextNumber: seq.minNextNumber,
        padding: 6,
      },
    });
  }
}

async function ensureFinancePermissions(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const tenant = await getDemoTenant(prisma);
  if (!tenant) return;

  const financePermissions = [
    { module: 'finance', feature: 'coa', action: 'read' },
    { module: 'finance', feature: 'coa', action: 'manage' },
    { module: 'finance', feature: 'periods', action: 'read' },
    { module: 'finance', feature: 'periods', action: 'manage' },
    { module: 'finance', feature: 'posting', action: 'read' },
    { module: 'finance', feature: 'posting', action: 'execute' },
    { module: 'finance', feature: 'journals', action: 'read' },
    { module: 'finance', feature: 'setup', action: 'seed' },
  ];

  for (const perm of financePermissions) {
    const permission = await prisma.permission.upsert({
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

    const ownerRole = await prisma.role.findFirst({
      where: { tenantId: tenant.id, code: 'owner' },
    });
    if (ownerRole) {
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
  }
}

async function ensureFinanceFoundation(app: INestApplication): Promise<void> {
  await ensureFinancePermissions(app);
  const financeSetup = app.get(FinanceSetupService);
  const prisma = app.get(PrismaService);
  const tenant = await getDemoTenant(prisma);
  if (!tenant) return;
  await financeSetup.seedTenantFinanceFoundation(tenant.id);
}

async function ensureLicense(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const tenant = await getDemoTenant(prisma);
  if (!tenant) return;

  const licenseService = app.get(LicenseService);
  await licenseService.seedDemoLicense(tenant.id);
}

async function ensureLicensePermissions(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const tenant = await getDemoTenant(prisma);
  if (!tenant) return;

  const licensePermissions = [
    { module: 'core', feature: 'license', action: 'read' },
    { module: 'core', feature: 'license', action: 'manage' },
  ];

  for (const perm of licensePermissions) {
    const permission = await prisma.permission.upsert({
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

    const ownerRole = await prisma.role.findFirst({
      where: { tenantId: tenant.id, code: 'owner' },
    });
    if (ownerRole) {
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
  }
}

export async function resetDemoTenant(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const licenseService = app.get(LicenseService);
  const tenant = await getDemoTenant(prisma);
  if (!tenant) return;
  await licenseService.seedDemoLicense(tenant.id);
  await ensureDocumentSequences(app);
}

export async function createTestApp(): Promise<INestApplication> {
  bootstrapAppConfig();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  await ensureDocumentSequences(app);
  await ensureFinanceFoundation(app);
  await ensurePartyPermissions(app);
  await ensureProjectsPermissions(app);
  await ensureConstructionPermissions(app);
  await ensureLicensePermissions(app);
  await ensureLicense(app);
  return app;
}

async function ensurePartyPermissions(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const tenant = await getDemoTenant(prisma);
  if (!tenant) return;

  const partyPermissions = [
    { module: 'parties', feature: 'parties', action: 'read' },
    { module: 'parties', feature: 'parties', action: 'create' },
    { module: 'parties', feature: 'parties', action: 'update' },
    { module: 'parties', feature: 'parties', action: 'archive' },
    { module: 'parties', feature: 'roles', action: 'manage' },
    { module: 'parties', feature: 'contacts', action: 'read' },
    { module: 'parties', feature: 'contacts', action: 'manage' },
    { module: 'parties', feature: 'legacy-links', action: 'read' },
    { module: 'parties', feature: 'legacy-links', action: 'manage' },
  ];

  for (const perm of partyPermissions) {
    const permission = await prisma.permission.upsert({
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

    const ownerRole = await prisma.role.findFirst({
      where: { tenantId: tenant.id, code: 'owner' },
    });
    if (ownerRole) {
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
  }
}

async function ensureProjectsPermissions(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const tenant = await getDemoTenant(prisma);
  if (!tenant) return;

  const projectsPermissions = [
    { module: 'projects', feature: 'projects', action: 'read' },
    { module: 'projects', feature: 'projects', action: 'create' },
    { module: 'projects', feature: 'projects', action: 'update' },
    { module: 'projects', feature: 'projects', action: 'archive' },
    { module: 'projects', feature: 'cost-centers', action: 'read' },
    { module: 'projects', feature: 'cost-centers', action: 'manage' },
  ];

  for (const perm of projectsPermissions) {
    const permission = await prisma.permission.upsert({
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

    const ownerRole = await prisma.role.findFirst({
      where: { tenantId: tenant.id, code: 'owner' },
    });
    if (ownerRole) {
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
  }
}

async function ensureConstructionPermissions(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const tenant = await getDemoTenant(prisma);
  if (!tenant) return;

  const constructionPermissions = [
    { module: 'construction', feature: 'foundation', action: 'read' },
    { module: 'construction', feature: 'foundation', action: 'manage' },
    { module: 'construction', feature: 'contracts', action: 'read' },
    { module: 'construction', feature: 'contracts', action: 'manage' },
    { module: 'construction', feature: 'boq', action: 'read' },
    { module: 'construction', feature: 'boq', action: 'manage' },
    { module: 'construction', feature: 'boq', action: 'approve' },
    { module: 'construction', feature: 'progress', action: 'read' },
    { module: 'construction', feature: 'progress', action: 'manage' },
    { module: 'construction', feature: 'progress', action: 'submit' },
    { module: 'construction', feature: 'progress', action: 'approve' },
    { module: 'construction', feature: 'variations', action: 'read' },
    { module: 'construction', feature: 'variations', action: 'manage' },
    { module: 'construction', feature: 'variations', action: 'approve' },
    { module: 'construction', feature: 'retention', action: 'read' },
    { module: 'construction', feature: 'retention', action: 'manage' },
    { module: 'construction', feature: 'retention', action: 'release' },
    { module: 'construction', feature: 'subcontractors', action: 'read' },
    { module: 'construction', feature: 'subcontractors', action: 'manage' },
    { module: 'construction', feature: 'materials', action: 'read' },
    { module: 'construction', feature: 'materials', action: 'issue' },
    { module: 'construction', feature: 'costing', action: 'read' },
    { module: 'construction', feature: 'billing', action: 'read' },
    { module: 'construction', feature: 'billing', action: 'create' },
    { module: 'construction', feature: 'billing', action: 'manage' },
    { module: 'construction', feature: 'reports', action: 'read' },
  ];

  for (const perm of constructionPermissions) {
    const permission = await prisma.permission.upsert({
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

    const ownerRole = await prisma.role.findFirst({
      where: { tenantId: tenant.id, code: 'owner' },
    });
    if (ownerRole) {
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
  }
}

export async function loginAdmin(app: INestApplication) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({
      email: 'admin@fratelanza.local',
      password: 'Admin@123456',
    });

  expect(response.status).toBe(200);
  return response.body.data as {
    accessToken: string;
    refreshToken: string;
    user: { tenantId: string; branchId?: string };
  };
}
