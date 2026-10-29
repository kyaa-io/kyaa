#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
psql -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/verified_onchain_snapshot.sql"
fixture=$(psql -X -At -v ON_ERROR_STOP=1 -c "select jsonb_build_object('public',public_payload,'dashboard',dashboard_payload) from public.onchain_verified_snapshot")
run_dir=$(mktemp -d)
trap 'rm -f "$run_dir/inserted" "$run_dir/first.log"; rmdir "$run_dir"' EXIT
psql -X -v ON_ERROR_STOP=1 -c 'delete from public.onchain_verified_snapshot; delete from public.onchain_dashboard_snapshot;'
psql -X -v ON_ERROR_STOP=1 -v fixture="$fixture" >"$run_dir/first.log" <<SQL &
begin;
select public.replace_onchain_verified_snapshot(:'fixture'::jsonb->'public',:'fixture'::jsonb->'dashboard');
\! touch "$run_dir/inserted"
select pg_sleep(0.5);
commit;
SQL
first_pid=$!
for _ in $(seq 1 100); do [[ -f "$run_dir/inserted" ]] && break; sleep 0.02; done
[[ -f "$run_dir/inserted" ]] || { wait "$first_pid"; exit 1; }
psql -X -v ON_ERROR_STOP=1 -v fixture="$fixture" <<'SQL'
select public.replace_onchain_verified_snapshot(jsonb_set(:'fixture'::jsonb->'public','{snapshot,blockNumber}','"103"'),jsonb_set(:'fixture'::jsonb->'dashboard','{blockNumber}','"103"'));
do $$begin
  if (select count(*) from public.onchain_verified_snapshot)<>1
    or (select block_number from public.onchain_verified_snapshot)<>103
    or (select dashboard_payload->>'blockNumber' from public.onchain_verified_snapshot)<>'103'
    or (select payload->>'blockNumber' from public.onchain_dashboard_snapshot)<>'103' then
    raise exception 'concurrent first publication lost atomicity'; end if;
end $$;
SQL
wait "$first_pid"
