const LOCAL_LOGIN_DOMAIN = '@fratelanza.local';

/** Normalize login input: lowercase, append local domain when no @ present. */
export function normalizeLoginIdentifier(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return trimmed;
  if (trimmed.includes('@')) return trimmed;
  return `${trimmed}${LOCAL_LOGIN_DOMAIN}`;
}

/** Show a friendly username in the UI (hide internal @fratelanza.local suffix). */
export function displayLoginName(storedEmail: string): string {
  const lower = storedEmail.toLowerCase();
  if (lower.endsWith(LOCAL_LOGIN_DOMAIN)) {
    return storedEmail.slice(0, -LOCAL_LOGIN_DOMAIN.length);
  }
  const at = storedEmail.indexOf('@');
  return at > 0 ? storedEmail.slice(0, at) : storedEmail;
}

/** Validate username for create/update (letters, numbers, underscore, dot; 3–32 chars). */
export function isValidUsername(username: string): boolean {
  return /^[a-z0-9._-]{3,32}$/i.test(username.trim());
}
