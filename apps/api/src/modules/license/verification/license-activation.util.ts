import { getEditionDefinition } from '../catalog/edition-catalog';
import { featuresForModules } from '../catalog/feature-catalog';
import { validateModuleDependencies } from '../catalog/module-catalog';
import {
  buildSignedLicenseDocument,
  type LicenseActivationInput,
} from './license-verifier.interface';
import {
  validateLicenseTypeSemantics,
  validateModuleTermSemantics,
  type LicenseModuleDocumentEntry,
  type SignedLicenseDocument,
} from './license-document';
export interface PreparedLicenseActivation {
  document: SignedLicenseDocument;
  modules: LicenseModuleDocumentEntry[];
  features: string[];
  limits: SignedLicenseDocument['limits'];
  expiresAt: Date | null;
  graceEndsAt: Date | null;
  licenseId: string;
}

export function prepareLicenseActivation(
  tenantId: string,
  input: LicenseActivationInput,
  existingLicenseId?: string | null,
): PreparedLicenseActivation {
  if (input.tenantId !== tenantId) {
    throw new Error('License tenant binding does not match activating tenant');
  }

  const edition = getEditionDefinition(input.edition);
  const moduleSet = new Set(input.modules.map((m) => m.key));
  moduleSet.add('core');

  const depErrors = validateModuleDependencies(moduleSet);
  if (depErrors.length > 0) {
    throw new Error(depErrors.join('; '));
  }

  for (const module of input.modules) {
    const moduleError = validateModuleTermSemantics(
      module.termType,
      module.expiresAt ? new Date(module.expiresAt) : null,
    );
    if (moduleError) {
      throw new Error(moduleError);
    }
  }

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  const graceDays =
    input.graceDays ?? (input.licenseType === 'time_limited' ? 30 : null);
  const graceEndsAt =
    input.licenseType === 'time_limited' &&
    expiresAt != null &&
    graceDays != null &&
    graceDays > 0
      ? new Date(expiresAt.getTime() + graceDays * 24 * 60 * 60 * 1000)
      : null;

  const typeError = validateLicenseTypeSemantics(
    input.licenseType,
    expiresAt,
    graceEndsAt,
  );
  if (typeError) {
    throw new Error(typeError);
  }

  const limits = {
    maxUsers: input.maxUsers ?? edition.limits.maxUsers,
    maxBranches: input.maxBranches ?? edition.limits.maxBranches,
    maxDevices: input.maxDevices ?? edition.limits.maxDevices,
    maxStorageMb: input.maxStorageMb ?? edition.limits.maxStorageMb ?? null,
  };

  const modules = [...moduleSet].map((key) => {
    const provided = input.modules.find((m) => m.key === key);
    return provided ?? { key, termType: 'perpetual' as const, expiresAt: null };
  });

  const features =
    input.features && input.features.length > 0
      ? [...input.features].sort()
      : featuresForModules(modules.map((m) => m.key));

  const licenseId = existingLicenseId ?? input.licenseId;
  const document = buildSignedLicenseDocument({ ...input, licenseId }, limits);
  document.modules = modules;
  document.features = features;

  return {
    document,
    modules,
    features,
    limits,
    expiresAt,
    graceEndsAt,
    licenseId,
  };
}

export type { LicenseActivationInput };
