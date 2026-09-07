import type { INestApplication } from '@nestjs/common';
import { DEMO_ENABLED_FEATURES } from '../src/modules/license/catalog/feature-catalog';
import { DEMO_ENABLED_MODULES } from '../src/modules/license/catalog/module-catalog';
import { defaultModuleEntries } from '../src/modules/license/verification/license-verifier.interface';
import { signTestActivationForTenant } from './license-test.helpers';
import { loginAdmin, request } from './test-app';

export interface ProjectsTestContext {
  tenantId: string;
  branchId: string;
  accessToken: string;
}

export async function loadProjectsTestContext(
  app: INestApplication,
): Promise<ProjectsTestContext> {
  const auth = await loginAdmin(app);
  return {
    tenantId: auth.user.tenantId,
    branchId: auth.user.branchId ?? '',
    accessToken: auth.accessToken,
  };
}

export function modulesWithoutProjects() {
  return DEMO_ENABLED_MODULES.filter((m) => m !== 'projects');
}

export function featuresWithoutProjects() {
  return DEMO_ENABLED_FEATURES.filter((f) => !f.startsWith('projects.'));
}

export async function activateLicenseWithoutProjects(
  prisma: Parameters<typeof signTestActivationForTenant>[0],
  tenantId: string,
  licenseService: { activateLicense: (tenantId: string, signed: unknown) => Promise<unknown> },
) {
  const signed = await signTestActivationForTenant(prisma, tenantId, {
    modules: defaultModuleEntries(modulesWithoutProjects(), 'perpetual'),
    features: featuresWithoutProjects(),
  });
  await licenseService.activateLicense(tenantId, signed);
}
