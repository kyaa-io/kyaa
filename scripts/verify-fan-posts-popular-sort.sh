#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55515}" \
BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/fan_posts_popular_sort.sql" \
  "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
