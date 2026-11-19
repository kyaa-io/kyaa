#!/usr/bin/env bash
# 케미 r4 업그레이드 시험(R4C §12.4 U1·U2·U3·U3b·U4·U11, R4B §12.4 준비·단언). 실제 PostgreSQL.
# r4 core 바로 앞까지 재생한 일회용 DB 에서 돈다:
#   BYUS_CLEAN_DB_SHELL_ASSERTION_BEFORE_MIGRATION=20270112000000_chemi_r4_core.sql \
#   BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=supabase/tests/chemi/r4_upgrade.sh bash scripts/verify-clean-migration-chain.sh
# 그 DB 를 틀로 복사본 둘(byus_chemi_up_a·_b)을 만들어 core·profile_fn 을 직접 적용하고, 끝에 지운다(본 재생은 그대로 이어진다).
# U5~U10 은 reward_fn(REWARD-2) 뒤에 켠다. U12 는 r4_profile.sql B 절.
set -euo pipefail
[[ "$PGDATABASE" == byus_clean && "$PGHOST" == */byus-clean-db.*/socket ]]
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CORE="$R/supabase/migrations/20270112000000_chemi_r4_core.sql"
PROFILE="$R/supabase/migrations/20270112010000_chemi_r4_profile_fn.sql"
[ "$(psql -XAt -c "select to_regclass('public.chemi_daily_uses') is null")" = t ]
OUT=$(mktemp -d)
cleanup() { for d in byus_chemi_up_a byus_chemi_up_b; do dropdb --if-exists "$d" >/dev/null 2>&1 || true; done; rm -rf "$OUT"; }
trap cleanup EXIT
fail() { echo "r4_upgrade failed: $*"; exit 1; }
createdb -T "$PGDATABASE" byus_chemi_up_a
createdb -T "$PGDATABASE" byus_chemi_up_b

U1=ad100000-0000-4000-8000-000000000001; U2=ad100000-0000-4000-8000-000000000002
PA=ad200000-0000-4000-8000-00000000000a; PB=ad200000-0000-4000-8000-00000000000b
seed() { # db — 프로필 2 · 상대 2 · 상대 번호 열쇠 궁합 줄(오늘·어제) · sound_on true 상태 줄 · 차트 1 · 도사 풀이 1
  psql -X -q -v ON_ERROR_STOP=1 -d "$1" <<SQL
insert into public.app_users(id,privy_user_id,verified_email) values('$U1','did:privy:r4-up-1','r4up1@example.test'),('$U2','did:privy:r4-up-2','r4up2@example.test');
insert into public.chemi_profiles(user_id,birth_date,calendar,time_precision,consent_version,consent_at)
  values('$U1','1995-05-05','solar','unknown','v1',now()),('$U2','1996-06-06','solar','unknown','v1',now());
insert into public.chemi_partners(id,user_id,nickname,birth_date,calendar,time_precision,source)
  values('$PA','$U1','가','1997-01-01','solar','unknown','saju'),('$PB','$U1','나','1998-01-01','solar','unknown','star');
insert into public.chemi_user_state(user_id,last_character) values('$U1','changha');
insert into public.chemi_charts(user_id,kind,chart,engine_version) values('$U1','saju','{"p":1}','e1');
insert into public.chemi_readings(user_id,content,kind,character,kst_date,target_key,result,engine_version,table_version) values
  ('$U1','saju','compat','changha',public.dukjil_kst_date(),'$PA','{}','e','t'),
  ('$U1','star','compat','changha',public.dukjil_kst_date()-1,'$PB','{}','e','t'),
  ('$U1','saju','compat','changha',public.dukjil_kst_date()-5,'$PB','{}','e','t'),
  ('$U2','fortune','daily','dosa',public.dukjil_kst_date(),'','{}','e','t');
SQL
}
q() { psql -XAtq -v ON_ERROR_STOP=1 -d "$1" -c "$2"; }
svc() { psql -XAtq -v ON_ERROR_STOP=1 -d "$1" -c "set role service_role; $2"; }

# ── A: U3(옛 트랜잭션이 사용자 잠금만 잡고 멈춘 사이 core 커밋) → U1 · U2 · U4 ──
A=byus_chemi_up_a; seed $A
(psql -XAtq -v ON_ERROR_STOP=1 -d $A -c "begin; select public.chemi_lock_user('$U2', true); select pg_sleep(2);
  select public.chemi_complete_reading('$U2','saju','compat','changha',null,'u3-target','{}','e','t'); commit;" >"$OUT/u3" 2>&1; echo "rc=$?" >>"$OUT/u3") &
sleep 0.5
psql -X -q -v ON_ERROR_STOP=1 -d $A -f "$CORE" >"$OUT/core_a" 2>&1 || fail "U3 core apply: $(cat "$OUT/core_a")"
wait
grep -q 'rc=0' "$OUT/u3" || fail "U3 old txn: $(cat "$OUT/u3")"
[ "$(q $A "select count(*) from public.chemi_readings where user_id='$U2' and kind='compat'")" = 1 ] || fail "U3 old row"
[ "$(q $A "select item_key like 'legacy:%' from public.chemi_daily_uses where user_id='$U2' and bucket='compat_free'")" = t ] || fail "U3 ledger missed the old write"
echo "U3 ok: old write after core commit went to the ledger via trigger"

# U1 이관·백필 단언
[ "$(q $A "select count(distinct birth_rev) from public.chemi_profiles")" = 2 ] || fail "U1 profile birth_rev"
[ "$(q $A "select count(distinct rev) from public.chemi_partners")" = 2 ] || fail "U1 partner rev"
[ "$(q $A "select count(*) from (select birth_rev x from public.chemi_profiles union select rev from public.chemi_partners) s")" = 4 ] || fail "U1 rev overlap"
[ "$(q $A "select count(*) from public.chemi_daily_uses where user_id='$U1' and item_key like 'legacy:%'")" = 2 ] || fail "U1 ledger migrated rows (today+yesterday only)"
[ "$(q $A "select count(*) from public.chemi_user_state where sound_on is not null")" = 0 ] || fail "U1 sound_on"
[ "$(q $A "select string_agg(id::text||'='||compat_first_date::text, ',' order by id) from public.chemi_partners")" = \
  "$PA=$(q $A "select public.dukjil_kst_date()"),$PB=$(q $A "select public.dukjil_kst_date()-5")" ] || fail "U1 compat_first_date"
[ "$(q $A "select count(*) from public.chemi_charts where birth_rev is null")" = 1 ] || fail "U1 old chart keeps null birth_rev"
# 옛 함수를 service_role 로(core 만으로 선다)
svc $A "select public.chemi_save_birth('$U2','1996-06-07','solar',null,'unknown',null,null,'v1')" >/dev/null || fail "U1 chemi_save_birth"
[ "$(q $A "select birth_rev > (select max(rev) from public.chemi_partners) from public.chemi_profiles where user_id='$U2'")" = t ] || fail "U1 trigger raised birth_rev"
svc $A "select public.chemi_reading_context('$U1','saju','compat','$PA','changha')" >/dev/null || fail "U1 chemi_reading_context"
svc $A "select public.chemi_complete_reading('$U1','fortune','daily','changha',null,'','{}','e','t')" >/dev/null || fail "U1 chemi_complete_reading"
svc $A "select public.chemi_add_partner('$U2','다','1990-01-01','solar',null,'unknown',null,'saju')" >/dev/null || fail "U1 chemi_add_partner"
svc $A "select public.chemi_save_reading('$U1','star','daily','changha',null,'','{}','e','t',public.dukjil_kst_date())" >/dev/null || fail "U1 chemi_save_reading"
# 옛 열쇠 줄 상세 조회
LEGACY=$(q $A "select id from public.chemi_readings where user_id='$U1' and target_key='$PA'")
svc $A "select public.chemi_reading_detail('$U1','$LEGACY','changha')" >/dev/null || fail "U1 legacy detail"
echo "U1 ok: core alone keeps old RPCs working; backfill/migration asserted"
# U2 core 뒤 옛 함수로 무료 궁합(상대 X, 사용자 U2 는 이미 U3 에서 1회) → 다른 날짜 없음이므로 새 사용자로
U3U=ad100000-0000-4000-8000-000000000003
q $A "insert into public.app_users(id,privy_user_id,verified_email) values('$U3U','did:privy:r4-up-3','r4up3@example.test')" >/dev/null
svc $A "select public.chemi_complete_reading('$U3U','star','compat','changha',null,'x-target','{}','e','t')" >/dev/null || fail "U2 old compat"
[ "$(q $A "select count(*) from public.chemi_daily_uses where user_id='$U3U' and bucket='compat_free' and item_key like 'legacy:%'")" = 1 ] || fail "U2 ledger"
echo "U2 ok"
# U4 profile_fn → v2 성공 · 옛 풀이 성공 · 옛 chemi_save_birth 42501
psql -X -q -v ON_ERROR_STOP=1 -d $A -f "$PROFILE" >/dev/null || fail "U4 profile_fn apply"
svc $A "select public.chemi_save_birth_v2('$U3U','1990-02-02','solar',null,'unknown',null,null,null,null,null,null,null,'v1')" >/dev/null || fail "U4 v2"
svc $A "select public.chemi_complete_reading('$U3U','fortune','daily','changha',null,'','{}','e','t')" >/dev/null || fail "U4 old reading"
for call in "chemi_save_birth('$U3U','1990-02-03','solar',null,'unknown',null,null,'v1')" \
  "chemi_add_partner('$U3U','라','1990-01-01','solar',null,'unknown',null,'saju')" "chemi_delete_partner('$U3U','$PA')"; do
  if err=$(svc $A "select public.$call" 2>&1); then fail "U4 old $call still executable"; fi
  grep -q 'permission denied' <<<"$err" || fail "U4 $call: $err"
done
echo "U4 ok: old profile RPCs 42501 for service_role, v2 and old reading RPCs work"

# ── B: U3b(옛 궁합 쓰기가 커밋 전에 멈춤 → core 가 기다림) · U11(core 중 읽기) ──
B=byus_chemi_up_b; seed $B
# 7초 붙잡으면 core 는 5초 lock_timeout 으로 실패하고, 옛 커밋 뒤 다시 돌리면 같은 결과
(psql -XAtq -d $B -c "begin; select public.chemi_complete_reading('$U2','saju','compat','changha',null,'u3b-long','{}','e','t'); select pg_sleep(7); commit;" >"$OUT/long" 2>&1) &
sleep 0.5
if psql -X -q -v ON_ERROR_STOP=1 -d $B -f "$CORE" >"$OUT/core_b1" 2>&1; then fail "U3b core did not time out"; fi
grep -q 'lock timeout' "$OUT/core_b1" || fail "U3b expected lock timeout: $(cat "$OUT/core_b1")"
wait
[ "$(q $B "select to_regclass('public.chemi_daily_uses') is null")" = t ] || fail "U3b failed core left objects"
U4U=ad100000-0000-4000-8000-000000000004
q $B "insert into public.app_users(id,privy_user_id,verified_email) values('$U4U','did:privy:r4-up-4','r4up4@example.test')" >/dev/null
# 2초 붙잡으면 core 가 기다렸다가 이관이 그 줄을 장부에 옮긴다. 그사이 읽는 세션은 커밋 뒤 성공(U11)
(psql -XAtq -d $B -c "begin; select public.chemi_complete_reading('$U4U','star','compat','changha',null,'u3b-short','{}','e','t'); select pg_sleep(2); commit;" >"$OUT/short" 2>&1) &
sleep 0.5
(psql -X -q -v ON_ERROR_STOP=1 -d $B -f "$CORE" >"$OUT/core_b2" 2>&1; echo "rc=$?" >>"$OUT/core_b2") &
sleep 0.5
(psql -XAtq -v ON_ERROR_STOP=1 -d $B -c "select count(*) from public.chemi_readings" >"$OUT/reader" 2>&1; echo "rc=$?" >>"$OUT/reader") &
wait
grep -q 'rc=0' "$OUT/core_b2" || fail "U3b core retry: $(cat "$OUT/core_b2")"
grep -q 'rc=0' "$OUT/reader" || fail "U11 reader: $(cat "$OUT/reader")"
for who in $U2 $U4U; do  # U2: 시간 초과 뒤 커밋된 쓰기 · U4U: core 가 기다린 쓰기
  [ "$(q $B "select count(*) from public.chemi_readings where user_id='$who' and kind='compat'")" = 1 ] || fail "U3b compat rows $who"
  [ "$(q $B "select item_key from public.chemi_daily_uses where user_id='$who' and bucket='compat_free'")" = \
    "legacy:$(q $B "select id from public.chemi_readings where user_id='$who' and kind='compat'")" ] || fail "U3b ledger row $who"
done
echo "U3b ok: core waits (or times out at 5s and reruns) and migrates the in-flight old write; U11 reader succeeded after commit"
echo "r4_upgrade ok (U1 U2 U3 U3b U4 U11; U5-U10 need reward_fn, U12 in r4_profile.sql)"
