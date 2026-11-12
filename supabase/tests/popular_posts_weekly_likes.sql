\set ON_ERROR_STOP on
-- Hot posts by likes (20261224010000): the 7 most recent days of posts, widened to 30 days when fewer than 5 exist; other sorts unchanged.
-- Applies the migration inside the transaction, then rolls everything back. Run on a disposable local database from the repository root.
begin;
\i supabase/migrations/20261224010000_popular_posts_weekly_likes.sql
do $$
declare
  creator constant uuid := '92000000-0000-4000-8000-000000000001';
  author constant uuid := '92000000-0000-4000-8000-000000000002';
  likers uuid[] := array['92000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000004','92000000-0000-4000-8000-000000000005']::uuid[];
  ids uuid[] := array(select ('92000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 8) n);
  result jsonb; got text[]; i int;
begin
  set local session_replication_role = replica;
  update public.fan_posts set hidden_at = now();
  update public.group_posts set removed_at = now();
  insert into public.app_users(id, privy_user_id, verified_email) values
    (author, 'did:privy:weekly-author', 'weekly-author@example.test'),
    (likers[1], 'did:privy:weekly-liker-1', 'weekly-liker-1@example.test'),
    (likers[2], 'did:privy:weekly-liker-2', 'weekly-liker-2@example.test'),
    (likers[3], 'did:privy:weekly-liker-3', 'weekly-liker-3@example.test');
  insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role) values (creator, 'weekly-likes-qa', 'published', '/weekly.webp', now(), '{creator}', 'creator');
  insert into public.celebrity_localizations(celebrity_id, locale, name, summary, image_alt) values (creator, 'ko', '주간 좋아요 검사', '소개', '사진');
  set local session_replication_role = origin;

  -- ids[1..5] written 1..5 days ago with 0,1,2,3,3 likes; ids[6] 20 days ago with 3 likes; ids[7] 60 days ago with 3 likes; ids[8] 40 days ago with 3 likes.
  for i in 1..8 loop
    insert into public.fan_posts(id, celebrity_id, app_user_id, body, visibility, idempotency_key, create_request_hash, created_at, updated_at)
    values (ids[i], creator, author, 'post ' || i, 'public', extensions.gen_random_uuid(), repeat('a', 64),
      now() - (case when i <= 5 then i * interval '1 day' when i = 6 then interval '20 days' when i = 7 then interval '60 days' else interval '40 days' end),
      now() - (case when i <= 5 then i * interval '1 day' when i = 6 then interval '20 days' when i = 7 then interval '60 days' else interval '40 days' end));
  end loop;
  insert into public.fan_post_likes(post_id, app_user_id) values
    (ids[2], likers[1]), (ids[3], likers[1]), (ids[3], likers[2]),
    (ids[4], likers[1]), (ids[4], likers[2]), (ids[4], likers[3]),
    (ids[5], likers[1]), (ids[5], likers[2]), (ids[5], likers[3]),
    (ids[6], likers[1]), (ids[6], likers[2]), (ids[6], likers[3]),
    (ids[7], likers[1]), (ids[7], likers[2]), (ids[7], likers[3]),
    (ids[8], likers[1]), (ids[8], likers[2]), (ids[8], likers[3]);

  -- Five posts inside 7 days: only those five, ranked by likes; the 20-, 40- and 60-day posts with 3 likes stay out.
  result := public.read_public_popular_posts_sorted(null, 'ko', 1, false, 'likes');
  select array_agg(item ->> 'id' order by o) into got from jsonb_array_elements(result -> 'items') with ordinality r(item, o);
  if got is distinct from array[ids[4]::text, ids[5]::text, ids[3]::text, ids[2]::text, ids[1]::text] then raise exception 'Seven-day window wrong: %', result; end if;
  -- The other sorts still see every eligible post.
  result := public.read_public_popular_posts_sorted(null, 'ko', 1, false, 'latest');
  if jsonb_array_length(result -> 'items') <> 8 then raise exception 'Latest must keep old posts: %', result; end if;
  result := public.read_public_popular_posts_sorted(null, 'ko', 1, false, 'comments');
  if jsonb_array_length(result -> 'items') <> 8 then raise exception 'Comments must keep old posts: %', result; end if;

  -- Only four posts inside 7 days: widen to 30 days. The 20-day post joins; the 40- and 60-day posts stay out.
  delete from public.fan_post_likes where post_id = ids[5];
  update public.fan_posts set hidden_at = now() where id = ids[5];
  result := public.read_public_popular_posts_sorted(null, 'ko', 1, false, 'likes');
  select array_agg(item ->> 'id' order by o) into got from jsonb_array_elements(result -> 'items') with ordinality r(item, o);
  if got is distinct from array[ids[4]::text, ids[6]::text, ids[3]::text, ids[2]::text, ids[1]::text] then raise exception 'Thirty-day widening wrong: %', result; end if;

  -- No post at all inside 7 days: the 30-day window still applies and the empty set is not an error.
  update public.fan_posts set created_at = created_at - interval '10 days' where id = any(ids[1:4]);
  result := public.read_public_popular_posts_sorted(null, 'ko', 1, false, 'likes');
  select array_agg(item ->> 'id' order by o) into got from jsonb_array_elements(result -> 'items') with ordinality r(item, o);
  if got is distinct from array[ids[4]::text, ids[6]::text, ids[3]::text, ids[2]::text, ids[1]::text] then raise exception 'Empty week wrong: %', result; end if;
  update public.fan_posts set created_at = now() - interval '45 days' where id = any(ids[1:6]);
  result := public.read_public_popular_posts_sorted(null, 'ko', 1, false, 'likes');
  if jsonb_array_length(result -> 'items') <> 0 or (result ->> 'hasMore')::boolean then raise exception 'Nothing within 30 days should be empty: %', result; end if;
end $$;
rollback;
