/** Databases that must NEVER receive seed/migrate/reset from automation. */
const FORBIDDEN_DATABASES = ['fratelanza_erp'] as const;

/** Databases allowed for demo/evaluation/G-ERP SaaS seeding. */
const ALLOWED_SEED_DATABASES = ['fratelanza_eval', 'fratelanza_g_erp_prod'] as const;

export function extractDatabaseName(databaseUrl: string): string | null {
  const match = databaseUrl.match(/\/([^/?]+)(?:\?|$)/);
  return match?.[1] ?? null;
}

export function assertSeedableDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl) {
    throw new Error('Refusing to seed: DATABASE_URL is not set.');
  }

  const dbName = extractDatabaseName(databaseUrl);
  if (!dbName) {
    throw new Error('Refusing to seed: could not parse database name from DATABASE_URL.');
  }

  if ((FORBIDDEN_DATABASES as readonly string[]).includes(dbName)) {
    throw new Error(
      `Refusing to seed: database "${dbName}" is protected and must never be modified.`,
    );
  }

  if (!(ALLOWED_SEED_DATABASES as readonly string[]).includes(dbName)) {
    throw new Error(
      `Refusing to seed: database "${dbName}" is not allowed. Use one of: ${ALLOWED_SEED_DATABASES.join(', ')}.`,
    );
  }
}

export function assertMigrationSafe(): void {
  assertSeedableDatabase();
}
