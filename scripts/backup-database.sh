#!/usr/bin/env bash
# Fratelanza PostgreSQL backup script (Linux customer server)
# Usage: ./scripts/backup-database.sh [output_dir]

set -euo pipefail

OUTPUT_DIR="${1:-backups}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f .env ]]; then
    DATABASE_URL="$(grep -E '^\s*DATABASE_URL\s*=' .env | tail -1 | cut -d= -f2- | tr -d '"'"'"' | xargs)"
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not found" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found. Install PostgreSQL client tools." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$OUTPUT_DIR/fratelanza_erp_${TIMESTAMP}.sql"

pg_dump "$DATABASE_URL" -F p -f "$OUT_FILE"
echo "Backup created: $OUT_FILE"
