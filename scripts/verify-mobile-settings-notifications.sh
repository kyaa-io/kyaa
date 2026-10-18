#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55440}" \
BYUS_CLEAN_DB_UPGRADE_MIGRATION="20261020000000_mobile_settings_notifications.sql" \
BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/mobile_settings_notifications_upgrade_before.sql" \
BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/mobile_settings_notifications_upgrade_after.sql" \
BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/mobile_settings_notifications.sql" \
BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/supabase/tests/mobile_settings_installation_concurrency.sh" \
  bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
