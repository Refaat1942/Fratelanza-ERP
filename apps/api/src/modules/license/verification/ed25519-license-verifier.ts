import { Injectable } from '@nestjs/common';
import { getAppConfig } from '../../../config/app-config';
import type { SignedLicenseDocument } from './license-document';
import {
  verifyLicenseDocumentSignature,
  type LicenseSignatureVerificationResult,
} from './ed25519-license-crypto';

@Injectable()
export class Ed25519LicenseVerifier {
  verifyDocument(
    document: SignedLicenseDocument,
    signatureBase64: string,
  ): LicenseSignatureVerificationResult {
    const publicKeyPem = getAppConfig().license.verificationPublicKey;
    if (!publicKeyPem) {
      return {
        valid: false,
        digest: '',
        reason: 'LICENSE_VERIFICATION_PUBLIC_KEY is not configured',
      };
    }

    return verifyLicenseDocumentSignature(document, signatureBase64, publicKeyPem);
  }
}
