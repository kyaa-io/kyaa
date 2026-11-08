#!/usr/bin/env bash
# 20261216050000 applied with the history reader owned by a non-superuser (BYPASSRLS like dev postgres, or none in strict mode), then the
# reader called for a member with check-ins: every check-in row names its fan page, other rows carry no pageName. Then the rollback.
# One transaction, rolled back, roles included. usage: wallet_history_checkin_page_nonsuper.sh [strict]
# Local: PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper. Database: byus.
set -euo pipefail
MODE="${1:-dev}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
strip() { grep -v -x -e 'begin;' -e 'commit;' -e "notify pgrst, 'reload schema';"; }
strip < "$ROOT/supabase/migrations/20261216050000_wallet_history_checkin_page.sql" > "$TMP/m.sql"
strip < "$ROOT/supabase/rollback/20261216050000_wallet_history_checkin_page.sql" > "$TMP/rb.sql"
BYPASS=bypassrls; [ "$MODE" = strict ] && BYPASS=nobypassrls
psql -X -q -v ON_ERROR_STOP=1 -d byus <<SQL
begin;
set local lock_timeout = '20s';
create role f5_owner nologin nosuperuser $BYPASS;
grant usage on schema public, extensions to f5_owner;
grant select on all tables in schema public to f5_owner;
grant execute on all functions in schema public to f5_owner;
alter function public.read_owned_group_wallet_history(uuid,integer) owner to f5_owner;
alter table public.group_pages owner to localsuper;
\i $TMP/m.sql
select (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.read_owned_group_wallet_history(uuid,integer)'::regprocedure) as owner,
       exists (select 1 from pg_policy where polrelid = 'public.group_pages'::regclass and polname = 'wallet_history_owner_f5_owner') as policy \gset probe_
\echo PROBE owner kept: :probe_owner, owner policy created: :probe_policy (want t only in strict mode)
select a.app_user_id as member from public.group_creator_attendance a join public.mobile_fan_economy_ledger e on e.id = a.ledger_id
  join public.group_pages g on g.celebrity_id = a.celebrity_id and g.kind = 'fan' and g.status = 'published'
  order by a.created_at desc limit 1 \gset
select count(*) filter (where r->>'actionKey' = 'checkin' and r->>'sourceType' = 'dukjil_action') as checkins,
       count(*) filter (where r->>'actionKey' = 'checkin' and r->>'sourceType' = 'dukjil_action' and coalesce(r->>'pageName', '') <> '') as named,
       count(*) filter (where r->>'actionKey' is distinct from 'checkin' and r->>'pageName' is not null) as stray,
       string_agg(distinct r->>'pageName', ' | ') as pages
from jsonb_array_elements(public.read_owned_group_wallet_history(:'member', 100) -> 'entries') r \gset probe_
\echo PROBE check-in rows :probe_checkins, named :probe_named (want equal, > 0 in dev mode), other rows with a page :probe_stray (want 0); pages: :probe_pages
\i $TMP/rb.sql
select count(*) filter (where r ? 'pageName') as after_rollback from jsonb_array_elements(public.read_owned_group_wallet_history(:'member', 100) -> 'entries') r \gset probe_
\echo PROBE rows with pageName after rollback :probe_after_rollback (want 0)
rollback;
SQL
