-- Today ranking is a public first-page view. Existing directory and mutation paths remain delegated.
create index group_visits_day_page_actor_idx on public.group_visits(day,page_id,app_user_id);
create index group_posts_public_today_idx on public.group_posts(page_id,created_at) where removed_at is null and visibility='public';
create index fan_posts_public_today_idx on public.fan_posts(celebrity_id,created_at) where deleted_at is null and hidden_at is null and visibility='public';
create index fan_lounge_top_today_idx on public.fan_lounge_messages(celebrity_id,created_at) where removed_at is null and reply_to_id is null;

alter function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_dispatch_before_featured_today;
create function public.groups_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_limit integer; v_day date:=(statement_timestamp() at time zone 'Asia/Seoul')::date; v_start timestamptz; v_result jsonb;
begin
 if p_operation<>'directory' or coalesce(p_input->>'sort','')<>'today' then
  return public.groups_dispatch_before_featured_today(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 end if;
 if p_input->>'cursor' is not null and p_input->>'cursor'<>'' then raise exception 'GROUPS_INVALID_REQUEST'; end if;
 if p_actor is not null and not exists(select 1 from public.app_users where id=p_actor and status='active') then raise exception 'GROUPS_FORBIDDEN'; end if;
 if (p_input->>'mine' is not null or coalesce((p_input->>'owned')::boolean,false)) and p_actor is null then raise exception 'GROUPS_FORBIDDEN'; end if;
 v_limit:=least(greatest(coalesce((p_input->>'limit')::integer,8),1),50);
 v_start:=v_day::timestamp at time zone 'Asia/Seoul';
 with filtered as materialized (
  select gp.id,gp.kind,gp.celebrity_id,gp.created_at
  from public.group_pages gp
  where public.group_scope_visible(null,gp.id)
   and (coalesce(p_input->>'type','all')='all' or gp.kind=p_input->>'type')
   and (p_input->>'artistRole' is null or gp.kind='fan' and exists(select 1 from public.celebrities c where c.id=gp.celebrity_id and c.primary_role::text=p_input->>'artistRole'))
   and (coalesce(p_input->>'search','')='' or gp.name ilike '%'||(p_input->>'search')||'%')
   and (not coalesce((p_input->>'owned')::boolean,false) or exists(select 1 from public.fan_passports fp where fp.app_user_id=p_actor and fp.celebrity_id=gp.celebrity_id and fp.business_status='issued'))
   and (p_input->>'mine' is null or p_input->>'mine'='joined' and exists(select 1 from public.group_memberships m where m.page_id=gp.id and m.app_user_id=p_actor) or p_input->>'mine'='bookmarked' and exists(select 1 from public.group_bookmarks b where b.page_id=gp.id and b.app_user_id=p_actor))
 ), ranked as (
  select f.*,
   (select count(*) from public.group_visits v join public.app_users u on u.id=v.app_user_id and u.status='active' where v.page_id=f.id and v.day=v_day and not exists(select 1 from public.group_artist_bindings b where b.page_id=f.id and b.app_user_id=v.app_user_id)) visitors,
   (select count(*) from public.group_posts p where p.page_id=f.id and p.created_at>=v_start and p.created_at<v_start+interval '1 day' and p.visibility='public' and p.removed_at is null and public.group_post_visible(null,p.id))
   + case when f.kind='fan' and f.celebrity_id is not null and (select count(*) from public.group_pages g where g.kind='fan' and g.celebrity_id=f.celebrity_id and public.group_scope_visible(null,g.id))=1 then
    (select count(*) from public.fan_posts p where p.celebrity_id=f.celebrity_id and p.created_at>=v_start and p.created_at<v_start+interval '1 day' and p.visibility='public' and p.deleted_at is null and p.hidden_at is null and public.fan_web_content_target(null,'fan_post',p.id,'ko') is not null)
    +(select count(*) from public.fan_lounge_messages m where m.celebrity_id=f.celebrity_id and m.created_at>=v_start and m.created_at<v_start+interval '1 day' and m.removed_at is null and m.reply_to_id is null and public.fan_web_content_target(null,'cheer',m.id,'ko') is not null)
   else 0 end posts
  from filtered f
 ), shown as (select * from ranked order by visitors desc,posts desc,created_at desc,id asc limit v_limit)
 select jsonb_build_object('items',coalesce((select jsonb_agg(public.group_page_json(id) order by visitors desc,posts desc,created_at desc,id asc) from shown),'[]'::jsonb),'totalCount',(select count(*) from filtered),'nextCursor',null) into v_result;
 return v_result;
end $$;
revoke all on function public.groups_dispatch_before_featured_today(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;
