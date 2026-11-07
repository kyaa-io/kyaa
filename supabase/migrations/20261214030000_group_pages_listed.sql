-- Test and smoke pages (synthetic creators, QA fixtures) showed up in the page
-- directory and the creator ranking. Some of them are fixtures that QA still
-- opens by URL, so archiving them (404) is not an option. `listed` is a data
-- flag: false keeps the page reachable by its link but leaves it out of the
-- directory (recent, popular, today spotlight) and of the creator ranking.
-- A member's own lists (mine=joined/bookmarked, visited) still show it.
-- Rollback: update public.group_pages set listed=true; restore platform_fan_ranking_owner_roles and _functions from 20261213060000; then recreate the four
--           functions from 20261208072000, 20261208087000 and 20261211010000
--           (or re-run them without the `listed` filter) and
--           alter table public.group_pages drop column listed;
--           drop function public.creator_listed(uuid);
alter table public.group_pages add column if not exists listed boolean not null default true;

create or replace function public.creator_listed(p_celebrity uuid) returns boolean
language sql stable set search_path='' as $$
 select not exists(select 1 from public.group_pages g where g.celebrity_id=p_celebrity and g.kind='fan' and not g.listed)
$$;
revoke all on function public.creator_listed(uuid) from public,anon,authenticated;

do $$declare definition text;needle text;begin
 -- Directory, recent and popular sort.
 definition:=pg_get_functiondef('public.groups_dispatch_before_qualification(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 needle:='from public.group_pages gp where public.group_scope_visible(p_actor,gp.id)';
 if position(needle in definition)=0 then raise exception 'GROUP_LISTED_QUALIFICATION_SHAPE';end if;
 execute replace(definition,needle,needle||' and (gp.listed or p_input->>''mine'' is not null)');
 -- Directory, today spotlight.
 definition:=pg_get_functiondef('public.groups_dispatch_before_joined_visited(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 needle:='where public.group_scope_visible(null,gp.id)';
 if position(needle in definition)=0 then raise exception 'GROUP_LISTED_TODAY_SHAPE';end if;
 execute replace(definition,needle,needle||' and (gp.listed or p_input->>''mine'' is not null)');
 -- Creator ranking: the score source, so ranks stay contiguous after the next refresh.
 definition:=pg_get_functiondef('public.ranking_scores(text,uuid,timestamptz,timestamptz)'::regprocedure);
 needle:='where p_kind = ''creator_hearts'' and ';
 if position(needle in definition)=0 then raise exception 'GROUP_LISTED_RANKING_SCORES_SHAPE';end if;
 execute replace(definition,needle,needle||'public.creator_listed(l.celebrity_id) and ');
 -- Creator ranking read: hides an unlisted creator from a snapshot taken before the flag changed.
 definition:=pg_get_functiondef('public.read_creator_ranking(text,uuid,text,timestamptz)'::regprocedure);
 needle:='c.status = ''published'' and c.archived_at is null';
 if position(needle in definition)=0 then raise exception 'GROUP_LISTED_CREATOR_RANKING_SHAPE';end if;
 execute replace(definition,needle,needle||' and public.creator_listed(c.id)');
end $$;

-- ranking_scores and read_creator_ranking now call creator_listed. Their owners can differ from the applying role that owns it
-- (dev: postgres and byus_admin), so the platform ranking owner set from 20261213060000 takes in the new callee and its other caller.
create or replace function public.platform_fan_ranking_owner_roles()
returns table(role_oid oid, rolname name, rolsuper boolean, rolbypassrls boolean) language sql stable set search_path = '' as $$
  select distinct o.oid, o.rolname, o.rolsuper, o.rolbypassrls from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid = f.proowner
   where f.pronamespace = 'public'::regnamespace
     and f.proname in ('platform_fan_heart_counted', 'ranking_scores', 'refresh_ranking_snapshots', 'ranking_my_rank', 'read_platform_fan_ranking', 'read_creator_fan_ranking', 'read_creator_ranking')
$$;
create or replace function public.platform_fan_ranking_owner_functions() returns text[] language sql immutable set search_path = '' as $$
  select array['public.platform_fan_heart_counted(uuid)', 'public.ranking_period_window(text,timestamptz)', 'public.ranking_scores(text,uuid,timestamptz,timestamptz)',
    'public.ranking_my_rank(text,uuid,text,timestamptz,jsonb,uuid)', 'public.get_fan_effective_tier(uuid,uuid)', 'public.fan_level_rank(text)', 'public.creator_listed(uuid)']::text[]
$$;
select public.platform_fan_ranking_owner_access();
select public.platform_fan_ranking_owner_check();
