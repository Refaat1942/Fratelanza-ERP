import type { INestApplication } from '@nestjs/common';
import {
  PartyRoleType,
  PartyType,
} from '../../../packages/database/generated/server';
import type { PrismaService } from '../src/database/prisma.service';
import type { LicenseService } from '../src/modules/license/license.service';
import { PartiesService } from '../src/modules/parties/parties.service';
import { PartyRolesService } from '../src/modules/parties/party-roles.service';
import { DEMO_ENABLED_FEATURES } from '../src/modules/license/catalog/feature-catalog';
import { DEMO_ENABLED_MODULES } from '../src/modules/license/catalog/module-catalog';
import { defaultModuleEntries } from '../src/modules/license/verification/license-verifier.interface';
import { signTestActivationForTenant } from './license-test.helpers';
import { loginAdmin, request } from './test-app';

export interface ConstructionTestContext {
  tenantId: string;
  branchId: string;
  accessToken: string;
}

export async function loadConstructionTestContext(
  app: INestApplication,
): Promise<ConstructionTestContext> {
  const auth = await loginAdmin(app);
  return {
    tenantId: auth.user.tenantId,
    branchId: auth.user.branchId ?? '',
    accessToken: auth.accessToken,
  };
}

export function modulesWithConstruction() {
  return [...DEMO_ENABLED_MODULES, 'construction'];
}

export function featuresWithConstruction() {
  return [
    ...DEMO_ENABLED_FEATURES,
    'construction.foundation',
    'construction.contracts',
    'construction.boq',
    'construction.progress',
    'construction.variations',
  ];
}

export async function activateConstructionLicense(
  prisma: Parameters<typeof signTestActivationForTenant>[0],
  tenantId: string,
  licenseService: LicenseService,
) {
  const signed = await signTestActivationForTenant(prisma, tenantId, {
    modules: defaultModuleEntries(modulesWithConstruction(), 'perpetual'),
    features: featuresWithConstruction(),
  });
  await licenseService.activateLicense(tenantId, signed);
}

export async function createUniversalProject(
  app: INestApplication,
  accessToken: string,
  overrides: { name?: string; code?: string } = {},
) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name: overrides.name ?? `Construction Project ${Date.now()}`,
      code: overrides.code,
    });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; code: string; branchId: string | null };
}

export async function enableConstructionProfile(
  app: INestApplication,
  accessToken: string,
  projectId: string,
) {
  const res = await request(app.getHttpServer())
    .post(`/api/v1/construction/projects/${projectId}/profile`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({});
  expect(res.status).toBe(201);
  return res.body.data;
}

export async function createPartyWithRole(
  app: INestApplication,
  tenantId: string,
  adminUserId: string,
  role: PartyRoleType,
  label: string,
) {
  const parties = app.get(PartiesService);
  const partyRoles = app.get(PartyRolesService);
  const party = await parties.create(tenantId, adminUserId, {
    type: PartyType.organization,
    code: `PTY-CNT-${label}-${Date.now()}`,
    displayName: `${label} Party`,
  });
  await partyRoles.assignRole(tenantId, party.id, adminUserId, role);
  return party;
}

export function featuresWithConstructionFoundationOnly() {
  return [...DEMO_ENABLED_FEATURES, 'construction.foundation'];
}

export function featuresWithContractsOnly() {
  return [
    ...DEMO_ENABLED_FEATURES,
    'construction.foundation',
    'construction.contracts',
  ];
}
