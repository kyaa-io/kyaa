#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55448}" \
BYUS_CLEAN_DB_UPGRADE_MIGRATION="20261102000000_quiz_personal_letter.sql" \
BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/quiz_personal_letter_upgrade_before.sql" \
BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/quiz_personal_letter_upgrade_after.sql" \
BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/quiz_personal_letter.sql" \
  bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
