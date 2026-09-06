import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';

const MONOREPO_MARKERS = ['apps/api', 'packages/database', 'infra/docker'];

function isMonorepoRoot(dir: string): boolean {
  return MONOREPO_MARKERS.every((marker) => existsSync(join(dir, ...marker.split('/'))));
}

/** Walk up from a start directory until the monorepo root is found. */
export function findMonorepoRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir);

  for (let i = 0; i < 12; i++) {
    if (isMonorepoRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return resolve(startDir);
}

/** Resolve the root `.env` file regardless of where the API process starts. */
export function getRootEnvPath(): string {
  const searchRoots = [
    process.cwd(),
    resolve(__dirname, '..'), // dist/ or src/
    resolve(__dirname, '../..'), // apps/api
    resolve(__dirname, '../../..'), // apps
    resolve(__dirname, '../../../..'), // monorepo root from dist/config
    findMonorepoRoot(),
  ];

  for (const root of searchRoots) {
    const envPath = join(root, '.env');
    if (existsSync(envPath)) return envPath;
  }

  return join(findMonorepoRoot(), '.env');
}

export function getRootEnvExamplePath(): string {
  return join(findMonorepoRoot(), '.env.example');
}
