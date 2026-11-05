#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55474}" \
BYUS_CLEAN_DB_UPGRADE_MIGRATION=20261209210000_fan_post_views.sql \
BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/fan_post_views_upgrade_before.sql" \
BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/fan_post_views_upgrade_after.sql" \
  "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
