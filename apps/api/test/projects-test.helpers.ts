import type { INestApplication } from '@nestjs/common';
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
