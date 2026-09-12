/**
 * Staging verification: compare row counts and run restore DB checks.
 * Usage: npx dotenv -e .env -- npx tsx scripts/staging-restore-verify.ts
 */
import { execSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '../packages/database/generated/server/index.js';

const PG_BIN = process.env.PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin';
const SOURCE_DB = process.env.STAGING_SOURCE_DB ?? 'fratelanza_erp';
const RESTORE_DB = process.env.STAGING_RESTORE_DB ?? 'fratelanza_erp_restore';

function pg(cmd: string) {
  execSync(cmd, { stdio: 'inherit', env: process.env });
}

function parseDatabaseUrl(url: string) {
  const m = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
  if (!m) throw new Error('Invalid DATABASE_URL');
  return {
    user: m[1],
    password: m[2],
    host: m[3],
    port: m[4] ?? '5432',
    database: m[5],
  };
}

async function countSnapshot(dbUrl: string) {
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const [
      tenants,
      users,
      parties,
      customers,
      suppliers,
      products,
      stockBalances,
      salesInvoices,
      purchaseOrders,
      journalEntries,
      projects,
      constructionContracts,
      licenses,
      auditLogs,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.user.count(),
      prisma.party.count(),
      prisma.customer.count(),
      prisma.supplier.count(),
      prisma.product.count(),
      prisma.stockBalance.count(),
      prisma.salesInvoice.count(),
      prisma.purchaseOrder.count(),
      prisma.journalEntry.count(),
      prisma.project.count(),
      prisma.constructionContract.count(),
      prisma.tenantLicense.count(),
      prisma.auditLog.count(),
    ]);
    return {
      tenants,
      users,
      parties,
      customers,
      suppliers,
      products,
      stockBalances,
      salesInvoices,
      purchaseOrders,
      journalEntries,
      projects,
      constructionContracts,
      licenses,
      auditLogs,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const sourceUrl = process.env.DATABASE_URL;
  if (!sourceUrl) throw new Error('DATABASE_URL required');

  const parsed = parseDatabaseUrl(sourceUrl);
  process.env.PGPASSWORD = parsed.password;
  const psql = `"${PG_BIN}\\psql.exe"`;
  const pgDump = `"${PG_BIN}\\pg_dump.exe"`;
  const createdb = `"${PG_BIN}\\createdb.exe"`;
  const dropdb = `"${PG_BIN}\\dropdb.exe"`;

  const backupDir = resolve(process.cwd(), 'staging-backups');
  const backupFile = readdirSync(backupDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => resolve(backupDir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];

  if (!backupFile) throw new Error('No backup file found');

  console.log('=== BACKUP ARTIFACT ===');
  const stat = statSync(backupFile);
  console.log(JSON.stringify({
    path: backupFile,
    sizeBytes: stat.size,
    timestamp: stat.mtime.toISOString(),
  }, null, 2));

  console.log('\n=== SOURCE DB COUNTS ===');
  const sourceCounts = await countSnapshot(sourceUrl.replace(parsed.database, SOURCE_DB));
  console.log(JSON.stringify(sourceCounts, null, 2));

  console.log('\n=== RESTORE: drop/create empty database ===');
  try {
    pg(`${dropdb} -h ${parsed.host} -p ${parsed.port} -U ${parsed.user} --if-exists ${RESTORE_DB}`);
  } catch {
    // ignore if missing
  }
  pg(`${createdb} -h ${parsed.host} -p ${parsed.port} -U ${parsed.user} ${RESTORE_DB}`);

  console.log('\n=== RESTORE: load backup ===');
  pg(`${psql} -h ${parsed.host} -p ${parsed.port} -U ${parsed.user} -d ${RESTORE_DB} -f "${backupFile}"`);

  const restoreUrl = sourceUrl.replace(`/${SOURCE_DB}`, `/${RESTORE_DB}`);

  console.log('\n=== RESTORE DB COUNTS ===');
  const restoreCounts = await countSnapshot(restoreUrl);
  console.log(JSON.stringify(restoreCounts, null, 2));

  console.log('\n=== COUNT COMPARISON ===');
  const keys = Object.keys(sourceCounts) as (keyof typeof sourceCounts)[];
  const mismatches: string[] = [];
  for (const key of keys) {
    const match = sourceCounts[key] === restoreCounts[key];
    console.log(`${key}: source=${sourceCounts[key]} restore=${restoreCounts[key]} ${match ? 'OK' : 'MISMATCH'}`);
    if (!match) mismatches.push(key);
  }

  if (mismatches.length > 0) {
    throw new Error(`Restore count mismatches: ${mismatches.join(', ')}`);
  }

  console.log('\n=== RESTORE VERIFICATION: PASS ===');
  console.log(`Restore database name: ${RESTORE_DB}`);
  console.log(`Restore connection URL pattern: postgresql://${parsed.user}:***@${parsed.host}:${parsed.port}/${RESTORE_DB}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
