#!/usr/bin/env bash
# 케미 M1 · 탈퇴와 동시 요청(설계 arch-chemi r3 §6.7 ⑥ · ⑦, §5.1 4 잠금 순서). 실제 PostgreSQL 두 세션.
# 일회용 DB 에서만 돈다(PG* 환경값 사용, 줄을 커밋한다). 마이그레이션이 모두 적용된 DB 가 필요하다.
#  ⑥ feature 스위치를 모두 off 로 둔 채 케미 데이터가 있는 사용자 탈퇴 → 사용자 표 줄 0(SQL 은 스위치를 보지 않는다)
#  ⑦ 탈퇴 시작과 결제 시작(confirming)을 동시에, 순서 양쪽 → 끝 상태는 (confirming · BLOCKED · active) 또는 (disabled · ACCOUNT_CLOSED) 뿐
#     결제 시작 함수(chemi_order_confirming)는 W1-PAY 몫이라, 여기서는 설계 계약(같은 fan-web-user 잠금 → active 확인 → confirming)을
#     그대로 따르는 시험용 세션으로 대신한다.
#  ⑦b 탈퇴 시작과 같은 사람의 지갑 잠금(케미 3P 길: 지갑 → 사용자)을 동시에 → deadlock 0
#  ⑦c 탈퇴 시작과 runmusic 캠페인 행 잠금 뒤 같은 사용자 잠금을 잡는 세션을 동시에 → deadlock 0(감싸개가 캠페인 행을 먼저 잡는다)
# 확인하지 않는 것: ⑧ ⑨ ⑩ 의 결제사 호출 수(W1-PAY 함수·모의 결제사 필요), CHEMI_TAB 을 끈 웹 라우트(account-deletion.ts 연결은 D2 승인 뒤).
set -euo pipefail
P="psql -X -q -v ON_ERROR_STOP=1"
DB=$($P -At -c "select current_database()")
case "$DB" in byus_clean|byus_chemi*) ;; *) echo "disposable database required (got $DB)"; exit 1;; esac
fail() { echo "deletion_race failed: $*"; exit 1; }
# Full DB-only suite: BYUS_CLEAN_DB_SHELL_ASSERTION_FILE may point here.
# bash deletion_race.sh --suite; no argument runs concurrency checks only.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "${1:-}" = "--suite" ] || [ "${CHEMI_DB_SUITE:-0}" = "1" ]; then
  node "$HERE/../../../scripts/chemi-chain-schema-sql.mjs" --check
FINGERPRINT=$(cat <<'SQL'
with f as (
  select 'fn '||p.oid::regprocedure::text||' '||pg_get_userbyid(p.proowner)||' '||md5(p.prosrc)||' '||coalesce(p.proacl::text,'')||' '||p.prosecdef||' '||coalesce(p.proconfig::text,'') x
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast') and n.nspname not like 'pg_temp%' and p.proname not like 'chemi\_%'
  union all select 'rel '||c.oid::regclass::text||' '||c.relkind::text||' '||pg_get_userbyid(c.relowner)||' '||coalesce(c.relacl::text,'')||' '||c.relrowsecurity||' '||c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast') and c.relname not like 'chemi\_%'
  union all select 'col '||a.attrelid::regclass::text||'.'||a.attname||' '||format_type(a.atttypid,a.atttypmod)||' '||a.attnotnull||' '||coalesce(pg_get_expr(d.adbin,d.adrelid),'')
  from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attnum>0 and not a.attisdropped and n.nspname not in ('pg_catalog','information_schema','pg_toast') and c.relname not like 'chemi\_%'
  union all select 'con '||conrelid::regclass::text||' '||conname||' '||pg_get_constraintdef(oid) from pg_constraint
  where connamespace not in ('pg_catalog'::regnamespace,'information_schema'::regnamespace) and conrelid<>0 and conrelid::regclass::text not like '%chemi\_%'
  union all select 'trg '||tgrelid::regclass::text||' '||tgname||' '||tgenabled::text||' '||pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgrelid::regclass::text not like '%chemi\_%'
  union all select 'idx '||indexrelid::regclass::text||' '||pg_get_indexdef(indexrelid) from pg_index where indrelid::regclass::text not like '%chemi\_%' and indrelid::regclass::text not like 'pg\_%'
  union all select 'pol '||polrelid::regclass::text||' '||polname||' '||coalesce(pg_get_expr(polqual,polrelid),'') from pg_policy
  union all select 'view '||c.oid::regclass::text||' '||md5(pg_get_viewdef(c.oid)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('v','m') and n.nspname not in ('pg_catalog','information_schema')
  union all select 'defacl '||defaclrole::regrole::text||' '||defaclobjtype::text||' '||coalesce(defaclacl::text,'') from pg_default_acl
  union all select 'role '||rolname||' '||rolsuper||' '||rolbypassrls from pg_roles where rolname not like 'pg\_%'
) select md5(string_agg(x, E'\n' order by x)) || ' ' || count(*) from f
SQL
)
if [ -n "${CHEMI_BASE_DB:-}" ]; then
  before=$(PGDATABASE="$CHEMI_BASE_DB" $P -c "$FINGERPRINT")
  after=$($P -c "$FINGERPRINT")
  [ "$before" = "$after" ] || fail "1. objects outside chemi_* changed ($before → $after)"
  echo "1. non-chemi catalog unchanged ($after)"
else
  echo "1. skipped: CHEMI_BASE_DB not set"
fi

  $P -f "$HERE/schema_additive.sql"
  for f in m1_closure chain_payload schema_base_fn erase_user r4_profile; do
    $P -f "$HERE/$f.sql"
  done
fi
OUT=$(mktemp -d); trap 'rm -rf "$OUT"' EXIT

user() { # id subject
  $P -c "insert into public.app_users(id,privy_user_id,verified_email) values('$1','$2','$2@example.test')"
}

# ⑥
U6=c6e00000-0000-4000-8000-000000000006
user "$U6" did:privy:chemi-race-6
$P >/dev/null <<SQL
select public.chemi_switch_set('feature', k, 'off') from unnest(array['pay','ask','chain','game','grow','friends']) k;
select public.chemi_pass_ensure_initial('$U6');
insert into public.chemi_profiles(user_id,birth_date,calendar,time_precision,consent_version,consent_at) values('$U6','1995-05-05','solar','unknown','v1',now());
insert into public.chemi_readings(user_id,content,kind,character,kst_date,result,engine_version,table_version) values('$U6','fortune','daily','changha',public.dukjil_kst_date(),'{}','e','t');
select public.chemi_begin_account_deletion('did:privy:chemi-race-6');
SQL
TOKEN=$($P -At -c "select public.claim_account_deletion('$U6')->>'leaseToken'")
[ "$($P -At -c "select public.chemi_complete_account_deletion('$U6','$TOKEN')")" = "t" ] || fail "⑥ complete"
LEFT=$($P -At -c "select count(*) from public.chemi_profiles where user_id='$U6'")+$($P -At -c "select count(*) from public.chemi_readings where user_id='$U6'")+$($P -At -c "select count(*) from public.chemi_pass_lots where user_id='$U6'")
[ "$LEFT" = "0+0+0" ] || fail "⑥ rows left $LEFT"
$P -c "delete from public.chemi_switches where scope='feature'"

# ⑦ 결제 시작(시험용 세션): 같은 잠금 → active 확인 → confirming
confirm_sql() { # user order delay
  echo "begin; select pg_sleep($3); select public.chemi_lock_user('$1'); select pg_sleep(0.3); update public.chemi_orders set status='confirming',payment_key='pk-$2',limit_month=date_trunc('month',now())::date,confirming_at=now() where id='$2' and status='created'; commit;"
}
begin_sql() { # subject delay
  echo "begin; select pg_sleep($2); select public.chemi_begin_account_deletion('$1'); commit;"
}
for i in 1 2 3 4 5 6 7 8; do
  U=c7e00000-0000-4000-8000-0000000000$(printf %02d $i); O=c7f00000-0000-4000-8000-0000000000$(printf %02d $i); S=did:privy:chemi-race-7-$i
  user "$U" "$S"
  $P -c "insert into public.chemi_orders(id,order_no,user_id,product_code,amount_krw) values('$O','C-20270113-80$(printf %02d $i)','$U','ask_5',1900)"
  if [ $((i % 2)) = 0 ]; then a=0; b=0.3; else a=0.3; b=0; fi  # 순서 양쪽
  ($P -At -c "$(confirm_sql "$U" "$O" $a)" >"$OUT/c$i" 2>&1 || true) &
  ($P -At -c "$(begin_sql "$S" $b)" >"$OUT/b$i" 2>&1 || true) &
  wait
  state=$($P -At -c "select (select status from public.chemi_orders where id='$O')||'/'||(select status from public.app_users where id='$U')")
  case "$state" in
    confirming/active) grep -q CHEMI_DELETION_BLOCKED "$OUT/b$i" || fail "⑦.$i confirming won but begin not blocked: $(cat "$OUT/b$i")";;
    abandoned/disabled) grep -q CHEMI_ACCOUNT_CLOSED "$OUT/c$i" || fail "⑦.$i begin won but payment not refused: $(cat "$OUT/c$i")";;
    *) fail "⑦.$i impossible end state $state";;
  esac
  ! grep -q "deadlock" "$OUT/c$i" "$OUT/b$i" || fail "⑦.$i deadlock"
done
[ "$($P -At -c "select count(*) from public.chemi_orders o join public.app_users u on u.id=o.user_id where u.status='disabled' and o.status='confirming'")" = "0" ] || fail "⑦ disabled account with confirming order"
[ "$($P -At -c "select count(distinct o.status) from public.chemi_orders o where o.order_no like 'C-20270113-80%'")" = "2" ] || fail "⑦ only one ordering was exercised"

# ⑦b 지갑 → 사용자 잠금(케미 3P·덕질 적립 길)과 탈퇴 시작이 동시에
for i in 1 2 3 4; do
  U=c8e00000-0000-4000-8000-0000000000$(printf %02d $i); S=did:privy:chemi-race-8-$i
  user "$U" "$S"
  if [ $((i % 2)) = 0 ]; then a=0; b=0.3; else a=0.3; b=0; fi
  ($P -At -c "begin; select pg_sleep($a); select public.chemi_lock_user('$U', true, false); select pg_sleep(0.3); insert into public.chemi_day_stamps(user_id,kst_date,first_content) values('$U',public.dukjil_kst_date(),'fortune'); commit;" >"$OUT/w$i" 2>&1 || true) &
  ($P -At -c "$(begin_sql "$S" $b)" >"$OUT/d$i" 2>&1 || true) &
  wait
  ! grep -q "deadlock" "$OUT/w$i" "$OUT/d$i" || fail "⑦b.$i deadlock"
  grep -q '"status" *: *"pending"' "$OUT/d$i" || fail "⑦b.$i begin: $(cat "$OUT/d$i")"
done

# ⑦c runmusic 캠페인 행 → 사용자 잠금 순서의 세션과 탈퇴 시작이 동시에
for i in 1 2 3 4; do
  U=c9e00000-0000-4000-8000-0000000000$(printf %02d $i); S=did:privy:chemi-race-9-$i
  user "$U" "$S"
  # 짝수: 캠페인 행을 먼저 잡은 세션이 0.6초 뒤 사용자 잠금을 원할 때 감싸개가 0.2초에 들어온다(감싸개가 사용자 잠금을 먼저 잡으면 교착)
  if [ $((i % 2)) = 0 ]; then a=0; b=0.2; else a=0.3; b=0; fi
  ($P -At -c "begin; select pg_sleep($a); select 1 from public.runmusic_campaign for update; select pg_sleep(0.6); select pg_advisory_xact_lock(hashtextextended('fan-web-user:$U',0)); commit;" >"$OUT/r$i" 2>&1 || true) &
  ($P -At -c "$(begin_sql "$S" $b)" >"$OUT/e$i" 2>&1 || true) &
  wait
  ! grep -q "deadlock" "$OUT/r$i" "$OUT/e$i" || fail "⑦c.$i deadlock"
  grep -q '"status" *: *"pending"' "$OUT/e$i" || fail "⑦c.$i begin: $(cat "$OUT/e$i")"
done
# ⑦d R4D F-B12 표 6행: 실제 보상 경로(chemi_complete_reading → 지갑 → 사용자 잠금 → group_wallet_post 3P)와 탈퇴 시작을 두 순서로.
#    선행 지급은 한 번 보존, 비활성화 뒤 신규 지급 0, 교착 0, 완료(감싸개) 뒤 케미 줄·개인정보 0.
#    지갑 출처 허용은 이 일회용 DB 안에서만 켠다(reward_race.sh 와 같은 방식).
$P -c "update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,
  migration_evidence_sha256=repeat('a',64),rewards_start_on=public.dukjil_kst_date()" >/dev/null
for i in 1 2 3 4; do
  U=cae00000-0000-4000-8000-0000000000$(printf %02d $i); S=did:privy:chemi-race-10-$i
  user "$U" "$S"
  $P -c "begin; set local session_replication_role=replica;
    insert into public.fan_passports(app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values('$U','$U',gen_random_uuid(),gen_random_uuid()); commit" >/dev/null
  if [ $((i % 2)) = 0 ]; then a=0; b=0.3; else a=0.3; b=0; fi
  ($P -At -c "begin; select pg_sleep($a); select public.chemi_complete_reading('$U','fortune','daily','changha','$U','','{}','v1','v1'); select pg_sleep(0.6); commit;" >"$OUT/p$i" 2>&1 || true) &
  ($P -At -c "$(begin_sql "$S" $b)" >"$OUT/q$i" 2>&1 || true) &
  wait
  ! grep -q "deadlock" "$OUT/p$i" "$OUT/q$i" || fail "⑦d.$i deadlock"
  grep -q '"status" *: *"pending"' "$OUT/q$i" || fail "⑦d.$i begin: $(cat "$OUT/q$i")"
  paid=$($P -At -c "select count(*) from public.mobile_fan_economy_ledger where app_user_id='$U' and source_type='chemi_reward'")
  if grep -q CHEMI_ACCOUNT_CLOSED "$OUT/p$i"; then [ "$paid" = 0 ] || fail "⑦d.$i paid after disable"; else [ "$paid" = 1 ] || fail "⑦d.$i reward before begin paid $paid"; fi
  # 비활성화 뒤 새 풀이·미지급 청구는 거절, 지급 수 그대로
  ! $P -At -c "select public.chemi_complete_reading('$U','star','daily','changha','$U','','{}','v1','v1')" >/dev/null 2>&1 || fail "⑦d.$i reading after disable"
  ! $P -At -c "select public.chemi_claim_pending_points('$U')" >/dev/null 2>&1 || fail "⑦d.$i claim after disable"
  [ "$($P -At -c "select count(*) from public.mobile_fan_economy_ledger where app_user_id='$U' and source_type='chemi_reward'")" = "$paid" ] || fail "⑦d.$i paid changed"
  TOKEN=$($P -At -c "select public.claim_account_deletion('$U')->>'leaseToken'")
  [ "$($P -At -c "select public.chemi_complete_account_deletion('$U','$TOKEN')")" = "t" ] || fail "⑦d.$i complete"
  left=$($P -At -c "select (select count(*) from public.chemi_readings where user_id='$U')+(select count(*) from public.chemi_point_grants where user_id='$U')
    +(select count(*) from public.chemi_daily_uses where user_id='$U')+(select count(*) from public.app_users where id='$U' and privy_user_id not like 'deleted:%')")
  [ "$left" = 0 ] || fail "⑦d.$i personal rows left $left"
  [ "$($P -At -c "select count(*) from public.mobile_fan_economy_ledger where app_user_id='$U' and source_type='chemi_reward'")" = "$paid" ] || fail "⑦d.$i ledger not preserved"
done
[ "$($P -At -c "select count(distinct (select count(*) from public.mobile_fan_economy_ledger l where l.app_user_id=u.id and l.source_type='chemi_reward')) from public.app_users u where u.id::text like 'cae00000-%'")" = 2 ] || fail "⑦d only one ordering was exercised"

echo "deletion_race DB-only ok; NOT VERIFIED: web ⑥, real payment ⑦, payment/webhook/manual resolve ⑧–⑩ (W1-PAY); D2 remains pending"
