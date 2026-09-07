import { createHash } from 'crypto';

export const LICENSE_SCHEMA_VERSION = 1;

export type LicenseTypeKey = 'perpetual' | 'time_limited';
export type EntitlementTermTypeKey = 'perpetual' | 'time_limited';

export interface LicenseModuleDocumentEntry {
  key: string;
  termType: EntitlementTermTypeKey;
  expiresAt: string | null;
}

export interface SignedLicenseDocument {
  schemaVersion: number;
  licenseId: string;
  licenseKey: string;
  tenantId: string;
  licenseType: LicenseTypeKey;
  edition: string;
  issuedAt: string;
  expiresAt: string | null;
  graceDays: number | null;
  installationId: string | null;
  limits: {
    maxUsers: number;
    maxBranches: number;
    maxDevices: number;
    maxStorageMb: number | null;
  };
  modules: LicenseModuleDocumentEntry[];
  features: string[];
}

export function canonicalizeLicenseDocument(document: SignedLicenseDocument): string {
  const normalized: SignedLicenseDocument = {
    schemaVersion: document.schemaVersion,
    licenseId: document.licenseId,
    licenseKey: document.licenseKey,
    tenantId: document.tenantId,
    licenseType: document.licenseType,
    edition: document.edition,
    issuedAt: document.issuedAt,
    expiresAt: document.expiresAt,
    graceDays: document.graceDays,
    installationId: document.installationId,
    limits: {
      maxUsers: document.limits.maxUsers,
      maxBranches: document.limits.maxBranches,
      maxDevices: document.limits.maxDevices,
      maxStorageMb: document.limits.maxStorageMb,
    },
    modules: [...document.modules]
      .map((m) => ({
        key: m.key,
        termType: m.termType,
        expiresAt: m.expiresAt,
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    features: [...document.features].sort(),
  };

  return JSON.stringify(normalized);
}

export function digestLicenseDocument(document: SignedLicenseDocument): string {
  return createHash('sha256').update(canonicalizeLicenseDocument(document)).digest('hex');
}

export function validateLicenseTypeSemantics(
  licenseType: LicenseTypeKey,
  expiresAt: Date | null,
  graceEndsAt: Date | null,
): string | null {
  if (licenseType === 'perpetual') {
    if (expiresAt != null) {
      return 'PERPETUAL licenses must not define expiresAt';
    }
    if (graceEndsAt != null) {
      return 'PERPETUAL licenses must not define graceEndsAt';
    }
    return null;
  }

  if (expiresAt == null) {
    return 'TIME_LIMITED licenses require expiresAt';
  }
  return null;
}

export function validateModuleTermSemantics(
  termType: EntitlementTermTypeKey,
  expiresAt: Date | null,
): string | null {
  if (termType === 'perpetual' && expiresAt != null) {
    return `Module with perpetual term must not define expiresAt`;
  }
  if (termType === 'time_limited' && expiresAt == null) {
    return `Module with time_limited term requires expiresAt`;
  }
  return null;
}
