begin;

-- Signed-in readers see the shared Hot board list minus posts whose writer they blocked or who blocked them.
-- The server filters the shared list with this one read, so ranking stays in read_public_popular_posts_period.
-- Returns "fan:<post id>" / "group:<post id>" keys only; the writer is never returned. Same rule as fan_web_blocked.
create function public.popular_post_blocked_keys(p_app_user_id uuid,p_fan_post_ids uuid[],p_group_post_ids uuid[])
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(s.key order by s.key),'[]'::jsonb)
 from (
  select 'fan:'||f.id as key,f.app_user_id as author from public.fan_posts f where f.id = any(p_fan_post_ids[1:200])
  union all
  select 'group:'||p.id,p.author_id from public.group_posts p where p.id = any(p_group_post_ids[1:200])
 ) s
 where exists(select 1 from public.user_blocks b
   where (b.app_user_id=p_app_user_id and b.blocked_app_user_id=s.author)
      or (b.app_user_id=s.author and b.blocked_app_user_id=p_app_user_id));
$$;

revoke all on function public.popular_post_blocked_keys(uuid,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.popular_post_blocked_keys(uuid,uuid[],uuid[]) to service_role;

commit;

notify pgrst, 'reload schema';
