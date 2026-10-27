#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55473}" \
BYUS_CLEAN_DB_UPGRADE_MIGRATION=20261208040000_events_celebrity_public_handle.sql \
BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/events_celebrity_public_handle_upgrade_before.sql" \
BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/events_celebrity_public_handle_upgrade_after.sql" \
BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/events_celebrity_public_handle.sql" \
  "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
