begin;

-- Board rows mark posts the page's own artist answered: a like or a visible comment by an account bound to the
-- group page of the post's celebrity (group_artist_bindings, the same link fan_artist_mark uses). The artist's own
-- posts are left out. The feed reads this for the posts it already chose, so visibility stays with the feed RPC.
-- A separate function keeps the existing post JSON unchanged, so a running app with the older strict schema is not affected.
create function public.fan_post_artist_reactions(p_post_ids uuid[])
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(p.id order by p.id),'[]'::jsonb)
 from public.fan_posts p
 where p.id = any(p_post_ids[1:50])
  and exists(
   select 1 from public.group_artist_bindings b
   join public.group_pages gp on gp.id=b.page_id and gp.celebrity_id=p.celebrity_id
   join public.app_users u on u.id=b.app_user_id and u.status='active'
   where b.app_user_id<>p.app_user_id
    and (exists(select 1 from public.fan_post_likes l where l.post_id=p.id and l.app_user_id=b.app_user_id)
     or exists(select 1 from public.fan_post_comments c where c.post_id=p.id and c.app_user_id=b.app_user_id
      and c.deleted_at is null and c.hidden_at is null)));
$$;

revoke all on function public.fan_post_artist_reactions(uuid[]) from public,anon,authenticated;
grant execute on function public.fan_post_artist_reactions(uuid[]) to service_role;

commit;

notify pgrst, 'reload schema';
