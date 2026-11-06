begin;
-- The signed-out fan ranking follows the member rule: closed until read_celebrity_fan_leaderboard says 100 active fans. No second rule.
-- Closed answers carry available:false and no names. Open, anonymous and hobby answers keep their old keys.
-- WEB FIRST. groupPublicRankingSchema is strict: the old web answers 503 to the new key on pages under 100 fans.
do $patch$
declare def text;anchor text;
begin
 def:=pg_catalog.pg_get_functiondef('public.read_group_public_ranking(uuid,uuid)'::regprocedure);
 -- After the anonymous check, so the answer says nothing about how many fans an anonymous page has.
 anchor:=$a$ if g.anonymous then return jsonb_build_object('computedAt',raw->'computedAt','rows','[]'::jsonb);end if;$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_PUBLIC_RANKING_UNPATCHED';end if;
 execute replace(def,anchor,anchor||$a$
 if not coalesce((public.read_celebrity_fan_leaderboard((select c.slug from public.celebrities c where c.id=g.celebrity_id),null,'ko','all')->>'available')::boolean,false)then return jsonb_build_object('computedAt',null,'rows','[]'::jsonb,'available',false);end if;$a$);
end $patch$;
create or replace function public.group_public_directory_owner_functions()returns text[] language sql immutable set search_path='' as $$
 select array['public.group_public_visible_page(uuid,uuid)','public.public_fan_avatar_url(uuid)','public.get_fan_effective_tier(uuid,uuid)','public.read_page_ranking(uuid,text,text,uuid,timestamptz)','public.social_profile_is_public(uuid)','public.ranking_period_window(text,timestamptz)','public.ranking_my_rank(text,uuid,text,timestamptz,jsonb,uuid)','public.social_dm_share_visible_page(uuid,uuid)','public.social_dm_request_state(uuid,uuid)','public.social_dm_request_daily_limit()','public.group_scope_visible(uuid,uuid)','public.read_celebrity_fan_leaderboard(text,uuid,public.content_locale,text)']::text[]
$$;
select public.group_public_directory_owner_access();
select public.group_public_directory_owner_check();
commit;
