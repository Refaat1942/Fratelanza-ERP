import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'crypto';
import { normalizePemFromEnv } from '@fratelanza/config';
import type { SignedLicenseDocument } from './license-document';
import { canonicalizeLicenseDocument, digestLicenseDocument } from './license-document';

export interface LicenseSignatureVerificationResult {
  valid: boolean;
  digest: string;
  reason?: string;
}

export function signLicenseDocument(
  document: SignedLicenseDocument,
  privateKeyPem: string,
): string {
  const privateKey = createPrivateKey(normalizePemFromEnv(privateKeyPem) ?? privateKeyPem);
  const payload = Buffer.from(canonicalizeLicenseDocument(document), 'utf8');
  return sign(null, payload, privateKey).toString('base64');
}

export function verifyLicenseDocumentSignature(
  document: SignedLicenseDocument,
  signatureBase64: string,
  publicKeyPem: string,
): LicenseSignatureVerificationResult {
  const digest = digestLicenseDocument(document);
  try {
    const normalizedPublicKey = normalizePemFromEnv(publicKeyPem) ?? publicKeyPem;
    const publicKey = createPublicKey(normalizedPublicKey);
    const payload = Buffer.from(canonicalizeLicenseDocument(document), 'utf8');
    const signature = Buffer.from(signatureBase64, 'base64');
    const valid = verify(null, payload, publicKey, signature);
    return valid
      ? { valid: true, digest }
      : { valid: false, digest, reason: 'License signature verification failed' };
  } catch (error) {
    return {
      valid: false,
      digest,
      reason: error instanceof Error ? error.message : 'Invalid license signature material',
    };
  }
}

export function generateEd25519KeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}
