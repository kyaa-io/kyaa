#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55799}" \
BYUS_CLEAN_DB_UPGRADE_MIGRATION="20270116060200_verified_page_categories.sql" \
BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/verified_page_categories_upgrade_before.sql" \
BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/verified_page_categories_upgrade_after.sql" \
  bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
