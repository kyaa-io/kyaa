#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${BYUS_MOBILE_PARTICIPATION_ASSERTION_MODE:-}" != "1" ]]; then
BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55439}" \
BYUS_MOBILE_PARTICIPATION_ASSERTION_MODE=1 \
BYUS_CLEAN_DB_UPGRADE_MIGRATION="20261018000000_mobile_participation.sql" \
BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/mobile_participation_upgrade_before.sql" \
BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/mobile_participation_upgrade_after.sql" \
BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/mobile_participation.sql" \
BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/scripts/verify-mobile-participation.sh" \
  bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
exit 0
fi

: "${PGHOST:?}" "${PGPORT:?}" "${PGDATABASE:?}"
if [[ "$PGDATABASE" != "byus_clean" || "$PGHOST" != /*/byus-clean-db.*/socket || ! -S "$PGHOST/.s.PGSQL.$PGPORT" ]]; then
  echo "Mobile participation concurrency check requires disposable database" >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.app_users(id,privy_user_id,verified_email)values('5b000000-0000-4000-8000-000000000001','did:privy:participation-race','participation-race@example.test');
insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values('5b000000-0000-4000-8000-000000000002','participation-race','draft','/race.webp','{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values('5b000000-0000-4000-8000-000000000002','ko','참여 경쟁','설명','이미지'),('5b000000-0000-4000-8000-000000000002','en','Participation race','Summary','Image');
update public.celebrities set status='published',published_at=clock_timestamp()where id='5b000000-0000-4000-8000-000000000002';
insert into public.mobile_participation_events(id,slug,celebrity_id,event_kind,policy_version,state,starts_at,ends_at,title_ko,title_en)values('5b000000-0000-4000-8000-000000000003','participation-race-event','5b000000-0000-4000-8000-000000000002','byus_day','race-v1','published',clock_timestamp()-interval'1 hour',clock_timestamp()+interval'1 hour','행사','Event');
insert into public.mobile_participation_contexts(id,context_type,source_event_id,celebrity_id,slug,policy_version,state,opens_at,closes_at,require_checkin,album_kind)values('5b000000-0000-4000-8000-000000000004','album','5b000000-0000-4000-8000-000000000003','5b000000-0000-4000-8000-000000000002','participation-race-album','race-v1','published',clock_timestamp()-interval'1 hour',clock_timestamp()+interval'1 hour',false,'byus_day');
insert into public.admin_allowlist(id,email,role,active)values('5b000000-0000-4000-8000-000000000008','participation-race@example.test','operator',true);
insert into public.mobile_participation_activity_sources(id,source_kind,playback_url,duration_ms,state,created_by_admin_id)values('5b000000-0000-4000-8000-000000000009','video','https://media.byus.test/race.webm',60000,'active','5b000000-0000-4000-8000-000000000008');
insert into public.mobile_participation_activity_policies(id,context_id,source_id,policy_version,activity_kind,state,opens_at,closes_at,completion_seconds,max_heartbeat_gap_seconds)values('5b000000-0000-4000-8000-000000000005','5b000000-0000-4000-8000-000000000004','5b000000-0000-4000-8000-000000000009','race-v1','video','published',clock_timestamp()-interval'1 hour',clock_timestamp()+interval'1 hour',1,10);
insert into public.mobile_participation_activity_sessions(id,activity_id,app_user_id,request_key,payload_hash,watched_seconds,source_id,source_revision)values('5b000000-0000-4000-8000-000000000006','5b000000-0000-4000-8000-000000000005','5b000000-0000-4000-8000-000000000001','5b000000-0000-4000-8000-000000000007',md5('race'),1,'5b000000-0000-4000-8000-000000000009',1);
SQL

claim() { psql -X -v ON_ERROR_STOP=1 -qAt -c "select jsonb_array_length(public.claim_mobile_participation_activity_completion(1)->'items')"; }
claim >"$PGHOST/participation-claim-a" & first=$!
claim >"$PGHOST/participation-claim-b" & second=$!
wait "$first"
wait "$second"
test "$(awk '{ total += $1 } END { print total + 0 }' "$PGHOST/participation-claim-a" "$PGHOST/participation-claim-b")" = "1"
test "$(psql -X -v ON_ERROR_STOP=1 -qAt -c "select count(*) from public.mobile_participation_activity_sessions where id='5b000000-0000-4000-8000-000000000006'and state='completing'and version=2")" = "1"
echo "PASS: concurrent completion workers claimed one activity session"
