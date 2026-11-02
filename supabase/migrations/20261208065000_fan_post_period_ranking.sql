-- Rank only posts visible to the requesting viewer using likes created in the selected period.
create function public.read_fan_post_period_ranking(p_app_user_id uuid,p_slug text,p_period text,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; v_since timestamptz;
begin
 v_since:=case p_period when 'day' then now()-interval '1 day' when 'week' then now()-interval '7 days' when 'month' then now()-interval '30 days' else null end;
 if v_since is null then raise exception 'FAN_WEB_INVALID_INPUT' using errcode='22023'; end if;
 with creator as (select id from public.celebrities where slug=p_slug and status='published' and archived_at is null),
 ranked as (select p.id,p.created_at,count(l.app_user_id) score from public.fan_posts p join creator c on c.id=p.celebrity_id join public.fan_post_likes l on l.post_id=p.id and l.created_at>=v_since join public.app_users u on u.id=l.app_user_id and u.status='active' where public.fan_web_content_visible(p_app_user_id,'fan_post',p.id) group by p.id,p.created_at order by score desc,p.created_at desc,p.id desc limit 10)
 select jsonb_build_object('items',coalesce(jsonb_agg(public.fan_web_post_json(p_app_user_id,id,p_locale) order by score desc,created_at desc,id desc),'[]'::jsonb)) into result from ranked;
 return result;
end $$;
revoke all on function public.read_fan_post_period_ranking(uuid,text,text,public.content_locale) from public,anon,authenticated;
grant execute on function public.read_fan_post_period_ranking(uuid,text,text,public.content_locale) to service_role;
