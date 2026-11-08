#!/usr/bin/env bash
# 20261216020000: the SQL test, then the rollback and a non-superuser apply, each in a transaction that is rolled back.
# Non-superuser: a role shaped like dev's byus_admin (no superuser, no BYPASSRLS, member of postgres and byus_admin) takes this file away and
# applies it again; the functions end up owned by it and today's build it makes still sees every counted fan and names favorites.
# Uses the caller's PG* environment (local: PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper). Database: $1 or byus.
set -euo pipefail
DB="${1:-byus}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
NAME=20261216020000_home_ranking_week_gain_favorite.sql
for f in "supabase/rollback/$NAME" "supabase/migrations/$NAME"; do
  mkdir -p "$TMP/$(dirname "$f")"; grep -v -x -e 'begin;' -e 'commit;' -e "notify pgrst, 'reload schema';" "$ROOT/$f" > "$TMP/$f"
done
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/tests/home_ranking_week_gain_favorite.sql"
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" <<SQL
begin;
\i $TMP/supabase/rollback/$NAME
do \$\$ declare r jsonb; begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'home_ranking_daily' and column_name = 'favorite_celebrity_id') then raise exception 'Rollback left the column'; end if;
  perform public.refresh_home_rankings();
  r := public.read_home_creator_ranking('ko', 20);
  if r ? 'weekGainDays' then raise exception 'Rollback left weekGainDays'; end if;
  r := public.read_home_fan_ranking(null, 20);
  if exists (select 1 from jsonb_array_elements(r -> 'rows') x where x ? 'favorite') then raise exception 'Rollback left favorite'; end if;
  raise notice 'PASS rollback';
end \$\$;
rollback;
begin;
create role h5_apply nologin nosuperuser nobypassrls;
grant postgres, byus_admin to h5_apply;
-- Local only: the functions of 20261215010000 belong to the local superuser here and to the applying role on dev; membership stands in for that.
grant localsuper to h5_apply;
\i $TMP/supabase/rollback/$NAME
set role h5_apply;
\i $TMP/supabase/migrations/$NAME
reset role;
do \$\$
declare want bigint; got bigint; named bigint;
begin
  if (select rolsuper or rolbypassrls from pg_roles where rolname = 'h5_apply') then raise exception 'Test role is privileged'; end if;
  if pg_get_userbyid((select proowner from pg_proc where oid = 'public.read_home_creator_ranking(text,integer)'::regprocedure)) not in ('h5_apply', 'localsuper') then raise exception 'Owner unexpected'; end if;
  select count(distinct l.app_user_id) into want from public.creator_heart_ledger l join public.app_users u on u.id = l.app_user_id and u.status = 'active'
   where l.source_type = 'passport_page_claim' and public.platform_fan_heart_counted(l.celebrity_id)
     and not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = l.app_user_id and mr.revoked_at is null);
  select count(*), count(favorite_celebrity_id) into got, named from public.home_ranking_daily where kind = 'fan_hearts' and day = (now() at time zone 'Asia/Seoul')::date;
  if got < want then raise exception 'Build as h5_apply saw % fans, superuser count %', got, want; end if;
  raise notice 'build as h5_apply: % fans, % with a favorite', got, named;
end \$\$;
set role service_role;
do \$\$ begin
  perform public.read_home_fan_ranking(null, 20);
  perform public.read_home_creator_ranking('ko', 20);
  raise notice 'PASS non-superuser apply (readers answer as service_role)';
end \$\$;
reset role;
rollback;
SQL
echo "rolled back; role h5_apply exists: $(psql -X -At -d "$DB" -c "select count(*) from pg_roles where rolname = 'h5_apply'")"
