import type { INestApplication } from '@nestjs/common';
import {
  PartyRoleType,
  PartyType,
} from '../../../packages/database/generated/server';
import { PrismaService } from '../src/database/prisma.service';
import { PartiesService } from '../src/modules/parties/parties.service';
import { PartyRolesService } from '../src/modules/parties/party-roles.service';
import { loginAdmin, request, resetDemoTenant } from './test-app';

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

export async function prepareConstructionTestSuite(app: INestApplication) {
  await resetDemoTenant(app);
  const prisma = app.get(PrismaService);
  const ctx = await loadConstructionTestContext(app);
  return { ctx, prisma };
}

export async function restoreDemoTenantLicense(app: INestApplication): Promise<void> {
  await resetDemoTenant(app);
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
  return ['construction.foundation'];
}

export function featuresWithContractsOnly() {
  return ['construction.foundation', 'construction.contracts'];
}
