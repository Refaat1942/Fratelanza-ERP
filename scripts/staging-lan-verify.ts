/**
 * LAN staging verification against running API.
 * Usage: npx dotenv -e .env -- npx tsx scripts/staging-lan-verify.ts [lanIp]
 */
import { PrismaClient } from '../packages/database/generated/server/index.js';

const LAN_IP = process.argv[2] ?? '192.168.10.158';
const API_BASE = `http://${LAN_IP}:3000/api/v1`;

async function request(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const results: Record<string, { status: number; ok: boolean; note?: string }> = {};

  const health = await request('/health');
  results.health = { status: health.status, ok: health.status === 200 };

  const version = await request('/system/version');
  results.version = { status: version.status, ok: version.status === 200 };

  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@fratelanza.local',
      password: 'Admin@123456',
    }),
  });
  results.login = {
    status: login.status,
    ok: login.status === 200 || login.status === 201,
    note: login.status >= 400 ? String(login.body?.error?.message ?? 'login failed') : undefined,
  };

  const token = login.body?.data?.accessToken as string | undefined;
  if (!token) {
    console.log(JSON.stringify({ lanIp: LAN_IP, apiBase: API_BASE, results, blocked: 'no token' }, null, 2));
    process.exit(1);
  }

  const authed = (path: string) =>
    request(path, { headers: { Authorization: `Bearer ${token}` } });

  const checks = [
    ['/dashboard/stats', 'dashboard'],
    ['/parties', 'partiesList'],
    ['/sales/invoices', 'salesList'],
    ['/accounting/trial-balance', 'financeTrialBalance'],
    ['/construction/contracts', 'constructionContracts'],
    ['/audit-logs', 'auditLogs'],
    ['/system/diagnostics', 'diagnostics'],
    ['/license/entitlements', 'entitlements'],
  ] as const;

  for (const [path, key] of checks) {
    const res = await authed(path);
    results[key] = { status: res.status, ok: res.status === 200 };
  }

  console.log(JSON.stringify({ lanIp: LAN_IP, apiBase: API_BASE, results }, null, 2));

  const failed = Object.entries(results).filter(([, v]) => !v.ok);
  if (failed.length > 0) {
    throw new Error(`LAN verification failed: ${failed.map(([k]) => k).join(', ')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
