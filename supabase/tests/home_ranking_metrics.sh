#!/usr/bin/env bash
# 20261220010000 (TK-RANK-IMPL plan §7.1, §7.5). Run on a database that has every migration through this one; a disposable one is best:
#   the concurrency step rewrites today's home ranking (as a read would) and commits that. Everything else runs in transactions that roll back.
#   1. home_ranking_metrics.sql (checks 1-8, 10-12, 14-16)
#   2. before/after (7, 16): the old readers on the same fixture days, without this file and with it
#   3. concurrent expiry (9 ②): one rebuild, the other reader answers busy at once
#   4. non-superuser owner (12): rolled back to before this file, owned by a role shaped like dev's byus_admin, applied by it
#   5. round trip (13): rollback, apply, rollback, apply; FORCE state and comments each time
#   6. timing (§7.5) on 5,000 fans / 50,000 point rows / 20,000 heart rows / 200 creators
# Uses the caller's PG* environment. Database: $1 or byus.
set -euo pipefail
DB="${1:-byus}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
NAME=20261220010000_home_ranking_metrics.sql
for f in "supabase/rollback/$NAME" "supabase/migrations/$NAME"; do
  mkdir -p "$TMP/$(dirname "$f")"; grep -v -x -e 'begin;' -e 'commit;' -e "notify pgrst, 'reload schema';" "$ROOT/$f" > "$TMP/$f"
done
RB="$TMP/supabase/rollback/$NAME"; MG="$TMP/supabase/migrations/$NAME"
q() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

echo "== 1. chain"
q -c "set client_min_messages = notice" -f "$ROOT/supabase/tests/home_ranking_metrics.sql" 2>&1 | grep -E 'PASS|NOTICE:  15|ERROR' || true
q -c "select 1" >/dev/null

echo "== 2. before/after (old readers, same days)"
q <<SQL
begin;
set local session_replication_role = replica;
delete from public.creator_heart_ledger; delete from public.fan_heart_conversions; delete from public.fan_score_ledger;
set local session_replication_role = origin;
\i $RB
delete from public.home_ranking_daily; delete from public.home_ranking_builds; delete from public.home_ranking_build_failures;
create temporary table fx(tag text, id uuid default extensions.gen_random_uuid());
insert into fx(tag) select 'c' || g from generate_series(1, 3) g union all select 'f' || g from generate_series(1, 6) g;
insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role) select id, 'hmb-' || tag, 'published', '/x.webp', now(), '{creator}', 'creator' from fx where tag like 'c%';
insert into public.celebrity_localizations(celebrity_id, locale, name, summary, image_alt) select id, 'ko', tag, 's', 'a' from fx where tag like 'c%';
insert into public.group_pages(kind, celebrity_id, name) select 'fan', id, tag from fx where tag like 'c%';
insert into public.app_users(id, privy_user_id, verified_email) select id, 'did:privy:hmb-' || id, id || '@example.test' from fx where tag like 'f%';
insert into public.user_profiles(app_user_id, nickname, nickname_normalized) select id, 'hmb_' || tag, 'hmb_' || tag from fx where tag like 'f%';
-- Nine days (one skipped); each day some fans give hearts. Old readers' answers are kept per day.
create temporary table before_after(phase text, day int, kind text, body jsonb);
do \$\$
declare d int;
begin
  for d in 1..9 loop
    if d = 5 then continue; end if;
    set local session_replication_role = replica;
    insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id, created_at)
    select c.id, f.id, 1, 'passport_page_claim', extensions.gen_random_uuid(), ('2099-07-0' || d || ' 09:00+09')::timestamptz + (g || ' minutes')::interval
      from fx f join fx c on c.tag = 'c' || (1 + (substr(f.tag, 2)::int + d) % 3) cross join generate_series(1, 1 + (substr(f.tag, 2)::int * d) % 4) g
     where f.tag like 'f%' and (substr(f.tag, 2)::int + d) % 2 = 0;
    set local session_replication_role = origin;
    perform public.refresh_home_rankings(('2099-07-0' || d || ' 12:00+09')::timestamptz);
    insert into before_after values ('before', d, 'fans', public.read_home_fan_ranking(null, 20)), ('before', d, 'creators', public.read_home_creator_ranking('ko', 20));
  end loop;
end \$\$;
\i $MG
-- The migration wrote today; the 2099 days are still the newest. Read each day again by hiding the later ones inside a savepoint.
do \$\$
declare d int;
begin
  for d in reverse 9..1 loop
    if d = 5 then continue; end if;
    delete from public.home_ranking_kind_builds where day > ('2099-07-0' || d)::date;
    delete from public.home_ranking_daily where day > ('2099-07-0' || d)::date;
    delete from public.home_ranking_builds where day > ('2099-07-0' || d)::date;
    insert into before_after values ('after', d, 'fans', public.read_home_fan_ranking(null, 20)), ('after', d, 'creators', public.read_home_creator_ranking('ko', 20));
  end loop;
end \$\$;
-- weekGain, weekGainDays, score and rank must match on every day; delta may differ only by the rule change (seven days -> previous record).
select b.day, b.kind,
       (select count(*) from jsonb_array_elements(b.body -> 'rows') x) as rows,
       b.body -> 'weekGainDays' = a.body -> 'weekGainDays' as same_days,
       (select bool_and(x -> 'weekGain' is not distinct from y -> 'weekGain' and x -> 'score' = y -> 'score' and x -> 'rank' = y -> 'rank')
          from jsonb_array_elements(b.body -> 'rows') with ordinality x(x, n) join jsonb_array_elements(a.body -> 'rows') with ordinality y(y, n) using (n)) as same_rows,
       (select count(*) from jsonb_array_elements(b.body -> 'rows') with ordinality x(x, n) join jsonb_array_elements(a.body -> 'rows') with ordinality y(y, n) using (n)
         where x -> 'delta' is distinct from y -> 'delta') as delta_changed,
       (b.body -> 'comparable')::text || '->' || (a.body -> 'comparable')::text as comparable
  from before_after b join before_after a on a.phase = 'after' and a.day = b.day and a.kind = b.kind
 where b.phase = 'before' order by b.kind, b.day;
do \$\$ begin
  if exists (select 1 from before_after b join before_after a on a.phase = 'after' and a.day = b.day and a.kind = b.kind where b.phase = 'before'
              and (b.body -> 'weekGainDays' is distinct from a.body -> 'weekGainDays' or jsonb_array_length(b.body -> 'rows') <> jsonb_array_length(a.body -> 'rows')
                   or exists (select 1 from jsonb_array_elements(b.body -> 'rows') with ordinality x(x, n) join jsonb_array_elements(a.body -> 'rows') with ordinality y(y, n) using (n)
                               where x -> 'weekGain' is distinct from y -> 'weekGain' or x -> 'score' <> y -> 'score' or x -> 'rank' <> y -> 'rank')))
  then raise exception 'FAIL before/after: weekGain, score or rank changed'; end if;
  raise notice 'PASS before/after: weekGain, weekGainDays, score and rank equal on every day (delta differences listed above)';
end \$\$;
rollback;
SQL

echo "== 3. concurrent expiry"
q -c "select public.refresh_home_rankings(now() - interval '11 minutes')" >/dev/null
before=$(q -At -c "select computed_at from public.home_ranking_builds where day = (now() at time zone 'Asia/Seoul')::date")
psql -X -At -d "$DB" -c "begin" -c "select public.ensure_home_rankings() ->> 'built'" -c "select pg_sleep(2)" -c "commit" > "$TMP/a" &
pid=$!
sleep 0.5
b=$(psql -X -At -d "$DB" -c "\timing on" -c "select public.ensure_home_rankings()::text")
wait "$pid"
after=$(q -At -c "select computed_at from public.home_ranking_builds where day = (now() at time zone 'Asia/Seoul')::date")
a=$(grep -E '^(true|false)$' "$TMP/a")
ms=$(echo "$b" | sed -n 's/^Time: \([0-9.]*\) ms.*/\1/p')
echo "A built=$a  B=$(echo "$b" | head -1)  B time=${ms}ms  computed_at $before -> $after"
[ "$a" = "true" ] || { echo "FAIL A did not rebuild"; exit 1; }
echo "$b" | grep -q '"busy": true' || { echo "FAIL B was not busy"; exit 1; }
awk "BEGIN{exit !($ms <= 100)}" || { echo "FAIL busy took ${ms}ms"; exit 1; }
[ "$before" != "$after" ] || { echo "FAIL no rebuild"; exit 1; }
c=$(q -At -c "select public.ensure_home_rankings() ->> 'built'")
[ "$c" = "false" ] || { echo "FAIL a later read rebuilt again"; exit 1; }
echo "PASS concurrent expiry: one rebuild, the other busy in ${ms}ms"

echo "== 4. non-superuser owner"
q <<SQL
begin;
create role hm_owner nologin nosuperuser nobypassrls;
-- Local stand-in for dev: the applying role is a member of the role owning the tables and the earlier functions.
grant $(q -At -c "select pg_get_userbyid(relowner) from pg_class where oid = 'public.home_ranking_daily'::regclass") to hm_owner;
\i $RB
-- dev state: 20261215010000 gave the applying role a read policy on every FORCE table its functions read (r4b_read_<role>).
do \$\$ declare t text; begin
  foreach t in array array['creator_heart_ledger', 'fan_heart_conversions', 'celebrities', 'celebrity_localizations', 'group_pages', 'app_users', 'user_profiles', 'app_user_avatars', 'app_user_moderation_restrictions', 'user_blocks', 'jjinfan_challenge_campaigns'] loop
    if (select relforcerowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      execute format('create policy r4b_read_hm_owner on public.%I for select to hm_owner using (%s)', t, case when t = 'jjinfan_challenge_campaigns' then 'enabled' else 'true' end);
    end if;
  end loop;
end \$\$;
alter function public.refresh_home_rankings(timestamptz) owner to hm_owner;
alter function public.ensure_home_rankings(timestamptz) owner to hm_owner;
alter function public.home_ranking_days(text) owner to hm_owner;
alter function public.read_home_fan_ranking(uuid, integer) owner to hm_owner;
alter function public.read_home_creator_ranking(text, integer) owner to hm_owner;
-- Fixture: two fans with hearts and points.
create temporary table fx(tag text, id uuid default extensions.gen_random_uuid());
grant select on fx to public;
insert into fx(tag) values ('c'), ('f1'), ('f2');
insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role) select id, 'hmn-c', 'published', '/x.webp', now(), '{creator}', 'creator' from fx where tag = 'c';
insert into public.group_pages(kind, celebrity_id, name) select 'fan', id, 'c' from fx where tag = 'c';
insert into public.app_users(id, privy_user_id, verified_email) select id, 'did:privy:hmn-' || id, id || '@example.test' from fx where tag like 'f%';
set local session_replication_role = replica;
insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id, created_at)
select c.id, f.id, 1, 'passport_page_claim', extensions.gen_random_uuid(), now() - interval '1 hour' from fx f, fx c where f.tag like 'f%' and c.tag = 'c';
insert into public.fan_score_ledger(adjustment_id, app_user_id, celebrity_id, points, created_at)
select extensions.gen_random_uuid(), f.id, c.id, 30, now() - interval '1 hour' from fx f, fx c where f.tag like 'f%' and c.tag = 'c';
set local session_replication_role = origin;
set role hm_owner;
\i $MG
reset role;
do \$\$
begin
  if (select rolsuper or rolbypassrls from pg_roles where rolname = 'hm_owner') then raise exception 'Test role is privileged'; end if;
  if exists (select 1 from pg_proc where proname in ('refresh_home_rankings', 'ensure_home_rankings', 'home_ranking_days', 'read_home_fan_ranking', 'read_home_creator_ranking',
      'read_home_fan_ranking_v2', 'read_home_creator_ranking_v2') and pronamespace = 'public'::regnamespace and pg_get_userbyid(proowner) <> 'hm_owner') then raise exception 'Owner not hm_owner'; end if;
  if (select count(*) from pg_policy where polname = 'home_ranking_owner_hm_owner') <> 4 then raise exception 'Owner policies missing'; end if;
  if (select count(*) from public.home_ranking_daily where day = (now() at time zone 'Asia/Seoul')::date and subject_id in (select id from fx where tag like 'f%')) <> 4 then
    raise exception 'Build as hm_owner missed fans: %', (select jsonb_agg(to_jsonb(h)) from public.home_ranking_daily h where day = (now() at time zone 'Asia/Seoul')::date);
  end if;
end \$\$;
set role service_role;
do \$\$ declare r jsonb; begin
  perform public.ensure_home_rankings();
  perform public.ensure_home_rankings(now() + interval '11 minutes');
  r := public.read_home_fan_ranking_v2(null, 'points', 50);
  if jsonb_array_length(r -> 'rows') < 2 then raise exception 'v2 points empty as service_role: %', r; end if;
  if jsonb_array_length(public.read_home_creator_ranking_v2('ko', 'hearts', 50) -> 'rows') < 1 then raise exception 'v2 creators empty'; end if;
  if jsonb_array_length(public.read_home_fan_ranking(null, 20) -> 'rows') < 2 or jsonb_array_length(public.read_home_creator_ranking('ko', 20) -> 'rows') < 1 then raise exception 'old readers empty'; end if;
end \$\$;
reset role;
-- Without its policy the owner cannot write the FORCE table: the build fails (the file's last step would undo the whole apply).
savepoint no_policy;
drop policy home_ranking_owner_hm_owner on public.home_ranking_daily;
do \$\$ begin
  begin perform public.refresh_home_rankings(); raise exception 'FAIL build without the owner policy succeeded';
  exception when insufficient_privilege then raise notice 'build without the owner policy: refused (%)', sqlerrm; end;
end \$\$;
rollback to savepoint no_policy;
do \$\$ begin raise notice 'PASS non-superuser owner (apply, build, ensure both paths, v2 and old readers as service_role)'; end \$\$;
rollback;
SQL
echo "role hm_owner left: $(q -At -c "select count(*) from pg_roles where rolname = 'hm_owner'")"

echo "== 5. round trip"
state="select string_agg(relname || ':' || relforcerowsecurity || ':' || coalesce(obj_description(oid, 'pg_class'), '-'), ' | ' order by relname) || ' policies=' || (select count(*) from pg_policy where polname like 'home\_ranking\_%')
  from pg_class where relname like 'home_ranking%' and relkind = 'r' and relnamespace = 'public'::regnamespace"
q <<SQL
begin;
\i $RB
\echo rollback:
$(echo "$state" | tr "\n" " ");
\i $MG
\echo apply:
$(echo "$state" | tr "\n" " ");
\i $MG
\echo apply again:
$(echo "$state" | tr "\n" " ");
\i $RB
\echo rollback:
$(echo "$state" | tr "\n" " ");
do \$\$ begin
  if exists (select 1 from pg_class where relname in ('home_ranking_daily', 'home_ranking_builds', 'home_ranking_build_failures') and (relforcerowsecurity or obj_description(oid, 'pg_class') is not null))
     or to_regclass('public.home_ranking_kind_builds') is not null or to_regprocedure('public.read_home_fan_ranking_v2(uuid,text,integer)') is not null
     or not has_function_privilege('service_role', 'public.refresh_home_rankings(timestamptz)', 'execute') then raise exception 'FAIL rollback state'; end if;
end \$\$;
\i $MG
do \$\$ begin raise notice 'PASS round trip'; end \$\$;
rollback;
SQL

echo "== 6. timing"
q <<'SQL'
begin;
set local session_replication_role = replica;
create temporary table pc as select extensions.gen_random_uuid() as id, g from generate_series(1, 200) g;
create temporary table pf as select extensions.gen_random_uuid() as id, g from generate_series(1, 5000) g;
insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role) select id, 'hmp-' || g, 'published', '/x.webp', now(), '{creator}', 'creator' from pc;
insert into public.group_pages(kind, celebrity_id, name) select 'fan', id, 'p' || g from pc;
insert into public.app_users(id, privy_user_id, verified_email) select id, 'did:privy:hmp-' || id, id || '@example.test' from pf;
insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id, created_at)
select (select id from pc where pc.g = 1 + (i * 7) % 200), (select id from pf where pf.g = 1 + (i * 13) % 5000), 1, 'passport_page_claim', extensions.gen_random_uuid(), now() - (i || ' seconds')::interval
  from generate_series(1, 20000) i;
insert into public.fan_score_ledger(adjustment_id, app_user_id, celebrity_id, points, created_at)
select extensions.gen_random_uuid(), (select id from pf where pf.g = 1 + (i * 17) % 5000), (select id from pc where pc.g = 1 + (i * 11) % 200),
       case when i % 10 < 3 then 0 when i % 10 = 3 then -5 else 10 end, now() - (i || ' seconds')::interval
  from generate_series(1, 50000) i;
set local session_replication_role = origin;
analyze public.creator_heart_ledger; analyze public.fan_score_ledger;
do $$
declare t0 timestamptz; ms numeric[] := '{}'; rd numeric[] := '{}'; i int; v uuid := (select id from pf where g = 77); r jsonb; med numeric; medr numeric;
begin
  for i in 1..3 loop t0 := clock_timestamp(); r := public.refresh_home_rankings(); ms := ms || extract(epoch from clock_timestamp() - t0) * 1000; end loop;
  for i in 1..3 loop t0 := clock_timestamp(); perform public.read_home_fan_ranking_v2(v, 'points', 50); rd := rd || extract(epoch from clock_timestamp() - t0) * 1000; end loop;
  select percentile_disc(0.5) within group (order by x) into med from unnest(ms) x;
  select percentile_disc(0.5) within group (order by x) into medr from unnest(rd) x;
  raise notice 'refresh_home_rankings: % ms (median of %), rows %', round(med), ms::text, r;
  raise notice 'read_home_fan_ranking_v2(viewer, points, 50): % ms (median of %)', round(medr, 1), rd::text;
  if med > 300 then raise notice 'FAIL refresh over 300ms'; else raise notice 'PASS refresh <= 300ms'; end if;
  if medr > 20 then raise notice 'FAIL v2 read over 20ms'; else raise notice 'PASS v2 read <= 20ms'; end if;
end $$;
rollback;
SQL
