#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
psql -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/group_event_application_race_fixture.sql" >/dev/null
RACE_WORK="$(mktemp -d "${TMPDIR:-/tmp}/event-application-race.XXXXXX")"
for lane in 1 2;do
 (
 psql -X -v ON_ERROR_STOP=1 -c "begin;select public.group_activities_dispatch('event-apply','e9770000-0000-4000-8000-00000000000${lane}','e9770000-0000-4000-8000-000000000004','e9770000-0000-4000-8000-000000000005',null,jsonb_build_object('requestId','e9770000-0000-4000-8000-00000000001${lane}','applicationMessage','Original note ${lane}'));select pg_sleep(0.2);commit;" >"$RACE_WORK/$lane.log" 2>&1&&echo success >"$RACE_WORK/$lane.result"||echo rejected >"$RACE_WORK/$lane.result"
 ) &
done
wait
successes=$(cat "$RACE_WORK/1.result" "$RACE_WORK/2.result"|awk '$0=="success"{n++}END{print n+0}')
if [[ "$successes" != 1 ]];then cat "$RACE_WORK/1.log" "$RACE_WORK/2.log";exit 1;fi
rg -q GROUP_ACTIVITY_CAPACITY "$RACE_WORK"/*.log
psql -X -v ON_ERROR_STOP=1 <<'SQL'
do $$begin
 if(select count(*)from public.group_event_registrations where event_id='e9770000-0000-4000-8000-000000000005'and status='confirmed')<>1 or(select count(*)from public.group_activity_receipts where request_id in('e9770000-0000-4000-8000-000000000011','e9770000-0000-4000-8000-000000000012'))<>1 or exists(select 1 from public.group_event_registrations where event_id='e9770000-0000-4000-8000-000000000005'and application_message<>case when app_user_id='e9770000-0000-4000-8000-000000000001'then'Original note 1'else'Original note 2'end)then raise exception 'Application capacity/message/receipt invariant failed';end if;
 raise notice 'PASS concurrent applications preserve capacity1, one exact winner note and one receipt; loser writes nothing';
end $$;
SQL
