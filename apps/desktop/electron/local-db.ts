import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { app } from 'electron';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LocalPrismaClient = any;

let client: LocalPrismaClient | null = null;
let initPromise: Promise<void> | null = null;

export function resolveMonorepoRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export function getLocalDatabasePath(): string {
  const dataDir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'fratelanza-local.db');
}

export async function initLocalDatabase(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const dbPath = getLocalDatabasePath();
    const dbUrl = `file:${dbPath.replace(/\\/g, '/')}`;
    process.env.LOCAL_DATABASE_URL = dbUrl;

    const root = resolveMonorepoRoot();
    const schemaPath = path.join(root, 'packages', 'database', 'prisma', 'schema.local.prisma');
    const generatedPath = path.join(root, 'packages', 'database', 'generated', 'local');

    if (!fs.existsSync(generatedPath)) {
      throw new Error(
        'Local Prisma client not generated. Run `npm run db:generate` from the repo root.',
      );
    }

    execSync(
      `npx prisma db push --schema="${schemaPath}" --skip-generate --accept-data-loss`,
      {
        cwd: path.join(root, 'packages', 'database'),
        env: { ...process.env, LOCAL_DATABASE_URL: dbUrl },
        stdio: 'pipe',
      },
    );

    // Dynamic require keeps Electron bundle from inlining Prisma engine paths.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require(generatedPath) as { PrismaClient: new () => LocalPrismaClient };
    client = new PrismaClient();
    await client.$connect();

    await client.appMeta.upsert({
      where: { key: 'local_db_initialized' },
      update: { value: new Date().toISOString() },
      create: { key: 'local_db_initialized', value: new Date().toISOString() },
    });
  })();

  return initPromise;
}

export function getLocalDb(): LocalPrismaClient {
  if (!client) {
    throw new Error('Local database not initialized');
  }
  return client;
}

export function isLocalDbReady(): boolean {
  return client !== null;
}

export async function disconnectLocalDatabase(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
    initPromise = null;
  }
}
