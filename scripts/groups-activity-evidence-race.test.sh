#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
psql -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/group_activity_evidence_race_fixture.sql" >/dev/null
RACE_WORK="$(mktemp -d "${TMPDIR:-/tmp}/activity-evidence-race.XXXXXX")"
for lane in 1 2;do
 psql -X -v ON_ERROR_STOP=1 -c "begin;select public.group_activities_dispatch('mission-submit','e9750000-0000-4000-8000-000000000003','e9750000-0000-4000-8000-000000000004','e9750000-0000-4000-8000-000000000005',null,'{\"requestId\":\"e9750000-0000-4000-8000-000000000010\",\"body\":\"Original race description\",\"imageAssetId\":\"e9750000-0000-4000-8000-000000000006\",\"originalAttested\":true,\"expectedMissionRevision\":1}');select pg_sleep(0.2);commit;" >"$RACE_WORK/submit-$lane.log" 2>&1 &
done
wait
psql -X -v ON_ERROR_STOP=1 <<'SQL'
do $$begin if(select count(*)from public.group_mission_submissions where mission_id='e9750000-0000-4000-8000-000000000005')<>1 or(select count(*)from public.group_activity_evidence where asset_id='e9750000-0000-4000-8000-000000000006')<>1 or(select count(*)from public.group_activity_receipts where request_id='e9750000-0000-4000-8000-000000000010')<>1 then raise exception 'Concurrent submit duplicate';end if;raise notice 'PASS concurrent identical submit has one submission/revision/evidence/receipt';end $$;
SQL
for actor in 1 2;do
 (
 psql -X -v ON_ERROR_STOP=1 -c "begin;select public.group_activities_dispatch('mission-review','e9750000-0000-4000-8000-00000000000${actor}','e9750000-0000-4000-8000-000000000004','e9750000-0000-4000-8000-000000000005',(select id from public.group_mission_submissions where mission_id='e9750000-0000-4000-8000-000000000005'),jsonb_build_object('requestId',gen_random_uuid(),'action','approve','expectedSubmissionRevision',1));select pg_sleep(0.2);commit;" >"$RACE_WORK/review-$actor.log" 2>&1 && echo success >"$RACE_WORK/review-$actor.result" || echo rejected >"$RACE_WORK/review-$actor.result"
 ) &
done
wait
successes=$(cat "$RACE_WORK/review-1.result" "$RACE_WORK/review-2.result" | awk '$0=="success"{n++}END{print n+0}')
if [[ "$successes" != 1 ]];then cat "$RACE_WORK"/review-*.log;exit 1;fi
rg -q GROUP_ACTIVITY_CONFLICT "$RACE_WORK"/review-*.log
psql -X -v ON_ERROR_STOP=1 <<'SQL'
do $$begin if public.group_wallet_balance('e9750000-0000-4000-8000-000000000003','fan_point')<>50 or(select count(*)from public.group_mission_submission_reviews where submission_id=(select id from public.group_mission_submissions where mission_id='e9750000-0000-4000-8000-000000000005'))<>1 then raise exception 'Concurrent review reward/history duplicate';end if;raise notice 'PASS concurrent reviewers credit existing configured reward exactly once';end $$;
SQL
