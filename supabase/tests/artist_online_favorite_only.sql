-- 20261219041000: the online notice (artist_online) goes only to members who picked the page's creator as their favorite.
-- Members without a favorite or with another creator as favorite: 0. The favorite fan: 1, once per KST day (no duplicate).
-- The fan's artist_online_notifications off and the page's notifications off are still respected. artist_comment recipients unchanged.
-- Real path: the presence trigger (group_presence heartbeat) -> artist_activity_notify_online. One transaction, rolled back. Local DB only.
-- usage: psql -X -v ON_ERROR_STOP=1 -d byus -f supabase/tests/artist_online_favorite_only.sql
do $$ begin if inet_server_addr() is not null and host(inet_server_addr()) not in ('127.0.0.1', '::1') then raise exception 'local database only'; end if; end $$;
begin;
do $$
declare
  page uuid; creator uuid; other_creator uuid; artist uuid; fav uuid; plain uuid; other_fav uuid; off_fan uuid; muted uuid;
  admin_id uuid; ids uuid[]; day0 date; n integer;
begin
  day0 := (now() at time zone 'Asia/Seoul')::date - 3;
  select g.id, g.celebrity_id into page, creator from public.group_pages g where g.status = 'published' and g.celebrity_id is not null order by g.created_at limit 1;
  select id into other_creator from public.celebrities where id <> creator order by id limit 1;
  if page is null or other_creator is null then raise exception 'fixture: need a published page with a creator and a second creator'; end if;
  select id into admin_id from public.admin_allowlist limit 1;
  select array_agg(id) into ids from (select u.id from public.app_users u where u.status = 'active'
    and not exists (select 1 from public.group_memberships m where m.page_id = page and m.app_user_id = u.id)
    and not exists (select 1 from public.group_artist_bindings b where b.app_user_id = u.id) order by u.created_at limit 6) x;
  artist := ids[1]; fav := ids[2]; plain := ids[3]; other_fav := ids[4]; off_fan := ids[5]; muted := ids[6];
  if muted is null then raise exception 'fixture: need six active users'; end if;
  insert into public.group_artist_bindings(page_id, app_user_id, verified_by) values (page, artist, admin_id);
  insert into public.group_artist_presence_settings(app_user_id,enabled,notify_enabled) values (artist, true, true) on conflict (app_user_id) do update set enabled = true, notify_enabled = true;
  insert into public.group_memberships(page_id, app_user_id) values (page, artist), (page, fav), (page, plain), (page, other_fav), (page, off_fan), (page, muted);
  delete from public.notification_preferences where app_user_id = any(ids);
  -- Fixture users may carry artist notices left by earlier local runs; start them empty (rolled back with the rest).
  delete from public.fan_notifications where app_user_id = any(ids) and kind::text in ('artist_comment', 'artist_online');
  delete from public.group_notification_settings where page_id = page and app_user_id = any(ids);
  delete from public.user_blocks where app_user_id = any(ids) or blocked_app_user_id = any(ids);
  delete from public.fan_profile_public_fields where app_user_id = any(ids);
  insert into public.fan_profile_public_fields(app_user_id, favorite_celebrity_id) values
    (fav, creator), (other_fav, other_creator), (off_fan, creator), (muted, creator);
  perform public.fan_web_patch_notification_preferences(off_fan, '{"artist_online_notifications": false}');
  insert into public.group_notification_settings(page_id, app_user_id, enabled) values (page, muted, false)
    on conflict (page_id, app_user_id) do update set enabled = false;
  update public.artist_activity_push_control set inbox_enabled = true;
  delete from public.artist_online_daily where artist_app_user_id = artist;

  -- Heartbeat twice the same KST day, then the next day.
  insert into public.group_presence values (page, artist, (day0 + time '10:00') at time zone 'Asia/Seoul') on conflict (page_id, app_user_id) do update set seen_at = excluded.seen_at;
  update public.group_presence set seen_at = (day0 + time '15:00') at time zone 'Asia/Seoul' where app_user_id = artist and page_id = page;
  select count(*) into n from public.fan_notifications where app_user_id = fav and kind::text = 'artist_online';
  raise notice 'favorite fan same day=%', n;
  if n <> 1 then raise exception 'favorite fan got % (want 1)', n; end if;
  select count(*) into n from public.fan_notifications where app_user_id in (plain, other_fav) and kind::text = 'artist_online';
  raise notice 'no favorite / other favorite=%', n;
  if n <> 0 then raise exception 'non-favorite members got %', n; end if;
  select count(*) into n from public.fan_notifications where app_user_id = off_fan and kind::text = 'artist_online';
  raise notice 'favorite, setting off=%', n;
  if n <> 0 then raise exception 'setting off got %', n; end if;
  select count(*) into n from public.fan_notifications where app_user_id = muted and kind::text = 'artist_online';
  raise notice 'favorite, page notifications off=%', n;
  if n <> 0 then raise exception 'page off got %', n; end if;
  select count(*) into n from public.fan_notifications where app_user_id = artist and kind::text = 'artist_online';
  if n <> 0 then raise exception 'artist notified self'; end if;
  -- a direct second call the same day writes nothing more
  if public.artist_activity_notify_online(page, artist, (day0 + time '18:00') at time zone 'Asia/Seoul') <> 0 then raise exception 'second call wrote'; end if;
  if (select count(*) from public.fan_notifications where app_user_id = fav and kind::text = 'artist_online') <> 1 then raise exception 'duplicate'; end if;
  update public.group_presence set seen_at = (day0 + 1 + time '10:00') at time zone 'Asia/Seoul' where app_user_id = artist and page_id = page;
  select count(*) into n from public.fan_notifications where app_user_id = fav and kind::text = 'artist_online';
  raise notice 'favorite fan next day=%', n;
  if n <> 2 then raise exception 'next day %', n; end if;
  if (select count(*) from public.fan_notifications where app_user_id in (plain, other_fav, off_fan, muted) and kind::text = 'artist_online') <> 0 then raise exception 'next day leaked'; end if;
  -- the notice text fields are the same as before
  if (select payload ?& array['pageId','artistId','artistName','pageName'] from public.fan_notifications where app_user_id = fav and kind::text = 'artist_online' limit 1) is not true
    then raise exception 'payload changed'; end if;

  -- Recipients read directly: online = fav only; comment = every member but the artist and the opted-out page (unchanged).
  if (select array_agg(app_user_id) from public.artist_activity_recipients(page, artist, 'artist_online', null, null) where app_user_id = any(ids)) is distinct from array[fav]
    then raise exception 'online recipients %', (select array_agg(app_user_id) from public.artist_activity_recipients(page, artist, 'artist_online', null, null) where app_user_id = any(ids)); end if;
  select count(*) into n from public.artist_activity_recipients(page, artist, 'artist_comment', null, null) where app_user_id = any(ids);
  raise notice 'comment recipients among fixtures=% (want 4: fav, plain, other_fav, off_fan)', n;
  if n <> 4 then raise exception 'comment recipients changed: %', n; end if;
  -- the favorite changed away -> no longer a recipient
  update public.fan_profile_public_fields set favorite_celebrity_id = other_creator where app_user_id = fav;
  if exists (select 1 from public.artist_activity_recipients(page, artist, 'artist_online', null, null) where app_user_id = fav) then raise exception 'old favorite still notified'; end if;
  raise notice 'RESULT artist_online_favorite_only ok';
end $$;
rollback;
