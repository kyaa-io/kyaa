-- Rollback for 20261212050000_social_dm_same_page_condition.sql. The web may stay: without read_social_profile_reach it falls back to the profile's own capabilities.
-- Saved settings are not touched. People who saved 'requests' after the change keep it.
begin;
set local lock_timeout='5s';
alter table public.social_profile_settings alter column dm_policy set default 'friends';
do $patch$
declare f record;def text;anchor text;
begin
 def:=pg_catalog.pg_get_functiondef('public.read_owned_dm_conversations(uuid)'::regprocedure);
 anchor:=$a$'canSend',coalesce((select s.dm_policy from public.social_profile_settings s where s.app_user_id=o.id),'requests')<>'none' and (exists(select 1 from public.social_friendships f where f.user_low_id=d.user_low_id and f.user_high_id=d.user_high_id and f.status='accepted') or d.status='accepted' and coalesce((select s.dm_policy from public.social_profile_settings s where s.app_user_id=o.id),'requests')='requests')$a$;
 if position(anchor in def)=0 then raise exception 'SOCIAL_DM_Q2_ROLLBACK: read_owned_dm_conversations';end if;
 execute replace(def,anchor,$a$'canSend',d.status='accepted' or exists(select 1 from public.social_friendships f where f.user_low_id=d.user_low_id and f.user_high_id=d.user_high_id and f.status='accepted')$a$);

 def:=pg_catalog.pg_get_functiondef('public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer)'::regprocedure);
 anchor:=$a$'canRequestDm',public.social_dm_request_state(p_app_user_id,p_profile_id)='available'$a$;
 if position(anchor in def)=0 then raise exception 'SOCIAL_DM_Q2_ROLLBACK: read_social_fan_profile';end if;
 execute replace(def,anchor,$a$'canRequestDm',coalesce(p_app_user_id<>p_profile_id and policy<>'none' and (policy='requests' or f.status='accepted') and (d.id is null or d.status in ('rejected','cancelled') and coalesce(d.retry_at,'-infinity'::timestamptz)<=now()),false)$a$);

 def:=pg_catalog.pg_get_functiondef('public.request_social_dm(uuid,uuid,text,uuid)'::regprocedure);
 anchor:=$a$if policy='none' or not public.social_profile_is_public(p_profile_id) or (not friends and (policy<>'requests' or not public.social_dm_share_visible_page(p_app_user_id,p_profile_id))) then raise exception 'SOCIAL_FORBIDDEN'; end if;$a$;
 if position(anchor in def)=0 then raise exception 'SOCIAL_DM_Q2_ROLLBACK: request_social_dm';end if;
 execute replace(def,anchor,$a$if not friends and (policy<>'requests' or not public.social_profile_is_public(p_profile_id) or not exists(select 1 from public.social_favorite_visibility mine join public.social_favorite_visibility theirs on theirs.celebrity_id=mine.celebrity_id and theirs.app_user_id=p_profile_id and theirs.visible join public.fan_passports mp on mp.app_user_id=p_app_user_id and mp.celebrity_id=mine.celebrity_id and mp.business_status='issued' join public.fan_passports tp on tp.app_user_id=p_profile_id and tp.celebrity_id=mine.celebrity_id and tp.business_status='issued' where mine.app_user_id=p_app_user_id and mine.visible)) then raise exception 'SOCIAL_FORBIDDEN'; end if;$a$);

 for f in select p.oid from pg_catalog.pg_proc p
  where p.pronamespace='public'::regnamespace and p.proname not in('social_dm_request_state','read_owned_dm_conversations') and p.prosrc ~ $r$select dm_policy from public\.social_profile_settings where app_user_id=[a-z_]+\),'requests'\)$r$ loop
  execute regexp_replace(pg_catalog.pg_get_functiondef(f.oid),$r$(select dm_policy from public\.social_profile_settings where app_user_id=[a-z_]+\),)'requests'\)$r$,$r$\1'friends')$r$,'g');
 end loop;
end $patch$;
drop function public.read_social_profile_reach(uuid,uuid);
drop function public.social_dm_request_state(uuid,uuid);
drop function public.social_dm_share_visible_page(uuid,uuid);
commit;
