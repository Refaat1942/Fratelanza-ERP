import { randomUUID } from 'crypto';
import type { PrismaService } from '../src/database/prisma.service';
import { signLicenseDocument } from '../src/modules/license/verification/ed25519-license-crypto';
import { prepareLicenseActivation } from '../src/modules/license/verification/license-activation.util';
import {
  defaultModuleEntries,
  type LicenseActivationInput,
} from '../src/modules/license/verification/license-verifier.interface';
import { getEditionDefinition } from '../src/modules/license/catalog/edition-catalog';
import { featuresForModules } from '../src/modules/license/catalog/feature-catalog';

export function buildTestActivationInput(
  tenantId: string,
  overrides: Partial<LicenseActivationInput> = {},
): LicenseActivationInput {
  const edition = overrides.edition ?? 'enterprise';
  const editionDef = getEditionDefinition(edition);
  const moduleKeys = overrides.modules?.map((m) => m.key) ??
    editionDef.defaultModules;
  const modules = overrides.modules ?? defaultModuleEntries(moduleKeys, 'perpetual');

  return {
    licenseId: overrides.licenseId ?? randomUUID(),
    licenseKey: overrides.licenseKey ?? `FRZ-TEST-${randomUUID().slice(0, 8).toUpperCase()}`,
    tenantId,
    licenseType: overrides.licenseType ?? 'perpetual',
    edition,
    issuedAt: overrides.issuedAt ?? new Date().toISOString(),
    expiresAt: overrides.expiresAt ?? null,
    graceDays: overrides.graceDays ?? null,
    installationId: overrides.installationId ?? null,
    modules,
    features: overrides.features ?? featuresForModules(moduleKeys),
    maxUsers: overrides.maxUsers ?? editionDef.limits.maxUsers,
    maxBranches: overrides.maxBranches ?? editionDef.limits.maxBranches,
    maxDevices: overrides.maxDevices ?? editionDef.limits.maxDevices,
    maxStorageMb: overrides.maxStorageMb ?? editionDef.limits.maxStorageMb ?? null,
    signature: overrides.signature ?? '',
  };
}

export function signTestActivationInput(
  input: LicenseActivationInput,
  privateKeyPem: string,
  existingLicenseId?: string | null,
): LicenseActivationInput {
  const prepared = prepareLicenseActivation(input.tenantId, input, existingLicenseId);
  return {
    ...input,
    licenseId: prepared.licenseId,
    signature: signLicenseDocument(prepared.document, privateKeyPem),
  };
}

export async function signTestActivationForTenant(
  prisma: Pick<PrismaService, 'tenantLicense'>,
  tenantId: string,
  overrides: Partial<LicenseActivationInput> = {},
): Promise<LicenseActivationInput> {
  const existing = await prisma.tenantLicense.findUnique({ where: { tenantId } });
  const input = buildTestActivationInput(tenantId, {
    ...overrides,
    licenseId: existing?.id ?? overrides.licenseId,
  });
  return signTestActivationInput(input, getTestSigningPrivateKey(), existing?.id);
}

export function getTestSigningPrivateKey(): string {
  const key = process.env.LICENSE_SIGNING_PRIVATE_KEY;
  if (!key) {
    throw new Error('LICENSE_SIGNING_PRIVATE_KEY must be set for licensing tests');
  }
  return key;
}
