-- Rollback for 20261212052000_group_public_ranking_threshold.sql. The web may stay: without the key it shows the list. Run before the rollback of 20261212051000.
begin;
set local lock_timeout='5s';
do $patch$
declare def text;anchor text;
begin
 def:=pg_catalog.pg_get_functiondef('public.read_group_public_ranking(uuid,uuid)'::regprocedure);
 anchor:=$a$
 if not coalesce((public.read_celebrity_fan_leaderboard((select c.slug from public.celebrities c where c.id=g.celebrity_id),null,'ko','all')->>'available')::boolean,false)then return jsonb_build_object('computedAt',null,'rows','[]'::jsonb,'available',false);end if;$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_PUBLIC_RANKING_ROLLBACK';end if;
 execute replace(def,anchor,'');
end $patch$;
create or replace function public.group_public_directory_owner_functions()returns text[] language sql immutable set search_path='' as $$
 select array['public.group_public_visible_page(uuid,uuid)','public.public_fan_avatar_url(uuid)','public.get_fan_effective_tier(uuid,uuid)','public.read_page_ranking(uuid,text,text,uuid,timestamptz)','public.social_profile_is_public(uuid)','public.ranking_period_window(text,timestamptz)','public.ranking_my_rank(text,uuid,text,timestamptz,jsonb,uuid)','public.social_dm_share_visible_page(uuid,uuid)','public.social_dm_request_state(uuid,uuid)','public.social_dm_request_daily_limit()','public.group_scope_visible(uuid,uuid)']::text[]
$$;
commit;
