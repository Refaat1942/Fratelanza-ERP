/** @jest-environment node */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../../.env') });

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'phase0-test-jwt-secret-minimum-32-characters';
process.env.SYNC_ENABLED = 'false';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set for integration tests (use fratelanza_eval + .env)');
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl.includes('fratelanza_eval')) {
  throw new Error('Integration tests must use DATABASE_URL targeting fratelanza_eval only');
}
if (dbUrl.includes('fratelanza_erp')) {
  throw new Error('Integration tests must not use protected database fratelanza_erp');
}
