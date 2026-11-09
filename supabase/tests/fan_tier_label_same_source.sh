#!/usr/bin/env bash
# BUGS-1846 T2 mini review (20261220051000): the tier label of the passport detail, collection and MY summary comes from the same source as
# the stage (get_fan_effective_tier, hearts under policy 3), for a heart from creator_heart_ledger only and a heart from
# fan_heart_conversions only. The mismatch is reproduced first on a database whose get_fan_effective_tier_for_score still passes points
# as hearts (the body before 20261215090000), then fixed by the file. Re-run is a no-op; rollback restores; a second rollback stops.
# Uses the local copy's passports; one transaction, rolled back. Local: PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper PGDATABASE=byus.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
for f in migrations/20261220050000_fan_stage_next_step.sql migrations/20261220051000_fan_tier_label_same_source.sql rollback/20261220051000_fan_tier_label_same_source.sql; do
  mkdir -p "$TMP/$(dirname "$f")"; grep -v -x -e 'begin;' -e 'commit;' -e "notify pgrst, 'reload schema';" "$ROOT/supabase/$f" > "$TMP/$f"
done
psql -X -q -v ON_ERROR_STOP=1 -d "${PGDATABASE:-byus}" <<SQL
begin;
set local session_replication_role = replica;
update public.reward_policy_activation set policy_version = 3 where singleton = true;
set local session_replication_role = origin;
\i $TMP/migrations/20261220050000_fan_stage_next_step.sql

-- A database where the label function still reads points as hearts under policy 3 (the body before 20261215090000).
do \$\$
declare d text := pg_get_functiondef('public.get_fan_effective_tier_for_score(uuid,uuid,integer,integer)'::regprocedure);
  fixed constant text := 'public.passport_v3_tier(p_app_user_id, p_celebrity_id, public.passport_hearts(p_app_user_id, p_celebrity_id))';
begin
  if position(fixed in d) = 0 then raise exception 'unexpected get_fan_effective_tier_for_score body'; end if;
  execute replace(d, fixed, 'public.passport_v3_tier(p_app_user_id, p_celebrity_id, p_score)');
end \$\$;

-- Two Silver passports with no heart and no points: one gets a ledger heart, the other a conversion heart.
create temporary table label_cases on commit drop as
  with x as (
    select fp.id, fp.app_user_id u, fp.celebrity_id cel, public.get_fan_passport_stage(fp.app_user_id, fp.celebrity_id) ->> 'stageKey' st
    from public.fan_passports fp join public.app_users a on a.id = fp.app_user_id and a.status = 'active'
    where public.passport_hearts(fp.app_user_id, fp.celebrity_id) = 0
      and not exists (select 1 from public.fan_heart_conversions c where c.app_user_id = fp.app_user_id and c.celebrity_id = fp.celebrity_id)
      and coalesce((select sum(points) from public.fan_score_ledger l where l.app_user_id = fp.app_user_id and l.celebrity_id = fp.celebrity_id), 0) = 0)
  select row_number() over (order by id) n, case row_number() over (order by id) when 1 then 'ledger' else 'conversion' end source, id, u, cel
  from x where st like 'silver-%' order by id limit 2;
do \$\$ begin if (select count(*) from label_cases) is distinct from 2 then raise exception 'expected 2 Silver passports without hearts in the local copy'; end if; end \$\$;
set local session_replication_role = replica;
insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id)
  select cel, u, 1, 'passport_page_claim', extensions.gen_random_uuid() from label_cases where source = 'ledger';
insert into public.fan_heart_conversions(app_user_id, celebrity_id, stamps_counted, hearts, remainder, cutoff_at)
  select u, cel, 9, 1, 0, now() from label_cases where source = 'conversion';
set local session_replication_role = origin;

create or replace function pg_temp.labels(p_case text) returns table(detail text, collection text, summary text, stage text)
language sql as \$f\$
  select (select x -> 'score' ->> 'level' from public.get_owned_passport_detail_with_stages(c.id, c.u, 'ko') x),
         (select x -> 'score' ->> 'level' from public.get_owned_passport_collection_with_stages(c.u, 'ko') x where x ->> 'id' = c.id::text),
         (select e -> 'passport' ->> 'tier' from jsonb_array_elements(public.get_owned_my_fan_activity_with_stages(c.u, 'ko') -> 'creators') e where e -> 'passport' ->> 'id' = c.id::text),
         (select x -> 'score' -> 'stageProgress' -> 'current' ->> 'tier' from public.get_owned_passport_detail_with_stages(c.id, c.u, 'ko') x)
  from label_cases c where c.source = p_case
\$f\$;

-- Before the file: the reported mismatch (a Silver label beside a Gold stage).
do \$\$ declare r record; begin
  for r in select s.source, l.* from (values ('ledger'), ('conversion')) s(source), pg_temp.labels(s.source) l loop
    if r.stage is distinct from 'Gold' or r.detail is distinct from 'Silver' then raise exception 'mismatch not reproduced for %: %', r.source, r; end if;
  end loop;
end \$\$;

\i $TMP/migrations/20261220051000_fan_tier_label_same_source.sql
\i $TMP/migrations/20261220051000_fan_tier_label_same_source.sql

do \$\$ declare r record; begin
  for r in select s.source, l.* from (values ('ledger'), ('conversion')) s(source), pg_temp.labels(s.source) l loop
    if r.stage is distinct from 'Gold' or r.detail is distinct from 'Gold' or r.collection is distinct from 'Gold' or r.summary is distinct from 'Gold' then raise exception 'label differs for %: %', r.source, r; end if;
    raise notice 'case %: detail % collection % summary % stage %', r.source, r.detail, r.collection, r.summary, r.stage;
  end loop;
  if has_function_privilege('anon', 'public.fan_passport_effective_tier(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.fan_passport_effective_tier(uuid,uuid)', 'execute') then raise exception 'helper is callable by clients'; end if;
end \$\$;

\i $TMP/rollback/20261220051000_fan_tier_label_same_source.sql
do \$\$ begin
  if to_regprocedure('public.fan_passport_effective_tier(uuid,uuid)') is not null then raise exception 'helper survived rollback'; end if;
  if (select detail from pg_temp.labels('ledger')) is distinct from 'Silver' then raise exception 'rollback did not restore the base label'; end if;
end \$\$;
savepoint second_rollback;
do \$\$ begin
  begin
    execute pg_read_file('$TMP/rollback/20261220051000_fan_tier_label_same_source.sql');
    raise exception 'second rollback did not stop';
  exception when others then
    if sqlerrm not like 'FAN_TIER_LABEL_ROLLBACK_SHAPE%' then raise; end if;
  end;
end \$\$;
rollback to savepoint second_rollback;
rollback;
SQL
echo "fan_tier_label_same_source: ok"
