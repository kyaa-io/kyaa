#!/usr/bin/env bash
set -euo pipefail
[[ "$PGHOST" == /* ]] || exit 2
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/dukjil_stamps_starvation.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/dukjil_stamps_native_onchain.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/dukjil_stamps_dispatch_cap_counterexample.sql
createdb -T "$PGDATABASE" byus
PGDATABASE=byus psql -X -v ON_ERROR_STOP=1 -f supabase/tests/onchain-stamps-xreview/sequence.sql
bash supabase/tests/dukjil_stamps_native_onchain_concurrency.sh
bash supabase/tests/dukjil_native_lane_gate.sh
psql -X -v ON_ERROR_STOP=1 -f supabase/rollback/20261231122000_dukjil_recovery_dispatch_cap.sql
psql -X -v ON_ERROR_STOP=1 -c "do \$\$ begin if position('COMMUNITY_STAMP_RECOVERY_DAILY_LIMIT' in pg_get_functiondef('public.admit_fan_action_dispatch(uuid,text)'::regprocedure))>0 or to_regclass('public.community_stamp_recovery_items_outbox_idx') is not null then raise exception 'cap rollback incomplete'; end if; raise notice 'CAP_ROLLBACK_OK'; end \$\$"
psql -X -v ON_ERROR_STOP=1 -f supabase/rollback/20261231120000_dukjil_stamps_native_onchain.sql
psql -X -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare s uuid;
begin
 s:=public.dukjil_issue_stamp('0c600000-0000-4000-8000-000000000002','0c610000-0000-4000-8000-000000000001','quiz','xreview:rollback',2);
 if not exists(select 1 from public.community_stamps where id=s and onchain_hold_reason='ROUTE_DISABLED' and fan_action_outbox_id is null and blockchain_job_id is null) then raise exception 'rollback did not hold'; end if;
 begin
  perform public.release_held_community_stamps(null,200);
  raise exception 'release unexpectedly available';
 exception when others then
  if sqlerrm <> 'COMMUNITY_STAMP_RELEASE_STOPPED' then raise; end if;
 end;
 begin
  perform public.run_community_stamp_recovery('unused',10);
  raise exception 'recovery unexpectedly available';
 exception when others then
  if sqlerrm <> 'COMMUNITY_STAMP_RECOVERY_STOPPED' then raise; end if;
 end;
 raise notice 'ROLLBACK_STOP_OK';
end $$;
SQL
