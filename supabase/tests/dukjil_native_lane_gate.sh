#!/usr/bin/env bash
# 20261231120000/121000/122000 on copies of the chain just before them (byus_lane_pre, made by dukjil_native_lane_snapshot.sql):
#   lane_dev  - no Fan Action lane sign (as DEV on 11/17): new objects only, issuer/enqueue/claim/admit unchanged, 4 notices;
#   lane_prod - lane present but one enqueue anchor drifted (as a production drift): DRIFT, nothing changed.
set -euo pipefail
[[ "$PGHOST" == /* ]] || exit 2
M=supabase/migrations
FILES=("$M/20261231120000_dukjil_stamps_native_onchain.sql" "$M/20261231121000_dukjil_hold_release_progress.sql" "$M/20261231122000_dukjil_recovery_dispatch_cap.sql")
DEFS="select md5(pg_get_functiondef('public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)'::regprocedure))
  || md5(pg_get_functiondef('public.claim_blockchain_jobs(text,integer,integer,text[])'::regprocedure))
  || md5(pg_get_functiondef('public.dukjil_issue_stamp_base(uuid,uuid,public.community_stamp_kind,text,integer)'::regprocedure))
  || md5(pg_get_functiondef('public.admit_fan_action_dispatch(uuid,text)'::regprocedure))"
cleanup() { dropdb --if-exists lane_dev; dropdb --if-exists lane_prod; dropdb --if-exists byus_lane_pre; }
trap cleanup EXIT

createdb -T byus_lane_pre lane_dev
psql -X -q -v ON_ERROR_STOP=1 -d lane_dev <<'SQL'
do $$
begin
  if exists(select 1 from public.fan_action_bindings) or exists(select 1 from public.fan_action_producer_routes)
    or exists(select 1 from public.fan_action_outbox) then raise exception 'DUKJIL_NATIVE_TEST: pre-state has lane rows'; end if;
  alter table public.mint_dispatch_policy rename column legacy_credential_issuance_retired to devsim_retired;
  execute replace(pg_get_functiondef('public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)'::regprocedure),
    'p_action_code=12', 'p_action_code=99');
end $$;
SQL
before=$(psql -X -Atq -d lane_dev -c "$DEFS")
out=""
for f in "${FILES[@]}"; do out+=$(psql -X -q -1 -v ON_ERROR_STOP=1 -d lane_dev -f "$f" 2>&1); out+=$'\n'; done
notices=$(grep -c 'DUKJIL_NATIVE_LANE_ABSENT' <<<"$out" || true)
[[ "$notices" == 4 ]] || { echo "$out"; echo "DUKJIL_NATIVE_TEST: lane_dev notices=$notices, want 4" >&2; exit 1; }
after=$(psql -X -Atq -d lane_dev -c "$DEFS")
[[ "$before" == "$after" ]] || { echo 'DUKJIL_NATIVE_TEST: lane_dev changed a lane definition' >&2; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d lane_dev <<'SQL'
do $$
begin
  if to_regprocedure('public.run_community_stamp_recovery(text,integer)') is null
    or to_regprocedure('public.community_stamp_enqueue_native(uuid)') is null
    or to_regclass('public.community_stamp_recovery_items_outbox_idx') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='community_stamps'
      and column_name='onchain_retry_after') then raise exception 'DUKJIL_NATIVE_TEST: lane_dev missing new objects'; end if;
end $$;
SQL
echo "LANE_ABSENT_DEV_OK notices=$notices definitions unchanged"

createdb -T byus_lane_pre lane_prod
psql -X -q -v ON_ERROR_STOP=1 -d lane_prod <<'SQL'
do $$
declare d text := pg_get_functiondef('public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)'::regprocedure);
begin
  if position(E'  if p_action_code=12 then\n' in d) = 0 then raise exception 'DUKJIL_NATIVE_TEST: anchor 1 not in pre-state'; end if;
  execute replace(d, E'  if p_action_code=12 then\n', E'  if (p_action_code=12) then\n');
end $$;
SQL
if out=$(psql -X -q -1 -v ON_ERROR_STOP=1 -d lane_prod -f "${FILES[0]}" 2>&1); then
  echo 'DUKJIL_NATIVE_TEST: lane_prod applied despite a drifted anchor' >&2; exit 1; fi
grep -q 'DUKJIL_NATIVE_ENQUEUE_PATCH_DRIFT: 1' <<<"$out" || { echo "$out" >&2; exit 1; }
! grep -q 'DUKJIL_NATIVE_LANE_ABSENT' <<<"$out" || { echo 'DUKJIL_NATIVE_TEST: lane_prod skipped' >&2; exit 1; }
[[ $(psql -X -Atq -d lane_prod -c "select count(*) from information_schema.columns where table_schema='public' and table_name='community_stamps' and column_name='onchain_hold_reason'") == 0 ]] \
  || { echo 'DUKJIL_NATIVE_TEST: lane_prod kept partial changes' >&2; exit 1; }
echo "LANE_PRESENT_DRIFT_STOP_OK"
