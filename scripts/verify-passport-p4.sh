#!/usr/bin/env bash
# Placement: scripts/verify-passport-p4.sh, with the assertion file at supabase/tests/passport/passport_p4.sql.
# While those folders are claimed by another worker this file is run from the PR-P4 work folder (ASSERTION override).
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ ! -f "$ROOT_DIR/scripts/verify-clean-migration-chain.sh" ]; then
  ROOT_DIR="/Users/jewel/Desktop/Developement/byus-groups-production-20261101"
fi
ASSERTION="${P4_ASSERTION_FILE:-$ROOT_DIR/supabase/tests/passport/passport_p4.sql}"
BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55467}" \
BYUS_CLEAN_DB_ASSERTION_FILE="$ASSERTION" \
  "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
