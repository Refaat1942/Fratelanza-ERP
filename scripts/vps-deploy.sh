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
npm ci

echo "==> Build shared packages"
npm run build -w @fratelanza/types
npm run build -w @fratelanza/shared

echo "==> Build web frontend"
npm run build:web

echo "==> Build and start Docker stack"
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.production up -d --build

echo "==> Done. Open https://g-erp.fratelanza.com"
