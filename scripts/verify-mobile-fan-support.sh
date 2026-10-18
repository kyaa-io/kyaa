#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55589}" \
BYUS_CLEAN_DB_UPGRADE_MIGRATION=20261129002000_mobile_fan_support.sql \
BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/mobile_fan_support_upgrade_before.sql" \
BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/mobile_fan_support.sql" \
BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/supabase/tests/mobile_fan_support_races.sh" \
 bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
