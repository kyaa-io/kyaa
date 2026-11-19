#!/usr/bin/env bash
# Disposable local database only. Concurrent purchases must neither double-charge nor overdraw.
set -euo pipefail
sql() { psql -XAtq -v ON_ERROR_STOP=1 -c "$1"; }
sql "update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('a',64),rewards_start_on=current_date"
member=ab200000-0000-4000-8000-000000000001
order=ab200000-0000-4000-8000-0000000000a1
sql "insert into public.app_users(id,privy_user_id,verified_email) values('$member','did:privy:pay-race','pay-race@example.test')"
sql "insert into public.chemi_point_orders(id,user_id) values('$order','$member')"
sql "select public.chemi_settle_point_order('$member','$order','dev_points_100',1000,'DONE')"
day=$(sql "select public.dukjil_kst_date()+1")
payload='{"locked":false,"score":75}'
buy() { sql "select public.chemi_point_date('$member','dosa','$1','$payload','test')"; }
balances() { sql "select activity_points||'/'||paid_points||'/'||total_points from public.chemi_point_balances('$member')"; }
race() {
  local ids=()
  for _ in {1..8}; do "$@" >/dev/null & ids+=("$!"); done
  for id in "${ids[@]}"; do wait "$id"; done
}
echo "before same-day race: $(balances)"
race buy "$day"
echo "after 8 concurrent buys of one day: $(balances) entitlements=$(sql "select count(*) from public.chemi_entitlements where user_id='$member'")"
[[ $(balances) == 0/97/97 ]]
[[ $(sql "select count(*) from public.chemi_entitlements where user_id='$member'") == 1 ]]
[[ $(sql "select count(*) from public.chemi_paid_point_ledger where user_id='$member' and reason='chemi_purchase'") == 1 ]]
# Leave 4 paid points and race eight different days: only one 3P purchase can fit.
sql "insert into public.chemi_paid_point_ledger(user_id,reason,purchase_id,amount) values('$member','chemi_purchase',gen_random_uuid(),-93)"
[[ $(balances) == 0/4/4 ]]
for n in 2 3 4 5 6 7 8 9; do d=$(sql "select '$day'::date+$n"); buy "$d" >/dev/null & done; wait
echo "after 8 concurrent buys of different days with 4P: $(balances) entitlements=$(sql "select count(*) from public.chemi_entitlements where user_id='$member'")"
[[ $(balances) == 0/1/1 ]]
[[ $(sql "select count(*) from public.chemi_entitlements where user_id='$member'") == 2 ]]
# After an approved top-up, repeated cancel and late approval notices racing each other must refund exactly once.
order2=ab200000-0000-4000-8000-0000000000a2
sql "insert into public.chemi_point_orders(id,user_id) values('$order2','$member')"
sql "select public.chemi_settle_point_order('$member','$order2','dev_points_100',1000,'DONE')" >/dev/null
for state in CANCELED DONE CANCELED DONE; do sql "select public.chemi_settle_point_order('$member','$order2','dev_points_100',1000,'$state')" >/dev/null & done; wait
echo "after DONE, then racing CANCELED/DONE x4: $(balances)"
[[ $(balances) == 0/1/1 ]]
echo "point_purchase_race passed"
