#!/usr/bin/env bash
# BUGS-1846 T2 (20261220050000): the passport detail, the passport collection and the MY summary give the same next stage, remaining
# amount and unit for one passport, for Bronze, Silver with 0 points, Silver with points and Gold under policy 3; policy 2 keeps
# get_fan_stage_progress with unit points; the readers' owner (non-superuser, as on dev) gets what it needs, an owner that still cannot read
# stops the file (OWNER_GAP); rollback restores the 20261215090000 call and a second rollback stops (SHAPE). Uses the local copy's
# passports; one transaction, rolled back. Local: PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper PGDATABASE=byus.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
for f in migrations/20261220050000_fan_stage_next_step.sql rollback/20261220050000_fan_stage_next_step.sql; do
  mkdir -p "$TMP/$(dirname "$f")"; grep -v -x -e 'begin;' -e 'commit;' -e "notify pgrst, 'reload schema';" "$ROOT/supabase/$f" > "$TMP/$f"
done
psql -X -q -v ON_ERROR_STOP=1 -d "${PGDATABASE:-byus}" <<SQL
begin;
set local session_replication_role = replica;
update public.reward_policy_activation set policy_version = 3 where singleton = true;
set local session_replication_role = origin;

-- The readers belong to an ordinary owner with bypassrls, as postgres on Supabase.
create role stage_next_owner nologin nosuperuser bypassrls;
grant usage on schema public, extensions to stage_next_owner;
grant stage_next_owner to current_user;
alter function public.get_owned_passport_detail_with_stages(uuid,uuid,public.content_locale) owner to stage_next_owner;
alter function public.get_owned_passport_collection_with_stages(uuid,public.content_locale) owner to stage_next_owner;
alter function public.get_owned_my_fan_activity_with_stages(uuid,public.content_locale,timestamp with time zone) owner to stage_next_owner;
grant execute on function public.get_owned_passport_detail(uuid,uuid,public.content_locale), public.get_owned_passport_collection(uuid,public.content_locale),
  public.get_owned_my_fan_activity(uuid,public.content_locale,timestamp with time zone) to stage_next_owner;

\i $TMP/migrations/20261220050000_fan_stage_next_step.sql

do \$\$
declare t text;
begin
  foreach t in array array['reward_policy_activation', 'fan_passports', 'passport_page_slots', 'reward_policy_tier_stages'] loop
    if not has_table_privilege('stage_next_owner', ('public.' || t)::regclass, 'select') then raise exception 'owner lacks select on %', t; end if;
  end loop;
  if not has_function_privilege('stage_next_owner', 'public.get_fan_passport_stage_progress(uuid,uuid,integer,text)', 'execute')
     or not has_function_privilege('stage_next_owner', 'public.get_fan_passport_stage(uuid,uuid)', 'execute') then raise exception 'owner lacks helper execute'; end if;
  if has_function_privilege('anon', 'public.get_fan_passport_stage_progress(uuid,uuid,integer,text)', 'execute')
     or has_function_privilege('authenticated', 'public.get_fan_passport_stage_progress(uuid,uuid,integer,text)', 'execute') then raise exception 'helper is callable by clients'; end if;
end \$\$;

-- Four cases: the same stage object from all three readers, and the expected next step from the raw slots and hearts.
do \$\$
declare c record; detail jsonb; summary jsonb; collection jsonb; picked integer := 0;
begin
  for c in
    with x as (
      select fp.id, fp.app_user_id u, fp.celebrity_id cel, public.passport_hearts(fp.app_user_id, fp.celebrity_id) h,
        (select count(*)::integer from public.passport_page_slots s join public.fan_passports p on p.id = s.passport_id
          where p.app_user_id = fp.app_user_id and p.celebrity_id = fp.celebrity_id and s.stamp_id is not null) slots,
        coalesce((select sum(points)::integer from public.fan_score_ledger l where l.app_user_id = fp.app_user_id and l.celebrity_id = fp.celebrity_id), 0) pts,
        public.get_fan_passport_stage(fp.app_user_id, fp.celebrity_id) ->> 'stageKey' st
      from public.fan_passports fp join public.app_users a on a.id = fp.app_user_id and a.status = 'active')
    select * from (
      (select 'bronze' k, * from x where st = 'bronze-1' order by slots desc, id limit 1)
      union all (select 'silver-0' k, * from x where st like 'silver-%' and pts = 0 order by id limit 1)
      union all (select 'silver-points' k, * from x where st like 'silver-%' and pts >= 50 order by id limit 1)
      union all (select 'gold' k, * from x where st like 'gold-%' order by id limit 1)) cases
  loop
    picked := picked + 1;
    select (r -> 'score' -> 'stageProgress') into detail from public.get_owned_passport_detail_with_stages(c.id, c.u, 'ko') r;
    select (r -> 'score' -> 'stageProgress') into collection from public.get_owned_passport_collection_with_stages(c.u, 'ko') r where r ->> 'id' = c.id::text;
    select e -> 'passport' -> 'stageProgress' into summary
      from jsonb_array_elements(public.get_owned_my_fan_activity_with_stages(c.u, 'ko') -> 'creators') e where e -> 'passport' ->> 'id' = c.id::text;
    if detail is null or detail is distinct from summary or detail is distinct from collection then
      raise exception '% differs: detail % summary % collection %', c.k, detail, summary, collection;
    end if;
    if detail #>> '{current,key}' is distinct from c.st then raise exception '% current % is not %', c.k, detail #>> '{current,key}', c.st; end if;
    if c.st = 'bronze-1' and (detail #>> '{next,key}' is distinct from 'silver-1' or detail ->> 'unit' is distinct from 'stamps' or (detail ->> 'remaining')::int is distinct from 3 - c.slots) then raise exception 'bronze: %', detail; end if;
    if c.st = 'silver-1' and (detail #>> '{next,key}' is distinct from 'silver-2' or detail ->> 'unit' is distinct from 'stamps' or (detail ->> 'remaining')::int is distinct from greatest(6 - c.slots, 0)) then raise exception 'silver-1: %', detail; end if;
    if c.st = 'silver-2' and (detail #>> '{next,key}' is distinct from 'gold-1' or detail ->> 'unit' is distinct from 'hearts' or (detail ->> 'remaining')::int is distinct from 1 - c.h) then raise exception 'silver-2: %', detail; end if;
    if c.st like 'gold-%' and (detail ->> 'unit' is distinct from 'hearts' or (detail ->> 'remaining')::int is distinct from (detail #>> '{next,minimumScore}')::int - c.h) then raise exception 'gold: %', detail; end if;
    raise notice 'case % passport % stage % slots % hearts % points % -> next % remaining % % (%%%)', c.k, c.id, c.st, c.slots, c.h, c.pts,
      detail #>> '{next,key}', detail ->> 'remaining', detail ->> 'unit', detail ->> 'progressPercent';
  end loop;
  if picked is distinct from 4 then raise exception 'expected 4 cases in the local copy, found %', picked; end if;
end \$\$;

-- Policy 2: the earlier stage progress, now with unit points.
do \$\$
declare r jsonb;
begin
  set local session_replication_role = replica;
  update public.reward_policy_activation set policy_version = 2 where singleton = true;
  set local session_replication_role = origin;
  r := public.get_fan_passport_stage_progress(null, null, 15, 'Silver');
  if r is distinct from public.get_fan_stage_progress(15, 'Silver') || '{"unit":"points"}'::jsonb then raise exception 'policy 2 changed: %', r; end if;
  set local session_replication_role = replica;
  update public.reward_policy_activation set policy_version = 3 where singleton = true;
  set local session_replication_role = origin;
end \$\$;

-- Re-running the file is a no-op.
\i $TMP/migrations/20261220050000_fan_stage_next_step.sql

-- Rollback: the 20261215090000 call is back, the helper is gone, a second rollback stops.
\i $TMP/rollback/20261220050000_fan_stage_next_step.sql
do \$\$
begin
  if to_regprocedure('public.get_fan_passport_stage_progress(uuid,uuid,integer,text)') is not null then raise exception 'helper survived rollback'; end if;
  if position('public.fan_stage_input(p_app_user_id, p_passport_id, (base.value -> ''score'' ->> ''points'')::integer), /* tier-source-hearts 20261215090000 */'
       in pg_get_functiondef('public.get_owned_passport_detail_with_stages(uuid,uuid,public.content_locale)'::regprocedure)) = 0 then raise exception 'detail call not restored'; end if;
end \$\$;
savepoint second_rollback;
do \$\$ begin
  begin
    execute pg_read_file('$TMP/rollback/20261220050000_fan_stage_next_step.sql');
    raise exception 'second rollback did not stop';
  exception when others then
    if sqlerrm not like 'FAN_STAGE_NEXT_STEP_ROLLBACK_SHAPE%' then raise; end if;
  end;
end \$\$;
rollback to savepoint second_rollback;

-- An owner that cannot read row-secured tables stops the file.
alter role stage_next_owner nobypassrls;
savepoint owner_gap;
do \$\$ begin
  begin
    execute pg_read_file('$TMP/migrations/20261220050000_fan_stage_next_step.sql');
    raise exception 'owner gap was not detected';
  exception when others then
    if sqlerrm not like 'FAN_STAGE_NEXT_STEP_OWNER_GAP%' then raise; end if;
  end;
end \$\$;
rollback to savepoint owner_gap;
rollback;
SQL
echo "fan_stage_next_step: ok"
