begin;
-- /api/groups/{id}/people rows carry the fan grade the signed-out list already shows. Public fields stay name, picture and grade.
-- No grade on anonymous pages. Sanctioned members leave this list as they already left the signed-out one and the profile.
-- The response only gains a key, and the old web's schema drops unknown keys, so either side can ship first.
do $patch$
declare def text;anchor text;f record;
begin
 def:=pg_catalog.pg_get_functiondef('public.read_group_people(uuid,uuid,text,text,uuid,integer,public.content_locale)'::regprocedure);
 anchor:=$a$where m.page_id=g.id and not public.fan_web_blocked(p_actor,m.app_user_id)$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_PEOPLE_TIER_UNPATCHED: filter';end if;
 def:=replace(def,anchor,anchor||$a$ and not exists(select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id=m.app_user_id and mr.revoked_at is null)$a$);
 anchor:=$a$'role',role,'rank',rank,'points',points)order by$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_PEOPLE_TIER_UNPATCHED: row';end if;
 execute replace(def,anchor,$a$'role',role,'rank',rank,'points',points,'tier',case when g.kind='fan' and not g.anonymous then public.get_fan_effective_tier(app_user_id,g.celebrity_id) end)order by$a$);
end $patch$;

-- AWS mixes owners. These definers filter on FORCE RLS tables, and a filter that reads no row passes everyone, so their owners go through the same access and check.
create or replace function public.group_public_directory_owner_roles()
returns table(role_oid oid,rolname name,rolsuper boolean,rolbypassrls boolean) language sql stable set search_path='' as $$
 select distinct o.oid,o.rolname,o.rolsuper,o.rolbypassrls from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid=f.proowner
 where f.pronamespace='public'::regnamespace and f.proname in('read_group_public_people','read_group_public_rooms','read_group_public_ranking','social_profile_is_public','read_page_ranking','read_group_people','social_dm_share_visible_page','social_dm_request_state','read_social_profile_reach')
$$;
create or replace function public.group_public_directory_owner_tables()returns text[] language sql immutable set search_path='' as $$
 select array['group_pages','celebrities','app_users','kyaa_wave_participants','group_memberships','social_profile_settings','app_user_moderation_restrictions','user_blocks','user_profiles','group_rooms','ranking_snapshots','app_user_avatars','social_friendships','social_dm_conversations','social_dm_messages','group_artist_bindings']::text[]
$$;
create or replace function public.group_public_directory_owner_functions()returns text[] language sql immutable set search_path='' as $$
 select array['public.group_public_visible_page(uuid,uuid)','public.public_fan_avatar_url(uuid)','public.get_fan_effective_tier(uuid,uuid)','public.read_page_ranking(uuid,text,text,uuid,timestamptz)','public.social_profile_is_public(uuid)','public.ranking_period_window(text,timestamptz)','public.ranking_my_rank(text,uuid,text,timestamptz,jsonb,uuid)','public.social_dm_share_visible_page(uuid,uuid)','public.social_dm_request_state(uuid,uuid)','public.social_dm_request_daily_limit()','public.group_scope_visible(uuid,uuid)']::text[]
$$;
select public.group_public_directory_owner_access();
select public.group_public_directory_owner_check();
commit;
