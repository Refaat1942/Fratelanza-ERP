#!/usr/bin/env bash
# G-ERP production deploy — safe for shared VPS (does NOT touch fratelanza_erp)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.production"
ENV_FILE="infra/docker/.env.production"
DOMAIN="g-erp.fratelanza.com"
WEB_PORT="9080"
PROTECTED_DB="fratelanza_erp"
ALLOWED_DBS=("fratelanza_g_erp_prod" "fratelanza_eval")

log() { echo "==> $*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

require_env_file() {
  [[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE — copy from infra/docker/.env.production.example and set secrets."
}

extract_db_name() {
  local url="$1"
  echo "$url" | sed -n 's|.*/\([^/?]*\)\(?:\?.*\)\?|\1|p'
}

assert_database_safe() {
  require_env_file
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  local db_name
  db_name="$(extract_db_name "${DATABASE_URL:-}")"
  [[ -n "$db_name" ]] || fail "Could not parse DATABASE_URL from $ENV_FILE"

  if [[ "$db_name" == "$PROTECTED_DB" ]] || [[ "${DATABASE_URL:-}" == *"$PROTECTED_DB"* ]]; then
    fail "DATABASE_URL points to protected database $PROTECTED_DB — aborting."
  fi

  local ok=0
  for allowed in "${ALLOWED_DBS[@]}"; do
    if [[ "$db_name" == "$allowed" ]]; then ok=1; break; fi
  done
  [[ "$ok" -eq 1 ]] || fail "DATABASE_URL database '$db_name' is not allowed. Use fratelanza_g_erp_prod or fratelanza_eval."

  log "Database safety OK: $db_name"
}

preflight() {
  log "VPS pre-flight"
  command -v docker >/dev/null || fail "docker not installed"
  command -v docker >/dev/null && docker compose version >/dev/null || fail "docker compose not available"
  command -v nginx >/dev/null && nginx -v || echo "WARN: nginx not found on host (configure manually)"
  df -h / | tail -1
  free -h 2>/dev/null || true
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
}

deploy_code() {
  log "Pull latest verified code"
  git pull origin main

  log "Install dependencies"
  unset NODE_ENV
  npm ci || npm install

  log "Build packages and web"
  npm run build -w @fratelanza/types
  npm run build -w @fratelanza/shared
  npm run build:deploy:web
}

deploy_stack() {
  assert_database_safe
  log "Build and start Docker stack"
  $COMPOSE build --no-cache api web
  $COMPOSE up -d

  log "Wait for API"
  sleep 8

  log "Apply migrations (safe DB only)"
  assert_database_safe
  $COMPOSE exec -T api sh -c "npx prisma migrate deploy --schema=packages/database/prisma/schema.server.prisma"

  log "Seed demo/production data"
  assert_database_safe
  $COMPOSE exec -T api sh -c "npm run seed -w @fratelanza/database"
}

configure_nginx() {
  if ! command -v nginx >/dev/null; then
    echo "SKIP: host nginx not installed"
    return
  fi
  log "Install host nginx site for $DOMAIN"
  sudo cp infra/nginx/host-g-erp.conf "/etc/nginx/sites-available/$DOMAIN"
  sudo ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
  sudo nginx -t
  sudo systemctl reload nginx
}

health_checks() {
  log "Health checks via Docker web ($WEB_PORT)"
  curl -fsS "http://127.0.0.1:${WEB_PORT}/api/v1/health" >/dev/null || fail "/api/v1/health failed"
  curl -fsS "http://127.0.0.1:${WEB_PORT}/health" >/dev/null || fail "/health failed"
  curl -fsS "http://127.0.0.1:${WEB_PORT}/health/ready" >/dev/null || fail "/health/ready failed"
  curl -fsS "http://127.0.0.1:${WEB_PORT}/system/version" >/dev/null || fail "/system/version failed"
  log "Health checks passed on localhost:$WEB_PORT"
}

verify_protected_db() {
  log "Verify protected database $PROTECTED_DB was not targeted"
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  local db_name
  db_name="$(extract_db_name "${DATABASE_URL:-}")"
  [[ "$db_name" != "$PROTECTED_DB" ]] || fail "Production env still points at $PROTECTED_DB"
  log "Production uses: $db_name (protected DB untouched by this script)"
}

main() {
  preflight
  require_env_file
  deploy_code
  deploy_stack
  configure_nginx
  health_checks
  verify_protected_db
  log "Deploy complete: https://$DOMAIN"
  log "Demo login: admin / (see DEMO_SEED_PASSWORD in .env.production)"
  log "Control Center: platform-admin / (same password)"
}

main "$@"
