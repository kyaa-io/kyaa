-- Rollback for 20261214030000_group_pages_listed.sql. Run 20261214042000's rollback first (it also calls creator_listed).
-- Unlisted test pages come back in the directory and the creator ranking. The owner grants on creator_listed go with the function.
begin;
set local lock_timeout='5s';
do $$
declare definition text; patches constant text[][] := array[
    array['public.groups_dispatch_before_qualification(text,uuid,uuid,uuid,jsonb,uuid)', ' and (gp.listed or p_input->>''mine'' is not null)'],
    array['public.groups_dispatch_before_joined_visited(text,uuid,uuid,uuid,jsonb,uuid)', ' and (gp.listed or p_input->>''mine'' is not null)'],
    array['public.ranking_scores(text,uuid,timestamptz,timestamptz)', 'public.creator_listed(l.celebrity_id) and '],
    array['public.read_creator_ranking(text,uuid,text,timestamptz)', ' and public.creator_listed(c.id)']
  ]; i integer;
begin
  for i in 1 .. array_length(patches, 1) loop
    definition := pg_catalog.pg_get_functiondef(patches[i][1]::regprocedure);
    if position(patches[i][2] in definition) = 0 then raise exception 'GROUP_LISTED_ROLLBACK_SHAPE %', patches[i][1]; end if;
    execute replace(definition, patches[i][2], '');
  end loop;
end $$;
create or replace function public.platform_fan_ranking_owner_roles()
returns table(role_oid oid, rolname name, rolsuper boolean, rolbypassrls boolean) language sql stable set search_path = '' as $$
  select distinct o.oid, o.rolname, o.rolsuper, o.rolbypassrls from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid = f.proowner
   where f.pronamespace = 'public'::regnamespace
     and f.proname in ('platform_fan_heart_counted', 'ranking_scores', 'refresh_ranking_snapshots', 'ranking_my_rank', 'read_platform_fan_ranking', 'read_creator_fan_ranking')
$$;
create or replace function public.platform_fan_ranking_owner_functions() returns text[] language sql immutable set search_path = '' as $$
  select array['public.platform_fan_heart_counted(uuid)', 'public.ranking_period_window(text,timestamptz)', 'public.ranking_scores(text,uuid,timestamptz,timestamptz)',
    'public.ranking_my_rank(text,uuid,text,timestamptz,jsonb,uuid)', 'public.get_fan_effective_tier(uuid,uuid)', 'public.fan_level_rank(text)']::text[]
$$;
drop function public.creator_listed(uuid);
alter table public.group_pages drop column listed;
commit;
