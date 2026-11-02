#!/usr/bin/env bash
set -euo pipefail
# Only invoked against verify-clean-migration-chain.sh's disposable Unixsocket DB.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
psql -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/group_gifts_race_fixture.sql" >/dev/null
RACE_WORK="$(mktemp -d "${TMPDIR:-/tmp}/gift-stock-race.XXXXXX")"
for actor in 1 2; do
 (
  psql -X -v ON_ERROR_STOP=1 -c "begin; select public.group_raffle_dispatch('create','e9740000-0000-4000-8000-00000000000${actor}','e9740000-0000-4000-8000-000000000003',null,jsonb_build_object('requestId',gen_random_uuid(),'giftApplicationId','e9740000-0000-4000-8000-000000000005','winnerQuantity',60,'perUserLimit',2,'closesAt',clock_timestamp()+interval '1 day','submissionDays',7)); select pg_sleep(0.3);commit;" >"$RACE_WORK/$actor.log" 2>&1 && echo success >"$RACE_WORK/$actor.result" || echo rejected >"$RACE_WORK/$actor.result"
 ) &
done
wait
successes=$(cat "$RACE_WORK/1.result" "$RACE_WORK/2.result" | awk '$0=="success"{n++}END{print n+0}')
if [[ "$successes" != 1 ]]; then cat "$RACE_WORK/1.log" "$RACE_WORK/2.log"; exit 1; fi
rg -q GROUP_GIFT_STOCK "$RACE_WORK"/*.log
psql -X -v ON_ERROR_STOP=1 <<'SQL'
do $$begin
 if(select sum(winner_quantity)from public.group_raffles where gift_application_id='e9740000-0000-4000-8000-000000000005'and cancelled_at is null)<>60 or(select count(*)from public.group_action_receipts where operation='raffle:create'and actor_id in('e9740000-0000-4000-8000-000000000001','e9740000-0000-4000-8000-000000000002'))<>1 then raise exception 'Concurrent stock/receipt invariant failed';end if;
 raise notice 'PASS concurrent gift-backed raffles reserve stock atomically; loser creates no receipt';
end $$;
SQL
