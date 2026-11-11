-- Calendar periods use Korea time; rank eligible posts by recommendations, then newest.
begin;
set local lock_timeout='5s';
create or replace function public.read_fan_post_period_ranking(p_app_user_id uuid,p_slug text,p_period text,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; v_since timestamptz;
begin
 v_since:=case p_period when 'day' then date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' when 'week' then date_trunc('week',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' when 'month' then date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' else null end;
 if v_since is null then raise exception 'FAN_WEB_INVALID_INPUT' using errcode='22023'; end if;
 with creator as (select id from public.celebrities where slug=p_slug and status='published' and archived_at is null),
 pool as (
  select p.id,p.created_at from public.fan_posts p join creator c on c.id=p.celebrity_id
  where p.deleted_at is null and p.hidden_at is null and p.created_at>=v_since and p.created_at<=now()
  order by p.created_at desc,p.id desc),
 scored as (
  select pl.id,pl.created_at,
   (select count(*) from public.fan_post_likes l join public.app_users u on u.id=l.app_user_id and u.status='active' where l.post_id=pl.id) score
  from pool pl),
 ordered as (select * from scored order by score desc,created_at desc,id desc offset 0),
 ranked as (select * from ordered where public.fan_web_content_visible(p_app_user_id,'fan_post',id) limit 10)
 select jsonb_build_object('items',coalesce(jsonb_agg(public.fan_web_post_json(p_app_user_id,id,p_locale) order by score desc,created_at desc,id desc),'[]'::jsonb)) into result from ranked;
 return result;
end $$;
revoke all on function public.read_fan_post_period_ranking(uuid,text,text,public.content_locale) from public,anon,authenticated;
grant execute on function public.read_fan_post_period_ranking(uuid,text,text,public.content_locale) to service_role;

commit;
