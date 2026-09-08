import { readFileSync } from 'fs';
import { resolve } from 'path';

const FALLBACK_VERSION = '0.1.0';

/**
 * Resolve application version from APP_VERSION env or monorepo root package.json.
 */
export function resolveAppVersion(): string {
  const fromEnv = process.env.APP_VERSION?.trim();
  if (fromEnv) return fromEnv;

  const candidates = [
    resolve(process.cwd(), 'package.json'),
    resolve(process.cwd(), '../../package.json'),
    resolve(__dirname, '../../../package.json'),
    resolve(__dirname, '../../../../package.json'),
  ];

  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      // try next candidate
    }
  }

  return FALLBACK_VERSION;
}

export function resolveDesktopVersion(): string {
  const fromEnv = process.env.DESKTOP_VERSION?.trim() ?? process.env.APP_VERSION?.trim();
  if (fromEnv) return fromEnv;

  const candidates = [
    resolve(process.cwd(), 'apps/desktop/package.json'),
    resolve(process.cwd(), 'package.json'),
  ];

  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      // try next
    }
  }

  return FALLBACK_VERSION;
}
