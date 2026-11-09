#!/usr/bin/env bash
# B8 1단계 다중 세션 시험 (plan.md 3판 3.7): Q3 CSV 동시 2요청, N3 공지 알림 동시 2요청, N7 작업자 동시 실행,
# N8a 정상 진행 뒤 잠금 없음·다른 작업자 이어받기, N8b 배치 도중 세션 종료 -> 롤백·이어받기, 3회 연속 실패 -> failed,
# N12 롤백 리허설(K2를 먼저 되돌리면 남은 행 갱신이 막힘 -> 절차 1~5 순서대로, 단계마다 받은편지함 정상).
# 일회용 클러스터 전용: group_operator_tools.sql을 마친 데이터베이스에서 실행한다(그 픽스처를 쓴다). 시험용 트리거를 만들고 지운다.
# usage: group_operator_tools_concurrency.sh <socket-dir> <port> <database>
set -euo pipefail
SOCKET_DIR="$1"; PORT="$2"; DB="$3"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
sql() { psql -X -q -At -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PORT" -d "$DB" "$@"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1" >&2; exit 1; }

OWNER=b8000000-0000-4000-8000-000000000001
HOBBY=b8000000-0000-4000-8000-0000000000a1
OTHER=b8000000-0000-4000-8000-0000000000a2
OWNER2=b8000000-0000-4000-8000-00000000000a
FAN="$(sql -c "select id from public.group_pages where celebrity_id='b8000000-0000-4000-8000-0000000000c1'")"
[ -n "$FAN" ] || fail "fixture missing: run group_operator_tools.sql first"

# Q3: 새 페이지(OTHER)의 CSV를 두 세션이 동시에 요청 -> 정확히 1개 성공, 1개 GROUPS_RATE_LIMITED. 기록·감사 각 1행.
# 앞선 SQL 시험이 OTHER에서 이미 내보냈다(10분 창, 추가 전용 기록). 새 페이지로 본다.
Q3PAGE=b8000000-0000-4000-8000-0000000000a4
sql -c "insert into public.group_pages(id,kind,name,status) values ('$Q3PAGE','hobby','b8 동시','published'); insert into public.group_memberships(page_id,app_user_id,role) values ('$Q3PAGE','$OWNER2','owner');"
q3() { sql -c "do \$\$begin perform public.groups_dispatch('operator-members-export','$OWNER2','$Q3PAGE',null,'{}',null); raise notice 'OK'; exception when others then raise notice '%', sqlerrm; end\$\$" 2>&1 | sed 's/.*NOTICE:  //'; }
q3 > "$TMP/q3a" & a=$!; q3 > "$TMP/q3b" & b=$!; wait $a; wait $b
results="$(cat "$TMP/q3a" "$TMP/q3b" | sort | tr '\n' ' ')"
[ "$results" = "GROUPS_RATE_LIMITED OK " ] || fail "Q3 동시 CSV: $results"
[ "$(sql -c "select count(*) from public.group_member_exports where page_id='$Q3PAGE'")" = 1 ] || fail "Q3 exports rows"
[ "$(sql -c "select count(*) from public.audit_logs where action='group_members.export' and entity_id='$Q3PAGE'")" = 1 ] || fail "Q3 audit rows"
pass "Q3 CSV 동시 2요청: 1개 성공·1개 429, 기록·감사 각 1행"

# N3 동시: 같은 페이지에 공지 알림 2요청 -> 1건만, 두 번째 글도 없음
N3PAGE=b8000000-0000-4000-8000-0000000000a5
sql -c "insert into public.group_pages(id,kind,name,status) values ('$N3PAGE','hobby','b8 공지 동시','published'); insert into public.group_memberships(page_id,app_user_id,role) values ('$N3PAGE','$OWNER','owner'); update public.group_notice_broadcast_control set sending_enabled=true;"
n3() { sql -c "do \$\$begin perform public.groups_content_dispatch('post','$OWNER','$N3PAGE',null,jsonb_build_object('title','동시','body','본문','visibility','members','category','notice','notifyMembers',true,'requestId','$1'),null); raise notice 'OK'; exception when others then raise notice '%', sqlerrm; end\$\$" 2>&1 | sed 's/.*NOTICE:  //'; }
n3 b8000000-0000-4000-8000-0000000000c5 > "$TMP/n3a" & a=$!; n3 b8000000-0000-4000-8000-0000000000c6 > "$TMP/n3b" & b=$!; wait $a; wait $b
results="$(cat "$TMP/n3a" "$TMP/n3b" | sort | tr '\n' ' ')"
[ "$results" = "GROUPS_RATE_LIMITED:notice_broadcast OK " ] || fail "N3 동시: $results"
[ "$(sql -c "select count(*) from public.group_posts where page_id='$N3PAGE'")" = 1 ] || fail "N3 동시 posts"
[ "$(sql -c "select count(*) from public.group_notice_broadcasts where page_id='$N3PAGE'")" = 1 ] || fail "N3 동시 broadcasts"
pass "N3 동시 2요청: 1건만, 두 번째 글 없음"

# 중간 2: 같은 requestId 요청 두 개가 겹치면 둘 다 같은 응답(재생), 글·방송 1건. 409가 아니다.
N3RPAGE=b8000000-0000-4000-8000-0000000000a7
sql -c "insert into public.group_pages(id,kind,name,status) values ('$N3RPAGE','hobby','b8 재생 동시','published'); insert into public.group_memberships(page_id,app_user_id,role) values ('$N3RPAGE','$OWNER','owner');"
n3r() { sql -c "select (public.groups_content_dispatch('post','$OWNER','$N3RPAGE',null,jsonb_build_object('title','재생','body','본문','visibility','members','category','notice','notifyMembers',true,'requestId','b8000000-0000-4000-8000-0000000000cb'),null))->>'id'" 2>&1; }
n3r > "$TMP/n3ra" & a=$!; n3r > "$TMP/n3rb" & b=$!; wait $a; wait $b
[ "$(cat "$TMP/n3ra")" = "$(cat "$TMP/n3rb")" ] && grep -qE '^[0-9a-f-]{36}$' "$TMP/n3ra" || fail "same requestId: $(cat "$TMP/n3ra") / $(cat "$TMP/n3rb")"
[ "$(sql -c "select count(*) from public.group_posts where page_id='$N3RPAGE'")" = 1 ] || fail "same requestId posts"
[ "$(sql -c "select count(*) from public.group_notice_broadcasts where page_id='$N3RPAGE'")" = 1 ] || fail "same requestId broadcasts"
pass "중간2 같은 requestId 동시 2요청: 둘 다 같은 응답, 글·방송 1건"

# 큰 방송 하나를 새로 만든다(HOBBY, 1,500명 픽스처). 오늘 몫은 앞선 시험이 썼으므로 날짜를 옮긴다.
new_broadcast() {
  # 오늘 몫을 다시 쓰려고 이 페이지의 방송을 created_at 순으로 1900년대 날짜에 다시 매긴다. 이미 옮긴 행은 제자리, 오늘 행만 다음 칸으로 가서 PK가 겹치지 않는다.
  sql -c "update public.group_notice_broadcasts b set kst_date = date '1900-01-01' + x.n from (select post_id, row_number() over (order by created_at)::int n from public.group_notice_broadcasts where page_id='$HOBBY') x where b.post_id = x.post_id" >/dev/null
  sql -c "select (public.groups_content_dispatch('post','$OWNER','$HOBBY',null,jsonb_build_object('title','큰 공지','body','본문','visibility','members','category','notice','notifyMembers',true,'requestId','$1'),null))->>'id'"
}
# 같은 커밋 안에서 멈출 표식: 지정한 회원의 알림 insert에서 잠든다(시험 DB 전용 트리거).
sql <<'SQL'
create table public.b8_test_hook(app_user_id uuid primary key, action text not null check (action in ('sleep','fail')), seconds integer not null default 0);
create function public.b8_test_hook_fire() returns trigger language plpgsql as $$
declare h public.b8_test_hook;
begin
  select * into h from public.b8_test_hook where app_user_id = new.app_user_id;
  if found and h.action = 'sleep' then perform pg_sleep(h.seconds); end if;
  if found and h.action = 'fail' then raise exception 'B8_TEST_HOOK_FAIL'; end if;
  return new;
end $$;
create trigger b8_test_hook before insert on public.fan_notifications for each row when (new.kind::text = 'group_notice') execute function public.b8_test_hook_fire();
SQL
nth_member() { sql -c "select app_user_id from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active' where m.page_id='$HOBBY' and m.app_user_id<>'$OWNER' order by m.app_user_id offset $1 limit 1"; }

# N7: 작업자 2개 동시. 첫 작업자가 배치 안에서 3초 잠든 사이 두 번째가 시작 -> skip locked로 0건. 총 삽입 = 후보 수, 중복 0.
POST="$(new_broadcast b8000000-0000-4000-8000-0000000000c7)"
sql -c "insert into public.b8_test_hook values ('$(nth_member 10)','sleep',3)"
sql -c "select public.run_group_notice_broadcasts(2000,'n7-a')" > "$TMP/n7a" & a=$!
for _ in $(seq 1 50); do [ "$(sql -c "select count(*) from pg_stat_activity where wait_event='PgSleep' and datname=current_database()")" -ge 1 ] && break; sleep 0.1; done
sql -c "select public.run_group_notice_broadcasts(2000,'n7-b')" > "$TMP/n7b"
wait $a
[ "$(cat "$TMP/n7b")" = 0 ] || fail "N7 second worker inserted $(cat "$TMP/n7b")"
[ "$(cat "$TMP/n7a")" -gt 0 ] || fail "N7 first worker inserted nothing"
sql -c "delete from public.b8_test_hook"
sql -c "select public.run_group_notice_broadcasts(2000,'n7-c')" >/dev/null
CANDS="$(sql -c "select candidate_count from public.group_notice_broadcasts where post_id='$POST'")"
DELIV="$(sql -c "select delivered_count from public.group_notice_broadcasts where post_id='$POST'")"
ROWS="$(sql -c "select count(*)||':'||count(distinct app_user_id) from public.fan_notifications where source_key='group_notice:$POST'")"
SKIP="$(sql -c "select skipped_count from public.group_notice_broadcasts where post_id='$POST'")"
[ "$ROWS" = "$DELIV:$DELIV" ] && [ $((DELIV + SKIP)) = "$CANDS" ] || fail "N7 totals rows=$ROWS delivered=$DELIV skipped=$SKIP candidates=$CANDS"
pass "N7 동시 작업자: 한 쪽만 처리, 다른 쪽 0건, 총 삽입=후보-탈락($DELIV), 중복 0"

# N8a: 1틱 커밋 직후 그 행 잠금 없음, sending, 커서=1,000번째. 2틱을 다른 작업자 이름으로 -> done
POST="$(new_broadcast b8000000-0000-4000-8000-0000000000c8)"
sql -c "select public.run_group_notice_broadcasts(2000,'n8a-1')" >/dev/null
[ "$(sql -c "select count(*) from pg_locks l where l.relation='public.group_notice_broadcasts'::regclass and l.pid<>pg_backend_pid()")" = 0 ] || fail "N8a lock left"
[ "$(sql -c "select status from public.group_notice_broadcasts where post_id='$POST'")" = sending ] || fail "N8a status"
[ "$(sql -c "select cursor_app_user_id from public.group_notice_broadcasts where post_id='$POST'")" = "$(nth_member 999)" ] || fail "N8a cursor"
sql -c "select public.run_group_notice_broadcasts(2000,'n8a-2')" >/dev/null
[ "$(sql -c "select status||':'||last_worker from public.group_notice_broadcasts where post_id='$POST'")" = "done:n8a-2" ] || fail "N8a takeover"
pass "N8a 정상 진행: 커밋 뒤 잠금 없음, sending·커서 1,000번째, 다른 작업자가 이어 done"

# N8b: 2틱 배치 도중(300명 insert 뒤 — 픽스처 활성 회원은 1,498명) 작업자 세션 강제 종료 -> 그 배치 0건, 커서 그대로. 다른 작업자가 같은 커서에서 완료, 중복 0.
POST="$(new_broadcast b8000000-0000-4000-8000-0000000000c9)"
sql -c "select public.run_group_notice_broadcasts(2000,'n8b-1')" >/dev/null
CUR="$(sql -c "select cursor_app_user_id from public.group_notice_broadcasts where post_id='$POST'")"
AFTER1="$(sql -c "select count(*) from public.fan_notifications where source_key='group_notice:$POST'")"
sql -c "insert into public.b8_test_hook values ('$(nth_member 1300)','sleep',60)"
( sql -c "select public.run_group_notice_broadcasts(2000,'n8b-dying')" >/dev/null 2>&1 || true ) & a=$!
for _ in $(seq 1 100); do [ "$(sql -c "select count(*) from pg_stat_activity where wait_event='PgSleep' and datname=current_database()")" -ge 1 ] && break; sleep 0.1; done
sql -c "select pg_terminate_backend(pid) from pg_stat_activity where wait_event='PgSleep' and datname=current_database()" >/dev/null
wait $a || true
sql -c "delete from public.b8_test_hook"
[ "$(sql -c "select count(*) from public.fan_notifications where source_key='group_notice:$POST'")" = "$AFTER1" ] || fail "N8b rows left by the killed batch"
[ "$(sql -c "select cursor_app_user_id from public.group_notice_broadcasts where post_id='$POST'")" = "$CUR" ] || fail "N8b cursor moved"
sql -c "select public.run_group_notice_broadcasts(2000,'n8b-2')" >/dev/null
[ "$(sql -c "select status||':'||last_worker from public.group_notice_broadcasts where post_id='$POST'")" = "done:n8b-2" ] || fail "N8b takeover"
[ "$(sql -c "select count(*) = count(distinct app_user_id) from public.fan_notifications where source_key='group_notice:$POST'")" = t ] || fail "N8b duplicates"
pass "N8b 장애 인계: 죽은 배치 insert 0건·커서 그대로, 다른 작업자가 같은 커서에서 완료, 중복 0"

# N8b 이어서: 배치 3회 연속 실패 -> failed, 몫 소진
POST="$(new_broadcast b8000000-0000-4000-8000-0000000000ca)"
sql -c "insert into public.b8_test_hook values ('$(nth_member 3)','fail',0)"
for i in 1 2 3; do sql -c "select public.run_group_notice_broadcasts(2000,'n8b-fail-$i')" >/dev/null; done
sql -c "delete from public.b8_test_hook"
[ "$(sql -c "select status||':'||attempts from public.group_notice_broadcasts where post_id='$POST'")" = "failed:3" ] || fail "N8b failed state: $(sql -c "select status||':'||attempts||':'||coalesce(last_error,'') from public.group_notice_broadcasts where post_id='$POST'")"
[ "$(sql -c "select count(*) from public.fan_notifications where source_key='group_notice:$POST'")" = 0 ] || fail "N8b failed batches left rows"
[ "$(sql -c "select (public.groups_content_dispatch('notice-broadcast-status','$OWNER','$HOBBY'))->>'noticeBroadcastRemainingToday'")" = 0 ] || fail "N8b quota not used"
pass "N8b 3회 연속 실패 -> failed, 그날 몫 소진"
sql -c "drop trigger b8_test_hook on public.fan_notifications; drop function public.b8_test_hook_fire(); drop table public.b8_test_hook;"

# N12: 롤백 리허설. 먼저 K2(source_shape)를 되돌린 뒤 남은 group_notice 행을 갱신하면 실패하는 것(순서 근거)을 한 트랜잭션에서 확인하고 되돌린다.
inbox_ok() { sql -c "select count(*) >= 0 from public.get_owned_web_notifications('$1','ko')" >/dev/null && sql -c "select public.count_owned_web_notifications('$1') >= 0" >/dev/null; }
A=b8000000-0000-4000-8000-000000000003
[ "$(sql -c "select count(*) > 0 from public.fan_notifications where kind::text='group_notice'")" = t ] || fail "N12 needs group_notice rows"
order_check="$(sql 2>&1 <<'SQL' || true
begin;
do $$ declare previous text; added constant text := ' OR (((kind)::text = ''group_notice''::text) AND (live_event_id IS NULL) AND (benefit_id IS NULL) AND web_only))';
begin
  select pg_get_expr(conbin, conrelid) into strict previous from pg_constraint where conrelid = 'public.fan_notifications'::regclass and conname = 'fan_notifications_source_shape';
  alter table public.fan_notifications drop constraint fan_notifications_source_shape;
  previous := left(previous, length(previous) - length(added));
  execute 'alter table public.fan_notifications add constraint fan_notifications_source_shape check (' || previous || ')) not valid';
end $$;
update public.fan_notifications set read_at = now() where kind::text = 'group_notice';
rollback;
SQL
)"
echo "$order_check" | grep -q 'fan_notifications_source_shape' || fail "N12 K2-first did not fail: $order_check"
pass "N12 K2를 먼저 되돌리면 남은 행 갱신이 source_shape에 막힌다(순서 근거)"
inbox_ok "$A" || fail "N12 inbox before"
for f in 20261219084000_group_notice_broadcast 20261219083000_group_notice_kind 20261219082000_group_mission_stats 20261219081000_group_operator_members 20261219080000_group_operator_access; do
  sql -f "$ROOT/supabase/rollback/$f.sql" >/dev/null
  inbox_ok "$A" || fail "N12 inbox after $f"
  pass "N12 롤백 $f, 받은편지함 정상"
done
[ "$(sql -c "select count(*) from public.fan_notifications where kind::text='group_notice'")" = 0 ] || fail "N12 rows remain"
[ "$(sql -c "select count(*) > 0 from public.group_notice_broadcasts")" = t ] || fail "N12 broadcast record dropped"
[ "$(sql -c "select (public.groups_dispatch('members','$OWNER','$FAN',null,'{\"limit\":100}',null)->'items') @? '\$[*] ? (exists(@.answer))'")" = t ] || fail "N12 members answer not restored"
[ "$(sql -c "select to_regprocedure('public.group_operator_role(uuid,uuid)') is null and to_regprocedure('public.groups_dispatch_before_operator_access(text,uuid,uuid,uuid,jsonb,uuid)') is null and has_function_privilege('service_role','public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','execute') and has_function_privilege('service_role','public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','execute') and has_function_privilege('service_role','public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)','execute')")" = t ] || fail "N12 functions not restored"
pass "N12 롤백 뒤 group_notice 행 0, 방송 기록 보존, members answer 복구(감독 승인 사항), 진입 함수 원복·service_role 권한"
echo "GROUP_OPERATOR_TOOLS_CONCURRENCY_PASS"
