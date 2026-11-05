#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55467}" \
BYUS_CLEAN_DB_ASSERTION_FILE="${BYUS_CLEAN_DB_ASSERTION_FILE:-$ROOT_DIR/supabase/tests/passport/passport_p3.sql}" \
  "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
