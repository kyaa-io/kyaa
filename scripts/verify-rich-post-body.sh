#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55476}" \
BYUS_CLEAN_DB_UPGRADE_MIGRATION=20261212030000_rich_post_body.sql \
BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/rich_post_body_upgrade_before.sql" \
BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/rich_post_body.sql" \
  "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
