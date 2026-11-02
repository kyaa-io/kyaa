-- Network reads remain authenticated, collection-manager scoped and bounded across instances.
create table public.group_collection_import_limits(
 app_user_id uuid primary key references public.app_users(id) on delete cascade,
 window_started_at timestamptz not null,
 request_count integer not null check(request_count between 1 and 20)
);
alter table public.group_collection_import_limits enable row level security;
revoke all on public.group_collection_import_limits from public,anon,authenticated,service_role;
create function public.group_authorize_collection_import(p_actor uuid,p_page_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare total integer;
begin
 perform public.fan_web_lock_active_user(p_actor);
 if not public.group_scope_visible(p_actor,p_page_id)then raise exception 'GROUP_ACTIVITY_NOT_FOUND';end if;
 if not exists(select 1 from public.group_pages g where g.id=p_page_id and g.status='published'and(g.celebrity_id is null or exists(select 1 from public.celebrities c where c.id=g.celebrity_id and c.status='published'and c.archived_at is null)))then raise exception 'GROUP_ACTIVITY_NOT_FOUND';end if;
 if not exists(select 1 from public.group_memberships where page_id=p_page_id and app_user_id=p_actor and role in('owner','manager'))then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
 insert into public.group_collection_import_limits(app_user_id,window_started_at,request_count)values(p_actor,clock_timestamp(),1)
 on conflict(app_user_id)do update set
 request_count=case when group_collection_import_limits.window_started_at<=clock_timestamp()-interval'1 minute'then 1 else group_collection_import_limits.request_count+1 end,
 window_started_at=case when group_collection_import_limits.window_started_at<=clock_timestamp()-interval'1 minute'then clock_timestamp()else group_collection_import_limits.window_started_at end
 where group_collection_import_limits.window_started_at<=clock_timestamp()-interval'1 minute'or group_collection_import_limits.request_count<20
 returning request_count into total;
 if total is null then raise exception 'GROUP_COLLECTION_IMPORT_RATE_LIMITED';end if;
 return true;
end $$;
revoke all on function public.group_authorize_collection_import(uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function public.group_authorize_collection_import(uuid,uuid)to service_role;
