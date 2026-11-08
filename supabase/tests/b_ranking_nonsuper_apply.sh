#!/usr/bin/env bash
# 20261215010000 + 20261215020000 applied by a role shaped like dev's byus_admin: no superuser, no BYPASSRLS, a member of postgres and byus_admin
# (the owners of the tables the functions read). Everything runs in one transaction that is rolled back, the role included.
# Checks: both files apply without OWNER_GAP; a FORCE table gets the role's own read policy, a table the role reads as an owner member gets none;
# the build made by that role sees the same hearts as a superuser count; the gauge and the readers answer as service_role.
# Uses the caller's PG* environment (local: PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper). Database: $1 or byus.
set -euo pipefail
DB="${1:-byus}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
strip() { grep -v -x -e 'begin;' -e 'commit;' -e "notify pgrst, 'reload schema';" "$1" > "$TMP/$(basename "$1")"; }
for f in supabase/rollback/20261215020000_active_jjinfan_challenges.sql supabase/rollback/20261215010000_home_ranking_daily.sql \
         supabase/migrations/20261215010000_home_ranking_daily.sql supabase/migrations/20261215020000_active_jjinfan_challenges.sql; do
  mkdir -p "$TMP/$(dirname "$f")"; grep -v -x -e 'begin;' -e 'commit;' -e "notify pgrst, 'reload schema';" "$ROOT/$f" > "$TMP/$f"
done
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" <<SQL
begin;
create temporary table expected as
  select (select count(distinct app_user_id) from public.creator_heart_ledger l join public.app_users u on u.id = l.app_user_id and u.status = 'active'
           where l.source_type = 'passport_page_claim' and public.platform_fan_heart_counted(l.celebrity_id)
             and not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = l.app_user_id and mr.revoked_at is null)) as fans;
grant select on expected to public;
create role r4b_apply nologin nosuperuser nobypassrls;
grant postgres, byus_admin to r4b_apply;
-- Local only: functions made by earlier files (platform_fan_heart_counted, creator_listed, read_creator_fan_ranking) belong to the local superuser
-- here and to the applying role on dev. Membership stands in for that ownership; it does not make r4b_apply a superuser.
grant localsuper to r4b_apply;
-- Take the B objects away as the superuser, then apply both files as r4b_apply.
\i $TMP/supabase/rollback/20261215020000_active_jjinfan_challenges.sql
\i $TMP/supabase/rollback/20261215010000_home_ranking_daily.sql
set role r4b_apply;
\i $TMP/supabase/migrations/20261215010000_home_ranking_daily.sql
\i $TMP/supabase/migrations/20261215020000_active_jjinfan_challenges.sql
reset role;
do \$\$
declare got bigint; want bigint;
begin
  if (select rolsuper or rolbypassrls from pg_roles where rolname = 'r4b_apply') then raise exception 'Test role is privileged'; end if;
  if pg_get_userbyid((select proowner from pg_proc where oid = 'public.refresh_home_rankings(timestamptz)'::regprocedure)) <> 'r4b_apply' then raise exception 'Functions not owned by the applying role'; end if;
  -- FORCE tables bind even an owner member: the role got its own read policy. Non-FORCE tables owned by postgres need none.
  if not exists (select 1 from pg_policy where polrelid = 'public.app_user_moderation_restrictions'::regclass and polname = 'r4b_read_r4b_apply') then raise exception 'No policy on a FORCE table'; end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.group_pages'::regclass and polname = 'r4b_read_r4b_apply') then raise exception 'No policy on group_pages (FORCE)'; end if;
  if exists (select 1 from pg_policy where polrelid = 'public.celebrities'::regclass and polname = 'r4b_read_r4b_apply') then raise exception 'Needless policy on celebrities'; end if;
  -- The build that ran as r4b_apply saw every counted fan (row security did not hide rows).
  select count(*) into got from public.home_ranking_daily where kind = 'fan_hearts' and day = (now() at time zone 'Asia/Seoul')::date;
  select fans into want from expected;
  if got <> want then raise exception 'Build as r4b_apply saw % fans, superuser count %', got, want; end if;
  raise notice 'build as r4b_apply: % fans, % creators', got, (select count(*) from public.home_ranking_daily where kind = 'creator_jjinfan' and day = (now() at time zone 'Asia/Seoul')::date);
end \$\$;
set role service_role;
do \$\$
declare r jsonb;
begin
  r := public.read_home_fan_ranking(null, 20);
  if jsonb_array_length(r -> 'rows') = 0 and (select fans from expected) > 0 then raise exception 'Fan ranking empty as service_role: %', r; end if;
  r := public.read_home_creator_ranking('ko', 20);
  perform public.read_active_jjinfan_challenges('ko', 10);
  perform public.read_jjinfan_challenge(c.id) from public.celebrities c where c.status = 'published' and c.archived_at is null limit 3;
  perform public.ensure_home_rankings();
  raise notice 'PASS non-superuser apply (readers answer as service_role)';
end \$\$;
reset role;
rollback;
SQL
echo "rolled back; role r4b_apply exists: $(psql -X -At -d "$DB" -c "select count(*) from pg_roles where rolname = 'r4b_apply'")"
