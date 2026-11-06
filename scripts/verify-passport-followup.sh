#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55467}" \
BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/passport/passport_followup.sql" \
BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/supabase/tests/passport/passport_followup_concurrency.sh" \
  "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
