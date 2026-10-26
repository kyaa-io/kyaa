#!/usr/bin/env bash
set -euo pipefail
: "${PGHOST:?}" "${PGPORT:?}" "${PGDATABASE:?}"
if [[ "$PGDATABASE" != byus_clean || "$PGHOST" != /*/byus-clean-db.*/socket || ! -S "$PGHOST/.s.PGSQL.$PGPORT" || -n "${PGHOSTADDR:-}${PGSERVICE:-}" ]]; then
  echo 'Disposable local database required' >&2
  exit 1
fi
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$root_dir/supabase/migrations/20261208020000_search_indexnow_retired_paths.sql"
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
update public.search_indexnow_state
set snapshot = (
  select jsonb_object_agg('https://kyaa.io' || path || '?locale=' || locale, 'retired-' || path || '-' || locale)
  from unnest(array['/support', '/fandom', '/pages/live-dashboard']) paths(path)
  cross join unnest(array['ko', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'id', 'vi', 'th', 'pt', 'fr']) locales(locale)
) || '{"https://kyaa.io/?locale=ko":"valid-home-hash","https://kyaa.io/notices?locale=en":"valid-notice-hash"}'::jsonb,
lease_token = '11111111-1111-4111-8111-111111111111',
lease_until = clock_timestamp() + interval '1 hour',
acknowledged_at = '2026-10-19T01:02:03Z';
do $$ begin
  assert (select count(*) = 35 from public.search_indexnow_state, jsonb_object_keys(snapshot));
end $$;
SQL
before_state="$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'select row_to_json(s)::text from public.search_indexnow_state s')"
if failure_output="$(psql -X -v ON_ERROR_STOP=1 -q -f "$migration" 2>&1)"; then
  echo 'Active lease unexpectedly allowed cache repair' >&2
  exit 1
fi
[[ "$failure_output" == *INDEXNOW_CACHE_REPAIR_LEASE_ACTIVE* ]]
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'select row_to_json(s)::text from public.search_indexnow_state s')" == "$before_state" ]]
psql -X -v ON_ERROR_STOP=1 -v migration="$migration" -q <<'SQL'
begin;
update public.search_indexnow_state set lease_until = '2026-01-01T00:00:00Z';
create temporary table expected_state as
select id, '{"https://kyaa.io/?locale=ko":"valid-home-hash","https://kyaa.io/notices?locale=en":"valid-notice-hash"}'::jsonb as snapshot,
  lease_token, lease_until, acknowledged_at from public.search_indexnow_state;
\i :migration
do $$ begin
  assert (select to_jsonb(s) = to_jsonb(e) from public.search_indexnow_state s cross join expected_state e), 'Only the 33 retired keys may change';
end $$;
\i :migration
do $$ begin
  assert (select to_jsonb(s) = to_jsonb(e) from public.search_indexnow_state s cross join expected_state e), 'Repair must be idempotent';
end $$;
update public.search_indexnow_state set lease_until = clock_timestamp() + interval '1 hour';
truncate expected_state;
insert into expected_state select * from public.search_indexnow_state;
\i :migration
do $$ begin
  assert (select to_jsonb(s) = to_jsonb(e) from public.search_indexnow_state s cross join expected_state e), 'Unrelated keys must be a no-op even with an active lease';
end $$;
update public.search_indexnow_state set snapshot = '{}';
truncate expected_state;
insert into expected_state select * from public.search_indexnow_state;
\i :migration
do $$ begin
  assert (select to_jsonb(s) = to_jsonb(e) from public.search_indexnow_state s cross join expected_state e), 'Empty snapshot must be a no-op even with an active lease';
end $$;
delete from public.search_indexnow_state;
\i :migration
do $$ begin
  assert not exists(select from public.search_indexnow_state), 'Missing state must remain absent';
end $$;
rollback;
SQL
printf '%s\n' 'IndexNow retired paths: active lease rollback, exact removal, metadata preservation and no-op cases passed.'
