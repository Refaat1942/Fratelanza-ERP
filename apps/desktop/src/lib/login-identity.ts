const LOCAL_LOGIN_DOMAIN = '@fratelanza.local';

export function displayLoginName(storedEmail: string): string {
  const lower = storedEmail.toLowerCase();
  if (lower.endsWith(LOCAL_LOGIN_DOMAIN)) {
    return storedEmail.slice(0, -LOCAL_LOGIN_DOMAIN.length);
  }
  const at = storedEmail.indexOf('@');
  return at > 0 ? storedEmail.slice(0, at) : storedEmail;
}
