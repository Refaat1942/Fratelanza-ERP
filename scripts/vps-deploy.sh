#!/usr/bin/env bash

set -euo pipefail



ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT"



ENV_FILE="infra/docker/.env.production"

COMPOSE="docker compose -f infra/docker/docker-compose.prod.yml --env-file $ENV_FILE"



extract_db_name() {

  local url="$1"

  echo "$url" | sed -n 's|.*/\([^/?]*\)\(?:\?.*\)\?|\1|p'

}



assert_database_safe() {

  [[ -f "$ENV_FILE" ]] || { echo "ERROR: Missing $ENV_FILE"; exit 1; }

  # shellcheck disable=SC1090

  source "$ENV_FILE"

  local db_name

  db_name="$(extract_db_name "${DATABASE_URL:-}")"

  if [[ -z "$db_name" ]]; then

    echo "ERROR: Could not parse DATABASE_URL"

    exit 1

  fi

  if [[ "$db_name" == "fratelanza_erp" ]] || [[ "${DATABASE_URL:-}" == *"fratelanza_erp"* ]]; then

    echo "ERROR: Refusing to migrate/seed protected database fratelanza_erp"

    exit 1

  fi

  echo "==> Database target: $db_name (OK)"

}



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

export NODE_ENV=

if ! npm ci; then

  echo "WARN: npm ci failed (lock file drift). Running npm install once to sync..."

  npm install

fi



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

npm run build:deploy:web



assert_database_safe



echo "==> Build and start Docker stack (API image runs prisma generate internally)"

$COMPOSE build --no-cache api web

$COMPOSE up -d



echo "==> Wait for API container"

sleep 8



assert_database_safe



echo "==> Apply database migrations"

$COMPOSE exec -T api sh -c "npx prisma migrate deploy --schema=packages/database/prisma/schema.server.prisma"



assert_database_safe



echo "==> Seed demo database"

$COMPOSE exec -T api sh -c "npm run seed -w @fratelanza/database"



echo "==> Health check"

curl -fsS "http://127.0.0.1:9080/api/v1/health" >/dev/null && echo "    /api/v1/health OK"

curl -fsS "http://127.0.0.1:9080/health" >/dev/null && echo "    /health OK"



echo "==> Done. Open https://g-erp.fratelanza.com"

echo "    Demo links: /demo/egypt/trading  /demo/saudi/trading  /demo/services  ..."

echo "    Login: admin / Eval@2026!Demo  |  Control Center: platform-admin"

