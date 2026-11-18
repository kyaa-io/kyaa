#!/usr/bin/env bash
set -euo pipefail
sql() { psql -XAtq -v ON_ERROR_STOP=1 -c "$1"; }
[[ $(sql 'select current_database()') == byus_clean && "$PGHOST" == */byus-clean-db.*/socket ]]
u=ab100000-0000-4000-8000-000000000001
sql "insert into public.app_users(id,privy_user_id,verified_email) values('$u','did:privy:reward-race','reward@example.test')"
read_call="select public.chemi_complete_reading('$u','fortune','daily','changha','$u','','{}','v1','v1')"
race() {
  local ids=()
  for _ in {1..8}; do sql "$1" >/dev/null & ids+=("$!"); done
  for id in "${ids[@]}"; do wait "$id"; done
}
race "$read_call"
[[ $(sql "select count(*) from chemi_point_grants where user_id='$u'") == 1 ]]
[[ $(sql "select sum(exp_total) from chemi_minis where user_id='$u'") == 10 ]]
key=ab100000-0000-4000-8000-000000000002
race "select chemi_issue_play('$u','$key','run','changha',false)"
[[ $(sql "select count(*) from chemi_game_plays where user_id='$u'") == 1 ]]
if sql "select chemi_issue_play('$u',gen_random_uuid(),'run','changha',true)" ; then exit 1; fi
[[ $(sql "select count(*) from chemi_game_plays where user_id='$u' and slot_kind='extra'") == 0 ]]
echo "reward_race passed"

# Exercise the prospective D1 source allowlist only inside this disposable DB.
psql -Xq -v ON_ERROR_STOP=1 <<'SQL'
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,
  migration_evidence_sha256=repeat('a',64),rewards_start_on=current_date;
SQL
sql "select group_wallet_post('$u','fan_point',30,'group_support',gen_random_uuid())"
for used in 1 2; do
  if error=$(sql "select chemi_issue_play('$u',gen_random_uuid(),'run','changha',true)" 2>&1); then exit 1; fi
  [[ "$error" == *CHEMI_LIMIT* ]]
  [[ $(sql "select group_wallet_balance('$u','fan_point')") == 30 ]]
  sql "select chemi_issue_play('$u',gen_random_uuid(),'run','changha',false)"
done
# Feature-only checkouts run the pre-approval assertion first.
if [[ $(sql "select position('chemi_reward' in pg_get_functiondef('public.group_wallet_post(uuid,text,bigint,text,uuid)'::regprocedure))") == 0 ]]; then
  if error=$(sql "select chemi_issue_play('$u',gen_random_uuid(),'run','changha',true)" 2>&1); then exit 1; fi
  [[ "$error" == *CHEMI_UNAVAILABLE* ]]
  psql -Xq -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare def text:=pg_get_functiondef('public.group_wallet_post(uuid,text,bigint,text,uuid)'::regprocedure);
begin
  execute replace(def,'''group_support''','''chemi_reward'',''chemi_game_extra'',''chemi_game_refund'',''group_support''');
end $$;
SQL
fi
extra() { sql "select chemi_issue_play('$u','$1','run','changha',true)"; }
key=ab100000-0000-4000-8000-000000000003
race "select chemi_issue_play('$u','$key','run','changha',true)"
for _ in 1 2 3; do extra "$key" >/dev/null; done
[[ $(sql "select group_wallet_balance('$u','fan_point')") == 20 ]]
extra ab100000-0000-4000-8000-000000000004 & first=$!
extra ab100000-0000-4000-8000-000000000005 & second=$!
wait "$first"
wait "$second"
[[ $(sql "select group_wallet_balance('$u','fan_point')") == 0 ]]
expect_error() {
  local error
  if error=$(sql "$1" 2>&1); then return 1; fi
  [[ "$error" == *"$2"* ]]
}
expect_error "select chemi_issue_play('$u','$key','run','elina',true)" CHEMI_REQUEST_KEY_REUSED
expect_error "select chemi_issue_play('$u',gen_random_uuid(),'run','changha',true)" CHEMI_LIMIT
[[ $(sql "select count(*) from mobile_fan_economy_ledger where app_user_id='$u' and source_type='chemi_game_extra' and amount=-10") == 3 ]]
sql "select chemi_complete_reading('$u','saju','compat','dosa',null,'a','{}','v1','v1')"
sql "select chemi_complete_reading('$u','star','compat','dosa',null,'a','{}','v1','v1')"
expect_error "select chemi_complete_reading('$u','star','compat','dosa',null,'b','{}','v1','v1')" CHEMI_PAYMENT_REQUIRED
[[ $(sql "select chemi_participation()->>'count'") == 1 ]]
echo "R2 concurrency, daily limits, distinct participation passed"
# Isolate passport eligibility from the unrelated mint/quiz fixture graph.
sql "begin; set local session_replication_role=replica;
insert into fan_passports(app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)
values('$u','$u',gen_random_uuid(),gen_random_uuid()); commit"
race "select chemi_claim_pending_points('$u')"
[[ $(sql "select group_wallet_balance('$u','fan_point')") == 3 ]]
[[ $(sql "select count(*) from mobile_fan_economy_ledger where app_user_id='$u' and source_type='chemi_reward' and amount=3") == 1 ]]
echo "concurrent pending claims paid exactly 3P"
# Fix the day inside this throwaway database so the fifth day is always Friday.
sql "create or replace function public.dukjil_kst_date(p_at timestamptz default pg_catalog.clock_timestamp()) returns date language sql stable as 'select date ''2030-01-11'''"
sql "insert into chemi_exp_log(user_id,character,source,kst_date,exp)
select '$u','elina','fortune',date '2030-01-07'+n,10 from generate_series(0,3) n"
race "$read_call"
[[ $(sql "select count(*) from chemi_week_boxes where user_id='$u'") == 1 ]]
[[ $(sql "select sum(remaining) from chemi_pass_lots where user_id='$u' and bucket='weekly_free'") == 1 ]]
[[ $(sql "select count(*) from chemi_pass_ledger where user_id='$u' and reason='grant'") == 1 ]]
echo "concurrent fifth day granted one weekly pass"
[[ $(sql "select l.expires_at=b.achieved_at+interval '168 hours' from chemi_week_boxes b join chemi_pass_lots l on l.id=b.pass_lot_id where b.user_id='$u'") == t ]]
sql "update chemi_pass_lots set remaining=0,held=1 where user_id='$u' and bucket='weekly_free'"
race "$read_call"
[[ $(sql "select sum(remaining) from chemi_pass_lots where user_id='$u' and bucket='weekly_free'") == 0 ]]
day() {
  sql "create or replace function public.dukjil_kst_date(p_at timestamptz default pg_catalog.clock_timestamp())
    returns date language sql stable as 'select date ''$1'''"
}
# A dosa-only day and a replay cannot advance the new week's fifth favorite day.
day 2030-01-14
sql "select chemi_complete_reading('$u','star','daily','dosa',null,'','{}','v1','v1')"
for date in 15 16 17 18; do day "2030-01-$date"; sql "$read_call"; done
[[ $(sql "select count(*) from chemi_week_boxes where user_id='$u'") == 1 ]]
day 2030-01-19
race "$read_call"
day 2030-01-20
sql "$read_call"
[[ $(sql "select count(*) from chemi_pass_lots where user_id='$u' and closed_reason='replace' and held=1") == 1 ]]
[[ $(sql "select count(*) from chemi_pass_lots where user_id='$u' and closed_at is null and remaining=1") == 1 ]]
for date in 21 22 23 24 25; do day "2030-01-$date"; sql "$read_call"; done
[[ $(sql "select count(*) from chemi_pass_lots where user_id='$u' and closed_reason='replace' and held=0 and remaining=0") == 1 ]]
[[ $(sql "select count(*) from chemi_pass_lots where user_id='$u' and closed_at is null and remaining=1") == 1 ]]
echo "weekly replay, expiry, dosa exclusion and prior unused/held replacement passed"

# Hold the real wallet lock in the dukjil transaction while the new day's
# reading arrives. A reversed lock order must fail a session, never be retried.
day 2030-02-04
sql "update public.dukjil_policy_versions set status='active',effective_from=now()-interval '1 hour',activated_at=now() where version=1"
sql "begin; set local session_replication_role=replica;
insert into celebrities(id,slug,status,image_url,published_at,roles,primary_role)
values('$u','reward-race-creator','published','/fixture.webp',now(),'{artist}','idol'); commit"
sql "insert into user_wallets(app_user_id,chain_id,address,provider,wallet_type)
values('$u',91342,'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb9181','privy','embedded')"
# Stop between the two real locks: if the reading takes fan-web-user before
# wallet-owner, record_dukjil_action will complete the deadlock cycle.
PGAPPNAME=chemi-race-dukjil sql "begin;
select pg_advisory_xact_lock_shared(hashtextextended('group-wallet:campaign-barrier',0));
select pg_advisory_xact_lock(hashtextextended('group-wallet:owner:$u',0));
do \$\$ declare deadline timestamptz:=clock_timestamp()+interval '10 seconds'; begin
  loop
    perform pg_stat_clear_snapshot();
    exit when exists(select from pg_stat_activity where application_name='chemi-race-reading'
      and pg_backend_pid()=any(pg_blocking_pids(pid)));
    if clock_timestamp()>deadline then raise exception 'reading never contended for wallet'; end if;
    perform pg_sleep(0.02);
  end loop;
end \$\$;
select record_dukjil_action('$u','$u','proof','race-proof',gen_random_uuid()); commit" & dukjil=$!
# Wait until the competing session owns the wallet before starting the reading.
for attempt in {1..200}; do
  if [[ $(sql "select exists(select from pg_stat_activity a join pg_locks l using(pid)
    where a.application_name='chemi-race-dukjil' and l.locktype='advisory' and l.mode='ExclusiveLock' and l.granted)") == t ]]; then break; fi
  sleep 0.02
done
PGAPPNAME=chemi-race-reading sql "$read_call" & reading=$!
wait "$dukjil"
wait "$reading"
[[ $(sql "select points from chemi_point_grants where user_id='$u' and kst_date=dukjil_kst_date()") == 3 ]]
[[ $(sql "select points>0 from dukjil_action_log where app_user_id='$u' and source_key='race-proof'") == t ]]
[[ $(sql "select deadlocks from pg_stat_database where datname=current_database()") == 0 ]]
play=$(sql "select id from chemi_game_plays where user_id='$u' and request_key='$key'")
before=$(sql "select group_wallet_balance('$u','fan_point')")
race "select chemi_refund_play('$u','$play')"
[[ $(sql "select group_wallet_balance('$u','fan_point')") == $((before+10)) ]]
echo "same-user reading and dukjil award passed, deadlocks=0"
race "select chemi_complete_reading('$u','fortune','daily','elina','$u','','{}','v1','v1')"
[[ $(sql "select count(*) from chemi_readings where user_id='$u' and content='fortune' and kind='daily' and kst_date=dukjil_kst_date()") == 1 ]]
[[ $(sql "select points from chemi_point_grants where user_id='$u' and character='elina'") == 3 ]]
[[ $(sql "select exp_total from chemi_minis where user_id='$u' and character='elina'") == 10 ]]
[[ $(sql "select count(distinct seed) from chemi_game_plays where user_id='$u' and game='run'") == 1 ]]
free_play=$(sql "select id from chemi_game_plays where user_id='$u' and slot_kind='free' limit 1")
race "select chemi_refund_play('$u','$free_play')"
[[ $(sql "select status from chemi_game_plays where id='$free_play'") == refunded ]]
old_day=$(sql "select kst_date from chemi_game_plays where id='$free_play'")
day "$old_day"
run_seed=$(sql "select seed from chemi_game_plays where id='$free_play'")
[[ $(sql "select chemi_issue_play('$u',gen_random_uuid(),'run','yuna',false)->>'seed'") == "$run_seed" ]]
other=ab100000-0000-4000-8000-000000000009
sql "insert into app_users(id,privy_user_id,verified_email) values('$other','did:privy:course-other','course@example.test')"
[[ $(sql "select chemi_issue_play('$other',gen_random_uuid(),'run','elina',false)->>'seed'") == "$run_seed" ]]
day 2030-02-05
[[ $(sql "select chemi_issue_play('$other',gen_random_uuid(),'run','elina',false)->>'seed'") != "$run_seed" ]]
sql "$read_call"
race "select chemi_reading_context('$u','fortune','daily','','elina','$u')"
[[ $(sql "select chemi_reading_context('$u','fortune','daily','','elina','$u')#>'{saved,reward}'") == '{}' ]]
sql "select chemi_complete_reading('$u','star','daily','elina','$u','','{}','v1','v1')"
[[ $(sql "select sum(points) from chemi_point_grants where user_id='$u' and character='elina' and kst_date=dukjil_kst_date()") == 6 ]]
