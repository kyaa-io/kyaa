#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55590}" \
BYUS_CLEAN_DB_UPGRADE_MIGRATION=20261129003000_mobile_fan_repeating_earning.sql \
BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/mobile_fan_repeating_earning_upgrade_before.sql" \
BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/mobile_fan_repeating_earning.sql" \
BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/supabase/tests/mobile_fan_repeating_earning_races.sh" \
 bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
