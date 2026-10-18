#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${BYUS_MOBILE_MEDIA_ASSERTION_MODE:-}" != "1" ]]; then
  BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55439}" \
  BYUS_MOBILE_MEDIA_ASSERTION_MODE=1 \
  BYUS_CLEAN_DB_UPGRADE_MIGRATION="20261014000000_mobile_media.sql" \
  BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/mobile_media_upgrade_before.sql" \
  BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/mobile_media_upgrade_after.sql" \
  BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/mobile_media.sql" \
  BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/scripts/verify-mobile-media.sh" \
    bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
  exit 0
fi
: "${PGHOST:?}" "${PGPORT:?}" "${PGDATABASE:?}"
if [[ "$PGDATABASE" != "byus_clean" || "$PGHOST" != /*/byus-clean-db.*/socket || ! -S "$PGHOST/.s.PGSQL.$PGPORT" ]]; then echo "Media concurrency check requires disposable database" >&2; exit 1; fi
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.app_users(id,privy_user_id,verified_email)values('76200000-0000-4000-8000-000000000001','did:privy:media-race','media-race@example.test');
select public.reserve_owned_mobile_media('76200000-0000-4000-8000-000000000001','image','dm','image/jpeg',100,'76200000-0000-4000-8000-000000000002');
select public.queue_owned_mobile_media_validation('76200000-0000-4000-8000-000000000001',(select id from public.mobile_media_assets where request_id='76200000-0000-4000-8000-000000000002'));
SQL
claim() { psql -X -v ON_ERROR_STOP=1 -qAt -c "select coalesce(public.claim_mobile_media_validation((select id from public.mobile_media_assets where request_id='76200000-0000-4000-8000-000000000002'))::text,'null')"; }
claim >"$PGHOST/claim-a" & first=$!; claim >"$PGHOST/claim-b" & second=$!; wait "$first"; wait "$second"
test "$(cat "$PGHOST/claim-a" "$PGHOST/claim-b" | grep -vc '^null$')" -eq 1
echo "PASS: concurrent validators claimed one media job"
