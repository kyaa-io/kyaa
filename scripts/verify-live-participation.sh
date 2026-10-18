#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${BYUS_LIVE_PARTICIPATION_INNER:-}" != 1 ]]; then
  BYUS_LIVE_PARTICIPATION_INNER=1 BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55519}" \
    BYUS_CLEAN_DB_UPGRADE_MIGRATION="20261129009000_live_participation.sql" \
    BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/live_participation_upgrade_before.sql" \
    BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/live_participation_upgrade_after.sql" \
    BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/live_participation.sql" \
    BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/scripts/verify-live-participation.sh" \
    exec bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
fi
: "${PGHOST:?}" "${PGPORT:?}" "${PGDATABASE:?}"
if [[ "$PGDATABASE" != byus_clean || "$PGHOST" != /*/byus-clean-db.*/socket || ! -S "$PGHOST/.s.PGSQL.$PGPORT" ]]; then
  echo "Disposable clean migration database required" >&2; exit 1
fi
PSQL=(psql -X -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE")
"${PSQL[@]}" -f "$ROOT_DIR/supabase/tests/live_participation_concurrency_setup.sql"
OUT_DIR="${BYUS_LIVE_PARTICIPATION_LOG_DIR:-$ROOT_DIR/work/live-participation}"
mkdir -p "$OUT_DIR"
owner=aa900000-0000-4000-8000-000000000107
# Distinct keys, two screens and the old native producer share B's canonical reservation lock.
"${PSQL[@]}" -c "select public.submit_owned_live_participation('$owner','participation-1999',(select id from public.live_participation_test_ids where key='nextreserve'),'aa900000-0000-4000-8000-000000002101','{\"kind\":\"reservation\"}','aa900000-0000-4000-8000-000000002201','byus:stamp:v1:aa900000-0000-4000-8000-000000002201','0x'||repeat('b',64));" > "$OUT_DIR/reserve-a.log" 2>&1 & a=$!
"${PSQL[@]}" -c "select public.submit_owned_live_participation('$owner','participation-2000',(select id from public.live_participation_test_ids where key='reserve'),'aa900000-0000-4000-8000-000000002102','{\"kind\":\"reservation\"}','aa900000-0000-4000-8000-000000002202','byus:stamp:v1:aa900000-0000-4000-8000-000000002202','0x'||repeat('c',64));" > "$OUT_DIR/reserve-b.log" 2>&1 & b=$!
"${PSQL[@]}" -c "select public.reserve_owned_live_event('$owner','aa900000-0000-4000-8000-000000002000','aa900000-0000-4000-8000-000000002103','aa900000-0000-4000-8000-000000002203','byus:stamp:v1:aa900000-0000-4000-8000-000000002203','0x'||repeat('d',64));" > "$OUT_DIR/reserve-native.log" 2>&1 & c=$!
wait "$a";wait "$b";wait "$c"
# Concurrent canonical review rows acquire wallet last, matching old attendance.
for key in early first; do
  "${PSQL[@]}" -c "select public.review_admin_certification_submission('aa900000-0000-4000-8000-000000000010','aa900000-0000-4000-8000-000000000011',extensions.gen_random_uuid(),(select id from public.live_participation_test_ids where key='$key-7'),extensions.gen_random_uuid(),1,'approve',null);" > "$OUT_DIR/review-$key.log" 2>&1 &
  if [[ "$key" == early ]];then a=$!;else b=$!;fi
done
"${PSQL[@]}" -c "select public.attend_owned_live_event_with_replay('$owner','participation-2001','aa900000-0000-4000-8000-000000002104','TEST2026',true,'aa900000-0000-4000-8000-000000002204','byus:stamp:v1:aa900000-0000-4000-8000-000000002204','0x'||repeat('e',64));" > "$OUT_DIR/attendance-native.log" 2>&1 & c=$!
"${PSQL[@]}" -c "select public.submit_owned_live_participation('$owner','participation-2001',(select id from public.live_participation_test_ids where key='attendance'),'aa900000-0000-4000-8000-000000002105','{\"kind\":\"attendance\",\"code\":\"TEST2026\"}','aa900000-0000-4000-8000-000000002205','byus:stamp:v1:aa900000-0000-4000-8000-000000002205','0x'||repeat('f',64));" > "$OUT_DIR/attendance-new.log" 2>&1 & d=$!
wait "$a";wait "$b";wait "$c";wait "$d"
# Losing first-entry approval must roll back the review and every financial effect.
if "${PSQL[@]}" -c "select public.review_admin_certification_submission('aa900000-0000-4000-8000-000000000010','aa900000-0000-4000-8000-000000000011',extensions.gen_random_uuid(),(select id from public.live_participation_test_ids where key='first-8'),extensions.gen_random_uuid(),1,'approve',null);" > "$OUT_DIR/first-loser.log" 2>&1;then echo "Second first-entry winner accepted" >&2;exit 1;fi
if ! grep -Fq live_participation_first_winner "$OUT_DIR/first-loser.log";then cat "$OUT_DIR/first-loser.log" >&2;exit 1;fi
"${PSQL[@]}" <<'SQL'
do $$begin
 if exists(select 1 from public.live_participation_requests where input->'payload'->>'kind'='reservation'and result->>'replayed'='true'and(result->>'awardedPoints')::integer<>0)or(select count(*)from public.live_participation_requests where input->'payload'->>'kind'='reservation'and(result->>'awardedPoints')::integer=5)>1 then raise exception 'Canonical reservation replay claimed another award';end if;
 if(select count(*)from public.live_reservations where app_user_id='aa900000-0000-4000-8000-000000000107'and live_event_id='aa900000-0000-4000-8000-000000002000')<>1 then raise exception 'Concurrent reservation duplicated';end if;
 if(select sum(awarded_points)from public.live_participation_receipts where app_user_id='aa900000-0000-4000-8000-000000000107'and live_event_id='aa900000-0000-4000-8000-000000002000')<>5 then raise exception 'A/B reward attribution failed';end if;
 if exists(select 1 from public.live_participation_receipts where live_event_id='aa900000-0000-4000-8000-000000001999')then raise exception 'A received B reward';end if;
 if(select sum(awarded_points)from public.live_participation_receipts where app_user_id='aa900000-0000-4000-8000-000000000107'and live_event_id='aa900000-0000-4000-8000-000000002001')<>30 then raise exception 'Concurrent attendance delta wrong';end if;
 if(select status from public.certification_submissions where id=(select id from public.live_participation_test_ids where key='first-8'))<>'pending'then raise exception 'Losing approval not rolled back';end if;
 if exists(select 1 from public.live_participation_receipts where app_user_id='aa900000-0000-4000-8000-000000000108'and mission_key='first')then raise exception 'Losing receipt committed';end if;
end $$;
SQL
# Repeat old/new canonical races after a creator's general earning activation.
"${PSQL[@]}" <<'SQL'
insert into public.mobile_fan_economy_policies(id,celebrity_id,kind,version,rules,effective_at)values('aa900000-0000-4000-8000-000000000003','aa900000-0000-4000-8000-000000000001','earning','concurrent-general',jsonb_build_object('verification',1,'reaction',1,'comment',1,'checkin',1,'certification',1,'membership_instagram',1,'membership_tiktok',1,'membership_youtube',1,'share',1,'live_reservation',1,'live_attendance',1,'mission_completion',1,'first_clip',1,'journey_completion',1,'invitation_milestone',1),clock_timestamp()-interval'1 hour');
insert into public.mobile_fan_earning_cutovers values('aa900000-0000-4000-8000-000000000001','aa900000-0000-4000-8000-000000000003',clock_timestamp()-interval'1 hour','concurrent-general');
SQL
owner=aa900000-0000-4000-8000-000000000108
"${PSQL[@]}" -c "select public.submit_owned_live_participation('$owner','participation-1999',(select id from public.live_participation_test_ids where key='nextreserve'),'aa900000-0000-4000-8000-000000003101','{\"kind\":\"reservation\"}','aa900000-0000-4000-8000-000000003201','byus:stamp:v1:aa900000-0000-4000-8000-000000003201','0x'||repeat('b',64));" > "$OUT_DIR/reserve-active-a.log" 2>&1 & a=$!
"${PSQL[@]}" -c "select public.submit_owned_live_participation('$owner','participation-2000',(select id from public.live_participation_test_ids where key='reserve'),'aa900000-0000-4000-8000-000000003102','{\"kind\":\"reservation\"}','aa900000-0000-4000-8000-000000003202','byus:stamp:v1:aa900000-0000-4000-8000-000000003202','0x'||repeat('c',64));" > "$OUT_DIR/reserve-active-b.log" 2>&1 & b=$!
"${PSQL[@]}" -c "select public.reserve_owned_live_event('$owner','aa900000-0000-4000-8000-000000002000','aa900000-0000-4000-8000-000000003103','aa900000-0000-4000-8000-000000003203','byus:stamp:v1:aa900000-0000-4000-8000-000000003203','0x'||repeat('d',64));" > "$OUT_DIR/reserve-active-native.log" 2>&1 & c=$!
wait "$a";wait "$b";wait "$c"
for key in early first; do
 "${PSQL[@]}" -c "select public.review_admin_certification_submission('aa900000-0000-4000-8000-000000000010','aa900000-0000-4000-8000-000000000011',extensions.gen_random_uuid(),(select id from public.live_participation_test_ids where key='$key-active'),extensions.gen_random_uuid(),1,'approve',null);" > "$OUT_DIR/review-active-$key.log" 2>&1 &
 if [[ "$key" == early ]];then a=$!;else b=$!;fi
done
"${PSQL[@]}" -c "select public.attend_owned_live_event_with_replay('$owner','participation-2002','aa900000-0000-4000-8000-000000003104','TEST2026',true,'aa900000-0000-4000-8000-000000003204','byus:stamp:v1:aa900000-0000-4000-8000-000000003204','0x'||repeat('e',64));" > "$OUT_DIR/attendance-active-native.log" 2>&1 & c=$!
"${PSQL[@]}" -c "select public.submit_owned_live_participation('$owner','participation-2002',(select id from public.live_participation_test_ids where key='attendance-active'),'aa900000-0000-4000-8000-000000003105','{\"kind\":\"attendance\",\"code\":\"TEST2026\"}','aa900000-0000-4000-8000-000000003205','byus:stamp:v1:aa900000-0000-4000-8000-000000003205','0x'||repeat('f',64));" > "$OUT_DIR/attendance-active-new.log" 2>&1 & d=$!
wait "$a";wait "$b";wait "$c";wait "$d"
"${PSQL[@]}" <<'SQL'
do $$begin
 if public.mobile_fan_economy_balance('aa900000-0000-4000-8000-000000000108','aa900000-0000-4000-8000-000000000001','fan_point')<>35 then raise exception 'General earning activation duplicated broadcast awards';end if;
 if(select count(*)from public.live_reservations where app_user_id='aa900000-0000-4000-8000-000000000108'and live_event_id='aa900000-0000-4000-8000-000000002000')<>1 then raise exception 'Active concurrent reservation duplicated';end if;
 if(select sum(awarded_points)from public.live_participation_receipts where app_user_id='aa900000-0000-4000-8000-000000000108'and live_event_id='aa900000-0000-4000-8000-000000002002')<>30 then raise exception 'Active concurrent attendance delta wrong';end if;
end $$;
SQL
printf '%s\n' 'PASS: old/new HTTP dispatcher/native reservation and attendance concurrency with earning active/inactive, canonical review delta, first-winner atomic rollback'
