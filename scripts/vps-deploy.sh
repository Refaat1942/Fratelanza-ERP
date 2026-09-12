#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Fratelanza G-ERP VPS deploy"
echo "    Node: $(node -v)"
echo "    Path: $ROOT"

if [[ "${NODE_ENV:-}" == "production" ]]; then
  echo "WARNING: unset NODE_ENV before npm ci (devDependencies required for web build)"
  unset NODE_ENV
fi

echo "==> Pull latest code"
git pull origin main

echo "==> Install dependencies (includes devDependencies for tsc/vite)"
echo "    IMPORTANT: run from repo root, not apps/web"
unset NODE_ENV
npm ci

if [[ ! -d node_modules/react ]]; then
  echo "ERROR: node_modules missing after npm ci. Check disk space and npm errors above."
  exit 1
fi

echo "==> Verify React types are available"
test -d node_modules/@types/react || test -d apps/web/node_modules/@types/react || {
  echo "ERROR: @types/react not installed. Do not use npm ci --omit=dev or NODE_ENV=production."
  exit 1
}

echo "==> Build shared packages"
npm run build -w @fratelanza/types
npm run build -w @fratelanza/shared

echo "==> Build web frontend"
npm run build:web

echo "==> Build and start Docker stack"
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.production up -d --build

echo "==> Done. Open https://g-erp.fratelanza.com"
