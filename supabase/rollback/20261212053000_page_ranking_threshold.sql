-- Rollback for 20261212053000_page_ranking_threshold.sql. Run before the rollback of 20261212052000. The web may stay: without the key it shows the list.
begin;
set local lock_timeout='5s';
do $patch$
declare def text;anchor text;
begin
 def:=pg_catalog.pg_get_functiondef('public.read_group_public_ranking(uuid,uuid)'::regprocedure);
 anchor:=$a$if raw->'available'='false'::jsonb then return$a$;
 if position(anchor in def)=0 then raise exception 'PAGE_RANKING_ROLLBACK: %',left(anchor,40);end if;
 def:=replace(def,anchor,$a$if not coalesce((public.read_celebrity_fan_leaderboard((select c.slug from public.celebrities c where c.id=g.celebrity_id),null,'ko','all')->>'available')::boolean,false)then return$a$);
 execute def;
 def:=pg_catalog.pg_get_functiondef('public.read_page_ranking(uuid,text,text,uuid,timestamptz)'::regprocedure);
 anchor:=$a$'me', public.ranking_my_rank(p_kind, p_celebrity, p_period, p_at, snap.rows, p_viewer)) || case when closed then pg_catalog.jsonb_build_object('available', false) else '{}'::jsonb end;$a$;
 if position(anchor in def)=0 then raise exception 'PAGE_RANKING_ROLLBACK: %',left(anchor,40);end if;
 def:=replace(def,anchor,$a$'me', public.ranking_my_rank(p_kind, p_celebrity, p_period, p_at, snap.rows, p_viewer));$a$);
 anchor:=$a$'computedAt', case when closed then null else snap.computed_at end, 'rows', items,$a$;
 if position(anchor in def)=0 then raise exception 'PAGE_RANKING_ROLLBACK: %',left(anchor,40);end if;
 def:=replace(def,anchor,$a$'computedAt', snap.computed_at, 'rows', items,$a$);
 anchor:=$a$case when coalesce(g.anonymous, false) or closed then '[]'::jsonb else coalesce(snap.rows, '[]'::jsonb) end$a$;
 if position(anchor in def)=0 then raise exception 'PAGE_RANKING_ROLLBACK: %',left(anchor,40);end if;
 def:=replace(def,anchor,$a$case when coalesce(g.anonymous, false) then '[]'::jsonb else coalesce(snap.rows, '[]'::jsonb) end$a$);
 anchor:=$a$select * into snap from public.ranking_snapshots where kind = p_kind and scope_id = p_celebrity and period = p_period and period_start = w.period_start;
  -- The member rule: 100 active fans. Asked after the anonymous check, so an anonymous page tells nothing about its fan count.
  closed := not coalesce(g.anonymous, false) and not public.celebrity_fan_ranking_open(p_celebrity);$a$;
 if position(anchor in def)=0 then raise exception 'PAGE_RANKING_ROLLBACK: %',left(anchor,40);end if;
 def:=replace(def,anchor,$a$select * into snap from public.ranking_snapshots where kind = p_kind and scope_id = p_celebrity and period = p_period and period_start = w.period_start;$a$);
 anchor:=$a$declare w record; snap public.ranking_snapshots; items jsonb; v_slug text; g public.group_pages; closed boolean;$a$;
 if position(anchor in def)=0 then raise exception 'PAGE_RANKING_ROLLBACK: %',left(anchor,40);end if;
 def:=replace(def,anchor,$a$declare w record; snap public.ranking_snapshots; items jsonb; v_slug text; g public.group_pages;$a$);
 execute def;
end $patch$;
create or replace function public.group_public_directory_owner_roles()
returns table(role_oid oid,rolname name,rolsuper boolean,rolbypassrls boolean) language sql stable set search_path='' as $$
 select distinct o.oid,o.rolname,o.rolsuper,o.rolbypassrls from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid=f.proowner
 where f.pronamespace='public'::regnamespace and f.proname in('read_group_public_people','read_group_public_rooms','read_group_public_ranking','social_profile_is_public','read_page_ranking','read_group_people','social_dm_share_visible_page','social_dm_request_state','read_social_profile_reach')
$$;
create or replace function public.group_public_directory_owner_tables()returns text[] language sql immutable set search_path='' as $$
 select array['group_pages','celebrities','app_users','kyaa_wave_participants','group_memberships','social_profile_settings','app_user_moderation_restrictions','user_blocks','user_profiles','group_rooms','ranking_snapshots','app_user_avatars','social_friendships','social_dm_conversations','social_dm_messages','group_artist_bindings']::text[]
$$;
create or replace function public.group_public_directory_owner_functions()returns text[] language sql immutable set search_path='' as $$
 select array['public.group_public_visible_page(uuid,uuid)','public.public_fan_avatar_url(uuid)','public.get_fan_effective_tier(uuid,uuid)','public.read_page_ranking(uuid,text,text,uuid,timestamptz)','public.social_profile_is_public(uuid)','public.ranking_period_window(text,timestamptz)','public.ranking_my_rank(text,uuid,text,timestamptz,jsonb,uuid)','public.social_dm_share_visible_page(uuid,uuid)','public.social_dm_request_state(uuid,uuid)','public.social_dm_request_daily_limit()','public.group_scope_visible(uuid,uuid)','public.read_celebrity_fan_leaderboard(text,uuid,public.content_locale,text)']::text[]
$$;
drop function public.celebrity_fan_ranking_open(uuid);
commit;
