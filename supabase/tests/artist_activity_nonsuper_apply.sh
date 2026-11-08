#!/usr/bin/env bash
# 20261216031000 and 20261216032000 applied by a role shaped like dev's byus_admin (no superuser, no BYPASSRLS, member of postgres). One transaction,
# rolled back, the role included. Checks that no function or table the file makes or keeps is left owned by the applying role
# (they must run as the owner of group_emit_notification, like the comment notices before them), then runs the acceptance checks.
# Needs 20261216030000 applied. Uses the caller's PG* environment (local: PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper). Database: byus.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
strip() { grep -v -x -e 'begin;' -e 'commit;' -e 'rollback;' -e "notify pgrst, 'reload schema';" "$1"; }
strip "$ROOT/supabase/rollback/20261216031000_artist_activity_notifications.sql" > "$TMP/rb.sql"
strip "$ROOT/supabase/migrations/20261216031000_artist_activity_notifications.sql" > "$TMP/m.sql"
strip "$ROOT/supabase/tests/artist_activity_notifications.sql" > "$TMP/t.sql"
strip "$ROOT/supabase/rollback/20261216032000_community_invite_short_links.sql" > "$TMP/rb2.sql"
strip "$ROOT/supabase/migrations/20261216032000_community_invite_short_links.sql" > "$TMP/m2.sql"
strip "$ROOT/supabase/tests/community_invite_short_links.sql" > "$TMP/t2.sql"
psql -X -q -v ON_ERROR_STOP=1 -d byus <<SQL
begin;
create role e6_apply nologin nosuperuser nobypassrls;
grant postgres, byus_admin to e6_apply;
-- Local only: earlier local applies left functions owned by the local superuser; membership stands in for that ownership.
grant localsuper to e6_apply;
\i $TMP/rb.sql
\i $TMP/rb2.sql
set role e6_apply;
\i $TMP/m.sql
\i $TMP/m2.sql
reset role;
do \$\$
declare bad text;
begin
  if (select rolsuper or rolbypassrls from pg_roles where rolname = 'e6_apply') then raise exception 'probe role is privileged'; end if;
  select string_agg(x, ', ') into bad from (
    select p.oid::regprocedure::text x from pg_proc p where p.proowner = 'e6_apply'::regrole
    union all select c.oid::regclass::text from pg_class c where c.relowner = 'e6_apply'::regrole) z;
  raise notice 'objects owned by the applying role: %', coalesce(bad, 'none');
  if bad is not null then raise exception 'NONSUPER_OWNER_LEFT %', bad; end if;
end \$\$;
\i $TMP/t.sql
\i $TMP/t2.sql
rollback;
SQL
