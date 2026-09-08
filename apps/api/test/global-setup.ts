import { execSync } from 'child_process';
import { resolve } from 'path';

export default async function globalSetup(): Promise<void> {
  const repoRoot = resolve(__dirname, '../../..');
  execSync('npm run db:migrate:server:deploy', {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  execSync('npm run db:seed', {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
}
