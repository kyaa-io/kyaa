#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v initdb >/dev/null && command -v pg_config >/dev/null; then
  export PATH="$(pg_config --bindir):$PATH"
fi
export BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55483}"
export BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/security_rls_csprng_all.sql"
export BYUS_CLEAN_DB_UPGRADE_MIGRATION=20261129024000_wave_stage_rewards.sql
export BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/wave_stage_upgrade_before.sql"
export BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/wave_stage_upgrade_after.sql"
bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
