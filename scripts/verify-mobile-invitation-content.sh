#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55468}" \
BYUS_CLEAN_DB_UPGRADE_MIGRATION=20261127000000_mobile_invitation_content.sql \
BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/mobile_invitation_content_upgrade_before.sql" \
BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/mobile_invitation_content_upgrade_after.sql" \
BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/mobile_invitation_qualification.sql" \
  "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
