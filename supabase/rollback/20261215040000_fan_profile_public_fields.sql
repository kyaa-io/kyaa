-- Rollback for 20261215040000_fan_profile_public_fields.sql. Roll the web back first: the new web calls the profile card and the owned profile fields, which then answer 503.
-- The table goes with its rows: fans lose the favorite, SNS links and intro they wrote.
begin;
set local lock_timeout='5s';
do $patch$
declare def text;anchor text;
begin
 def:=pg_catalog.pg_get_functiondef('public.read_group_people(uuid,uuid,text,text,uuid,integer,public.content_locale)'::regprocedure);
 anchor:=$a$,'stamps',case when g.kind='fan' and not g.anonymous then(select count(*)from public.community_stamps s where s.app_user_id=shown.app_user_id and s.celebrity_id=g.celebrity_id and s.revoked_at is null)::integer end,'fanPoints',case when g.kind='fan' and not g.anonymous then coalesce((select sum(s.points)from public.fan_score_ledger s where s.app_user_id=shown.app_user_id and s.celebrity_id=g.celebrity_id),0)::integer end,'favorite',case when not g.anonymous then(select public.fan_profile_favorite_json(x.favorite_celebrity_id,p_locale)from public.fan_profile_public_fields x where x.app_user_id=shown.app_user_id)end$a$;
 if position(anchor in def)=0 then raise exception 'FAN_PROFILE_PUBLIC_ROLLBACK: member row';end if;
 execute replace(def,anchor,'');
end $patch$;
drop function public.read_social_profile_card(uuid,uuid,uuid,public.content_locale);
drop function public.set_owned_fan_profile_public(uuid,text,text[],text,public.content_locale);
drop function public.read_owned_fan_profile_public(uuid,public.content_locale);
drop function public.fan_profile_favorite_json(uuid,public.content_locale);
drop function public.fan_profile_favorite_options(uuid,public.content_locale);
drop table public.fan_profile_public_fields;
drop function public.fan_profile_links_valid(text[]);
notify pgrst, 'reload schema';
commit;
