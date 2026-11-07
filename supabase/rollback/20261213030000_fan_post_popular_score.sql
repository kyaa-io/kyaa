-- Rollback for 20261213030000_fan_post_popular_score.sql: back to the likes-in-period ranking of 20261208065000.
-- If t3/doc-board-speed 20261212120300 was applied before, rerun that file afterwards to get its lazy visibility pattern back.
-- Select grants and policies added for a non-superuser owner are removed; nothing else changed.
begin;
set local lock_timeout = '5s';

create or replace function public.read_fan_post_period_ranking(p_app_user_id uuid,p_slug text,p_period text,p_locale public.content_locale default 'ko')
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

do $$
declare reader record; t record;
begin
 select o.oid,o.rolname,o.rolsuper into reader
  from pg_proc p join pg_roles o on o.oid=p.proowner
  where p.oid='public.read_fan_post_period_ranking(uuid,text,text,public.content_locale)'::regprocedure;
 if reader.rolsuper then return; end if;
 for t in select * from (values
   ('public.fan_post_comments'::regclass,'post_id,created_at,deleted_at,hidden_at'),
   ('public.fan_post_views'::regclass,'post_id,created_at')) v(rel,cols) loop
  execute format('drop policy if exists %I on %s','fan_post_popular_read_owner_'||reader.rolname,t.rel);
  if not pg_has_role(reader.oid,(select relowner from pg_class where oid=t.rel),'USAGE') then
   execute format('revoke select (%s) on %s from %I',t.cols,t.rel,reader.rolname);
  end if;
 end loop;
end $$;

commit;
