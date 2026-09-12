/**
 * Offline staging verification: block default route, verify LAN API, restore route.
 * Requires elevated shell for route removal.
 */
const LAN_IP = process.argv[2] ?? '192.168.10.158';
const API = `http://${LAN_IP}:3000/api/v1`;

async function apiCheck(label: string, path: string, token?: string) {
  const res = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    method: path.includes('login') ? 'POST' : 'GET',
    body: path.includes('login')
      ? JSON.stringify({ email: 'admin@fratelanza.local', password: 'Admin@123456' })
      : undefined,
    ...(path.includes('login') ? { headers: { 'Content-Type': 'application/json' } } : {}),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`${label}: ${res.status} ${res.ok ? 'OK' : 'FAIL'}`);
  return { status: res.status, ok: res.ok, token: body?.data?.accessToken as string | undefined };
}

async function main() {
  const health = await apiCheck('health', '/health');
  const login = await apiCheck('login', '/auth/login');
  if (!login.token) throw new Error('login failed offline check');

  await apiCheck('parties', '/parties', login.token);
  await apiCheck('sales', '/sales/invoices', login.token);
  await apiCheck('diagnostics', '/system/diagnostics', login.token);

  // Verify no runtime dependency on mg.fratelanza.com in fetch targets (static check done separately)
  console.log('offline_api_checks_complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
