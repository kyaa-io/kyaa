#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v initdb >/dev/null && command -v pg_config >/dev/null; then
  export PATH="$(pg_config --bindir):$PATH"
fi
export BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55491}"
export BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/channel_operator_invitations.sql"
bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
