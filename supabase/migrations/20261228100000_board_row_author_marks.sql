begin;

-- Board rows show the writer's picture, and mark the page's own artist.
-- Separate functions keep the existing feed and Hot board JSON unchanged, so a running app with the older strict
-- schema is not affected. Both read only for rows the feed already chose, so visibility stays with the feed RPC.

-- Board items (fan posts and cheers) written by an artist linked to a page of the same creator.
create function public.fan_feed_artist_authors(p_ids uuid[])
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(s.id order by s.id),'[]'::jsonb)
 from (
  select f.id,f.celebrity_id,f.app_user_id from public.fan_posts f where f.id = any(p_ids[1:50])
  union all
  select m.id,m.celebrity_id,m.app_user_id from public.fan_lounge_messages m where m.id = any(p_ids[1:50])
 ) s
 where exists(select 1 from public.group_artist_bindings b join public.group_pages gp on gp.id=b.page_id
   where gp.celebrity_id=s.celebrity_id and b.app_user_id=s.app_user_id);
$$;

-- The writer's public picture for Hot board rows, keyed "fan:<post id>" / "group:<post id>".
-- An anonymous group post gets the default picture, so the picture cannot reveal who wrote it.
create function public.public_post_author_avatars(p_fan_post_ids uuid[],p_group_post_ids uuid[])
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(s.key,s.url),'{}'::jsonb)
 from (
  select 'fan:'||f.id as key,public.public_fan_avatar_url(f.app_user_id) as url
  from public.fan_posts f where f.id = any(p_fan_post_ids[1:50]) and f.visibility='public' and f.deleted_at is null and f.hidden_at is null
  union all
  select 'group:'||p.id,case when p.anonymous then '/images/avatars/star-pink.webp' else public.public_fan_avatar_url(p.author_id) end
  from public.group_posts p where p.id = any(p_group_post_ids[1:50]) and p.visibility='public' and p.removed_at is null
 ) s;
$$;

revoke all on function public.fan_feed_artist_authors(uuid[]) from public,anon,authenticated;
grant execute on function public.fan_feed_artist_authors(uuid[]) to service_role;
revoke all on function public.public_post_author_avatars(uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.public_post_author_avatars(uuid[],uuid[]) to service_role;

commit;

notify pgrst, 'reload schema';
