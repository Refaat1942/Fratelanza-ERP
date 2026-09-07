import type {
  EntitlementTermTypeKey,
  LicenseModuleDocumentEntry,
  LicenseTypeKey,
  SignedLicenseDocument,
} from './license-document';

/**
 * Development-only verifier. Does NOT provide cryptographic authenticity.
 * Used only when LICENSE_ALLOW_UNSIGNED_DEV=true in local development.
 */
export class DevUnsignedLicenseVerifier {
  verifyDocument(
    _document: SignedLicenseDocument,
    _signatureBase64: string | null | undefined,
  ): { valid: boolean; digest: string; reason?: string } {
    return {
      valid: true,
      digest: 'dev-unsigned',
      reason: 'Development unsigned mode — not valid for production',
    };
  }
}

export interface LicenseActivationInput {
  licenseId: string;
  licenseKey: string;
  tenantId: string;
  licenseType: LicenseTypeKey;
  edition: 'starter' | 'professional' | 'business' | 'enterprise';
  issuedAt: string;
  expiresAt?: string | null;
  graceDays?: number | null;
  installationId?: string | null;
  modules: LicenseModuleDocumentEntry[];
  features?: string[];
  maxUsers?: number;
  maxBranches?: number;
  maxDevices?: number;
  maxStorageMb?: number | null;
  signature: string;
}

export function buildSignedLicenseDocument(
  input: LicenseActivationInput,
  limits: SignedLicenseDocument['limits'],
): SignedLicenseDocument {
  return {
    schemaVersion: 1,
    licenseId: input.licenseId,
    licenseKey: input.licenseKey,
    tenantId: input.tenantId,
    licenseType: input.licenseType,
    edition: input.edition,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt ?? null,
    graceDays: input.graceDays ?? null,
    installationId: input.installationId ?? null,
    limits,
    modules: input.modules,
    features: input.features ?? [],
  };
}

export function defaultModuleEntries(
  moduleKeys: string[],
  termType: EntitlementTermTypeKey = 'perpetual',
  expiresAt: string | null = null,
): LicenseModuleDocumentEntry[] {
  return moduleKeys.map((key) => ({ key, termType, expiresAt }));
}
