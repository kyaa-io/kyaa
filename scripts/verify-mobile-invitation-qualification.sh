#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${BYUS_MOBILE_INVITATION_ASSERTION_MODE:-}" != "1" ]]; then
  BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55434}" \
  BYUS_MOBILE_INVITATION_ASSERTION_MODE=1 \
  BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/mobile_invitation_qualification.sql" \
  BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/scripts/verify-mobile-invitation-qualification.sh" \
    bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
  exit 0
fi

: "${PGHOST:?PGHOST is required in assertion mode}"
: "${PGPORT:?PGPORT is required in assertion mode}"
: "${PGDATABASE:?PGDATABASE is required in assertion mode}"
if [[ "$PGDATABASE" != "byus_clean" || "$PGHOST" != /*/byus-clean-db.*/socket \
  || ! -d "$PGHOST" || ! -S "$PGHOST/.s.PGSQL.$PGPORT" ]]; then
  echo "Invitation qualification verification refuses non-disposable PostgreSQL targets" >&2
  exit 1
fi

INVITATION_DISPOSABLE_DB_URL="postgresql:///byus_clean?host=${PGHOST}&port=${PGPORT}" \
  node "$ROOT_DIR/supabase/tests/mobile_invitation_qualification_concurrency.mjs"
