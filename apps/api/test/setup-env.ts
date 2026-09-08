/** @jest-environment node */
import { config } from 'dotenv';
import { resolve } from 'path';
import { generateEd25519KeyPair } from '../src/modules/license/verification/ed25519-license-crypto';

config({ path: resolve(__dirname, '../../../.env') });

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'phase0-test-jwt-secret-minimum-32-characters';
process.env.SYNC_ENABLED = 'false';

// Always use a matched in-process Ed25519 pair for integration tests so
// seedDemoLicense signatures verify consistently (avoids .env key-pair drift).
const keys = generateEd25519KeyPair();
process.env.LICENSE_VERIFICATION_PUBLIC_KEY = keys.publicKeyPem;
process.env.LICENSE_SIGNING_PRIVATE_KEY = keys.privateKeyPem;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set for integration tests (use docker postgres + .env)');
}
