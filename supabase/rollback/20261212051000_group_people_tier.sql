-- Rollback for 20261212051000_group_people_tier.sql. Run before the rollback of 20261212050000. The web may stay: it shows the role when a row has no grade.
-- Access granted to function owners stays, as in the earlier directory migrations.
begin;
set local lock_timeout='5s';
do $patch$
declare def text;anchor text;
begin
 def:=pg_catalog.pg_get_functiondef('public.read_group_people(uuid,uuid,text,text,uuid,integer,public.content_locale)'::regprocedure);
 anchor:=$a$ and not exists(select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id=m.app_user_id and mr.revoked_at is null)$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_PEOPLE_TIER_ROLLBACK: filter';end if;
 def:=replace(def,anchor,'');
 anchor:=$a$'role',role,'rank',rank,'points',points,'tier',case when g.kind='fan' and not g.anonymous then public.get_fan_effective_tier(app_user_id,g.celebrity_id) end)order by$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_PEOPLE_TIER_ROLLBACK: row';end if;
 execute replace(def,anchor,$a$'role',role,'rank',rank,'points',points)order by$a$);
end $patch$;
create or replace function public.group_public_directory_owner_roles()
returns table(role_oid oid,rolname name,rolsuper boolean,rolbypassrls boolean) language sql stable set search_path='' as $$
 select distinct o.oid,o.rolname,o.rolsuper,o.rolbypassrls from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid=f.proowner
 where f.pronamespace='public'::regnamespace and f.proname in('read_group_public_people','read_group_public_rooms','read_group_public_ranking','social_profile_is_public','read_page_ranking')
$$;
create or replace function public.group_public_directory_owner_tables()returns text[] language sql immutable set search_path='' as $$
 select array['group_pages','celebrities','app_users','kyaa_wave_participants','group_memberships','social_profile_settings','app_user_moderation_restrictions','user_blocks','user_profiles','group_rooms','ranking_snapshots','app_user_avatars']::text[]
$$;
create or replace function public.group_public_directory_owner_functions()returns text[] language sql immutable set search_path='' as $$
 select array['public.group_public_visible_page(uuid,uuid)','public.public_fan_avatar_url(uuid)','public.get_fan_effective_tier(uuid,uuid)','public.read_page_ranking(uuid,text,text,uuid,timestamptz)','public.social_profile_is_public(uuid)','public.ranking_period_window(text,timestamptz)','public.ranking_my_rank(text,uuid,text,timestamptz,jsonb,uuid)']::text[]
$$;
commit;
