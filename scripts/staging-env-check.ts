/** Check env presence without printing secrets */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const keys = [
  'DATABASE_URL',
  'LICENSE_VERIFICATION_PUBLIC_KEY',
  'LICENSE_SIGNING_PRIVATE_KEY',
  'LICENSE_ALLOW_UNSIGNED_DEV',
  'NODE_ENV',
  'FRATELANZA_INSTALLATION_ID',
  'POSTGRES_PASSWORD',
  'PGPASSWORD',
] as const;

for (const key of keys) {
  const val = process.env[key];
  console.log(`${key}: ${val ? `set (len=${val.length})` : 'NOT SET'}`);
}
