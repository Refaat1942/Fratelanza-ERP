const LAN_IP = '192.168.10.158';
const API = `http://${LAN_IP}:3000/api/v1`;

async function main() {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@fratelanza.local', password: 'Admin@123456' }),
  });
  const loginBody = await login.json();
  const token = loginBody.data?.accessToken as string;

  const diag = await fetch(`${API}/system/diagnostics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const diagBody = await diag.json();
  const enabled = diagBody.data?.entitlements?.enabledModules ?? [];

  const parties = await fetch(`${API}/parties`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const partiesBody = await parties.json();

  console.log(JSON.stringify({
    enabledModules: enabled,
    partyEnabled: enabled.includes('party'),
    partiesStatus: parties.status,
    partiesErrorCode: partiesBody.error?.code,
    partiesErrorMessage: partiesBody.error?.message,
  }, null, 2));
}

main();
