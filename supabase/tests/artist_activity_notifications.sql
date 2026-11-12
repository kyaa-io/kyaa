-- 261107-2 E6 acceptance checks for 20261216031000_artist_activity_notifications (applied). One transaction, rolled back.
-- usage: psql -X -v ON_ERROR_STOP=1 -d byus -f supabase/tests/artist_activity_notifications.sql
begin;
do $$
declare
  page uuid; artist uuid; fan uuid; outsider uuid; post uuid; cm uuid; n integer; c integer; path text; day0 date; t0 timestamptz;
  admin_id uuid; sub uuid; ids uuid[]; inst uuid; dlv uuid; r jsonb; jobs integer; members integer;
  function_result integer;
begin
  day0 := (now() at time zone 'Asia/Seoul')::date - 2;
  t0 := (day0 + time '09:00') at time zone 'Asia/Seoul';
  -- 20261219041000: the online notice needs the page's creator as the fan's favorite, so the page has a creator.
  select g.id into page from public.group_pages g where g.status = 'published' and g.celebrity_id is not null order by g.created_at limit 1;
  select id into admin_id from public.admin_allowlist limit 1;
  select array_agg(id) into ids from (select u.id from public.app_users u where u.status = 'active'
    and not exists (select 1 from public.group_memberships m where m.page_id = page and m.app_user_id = u.id)
    and not exists (select 1 from public.group_artist_bindings b where b.app_user_id = u.id) order by u.created_at limit 3) x;
  artist := ids[1]; fan := ids[2]; outsider := ids[3];
  if outsider is null then raise exception 'fixture: need three active users'; end if;
  insert into public.group_artist_bindings(page_id, app_user_id, verified_by) values (page, artist, admin_id);
  insert into public.group_artist_presence_settings(app_user_id,enabled,notify_enabled) values (artist, true, true) on conflict (app_user_id) do update set enabled = true, notify_enabled = true;
  insert into public.group_memberships(page_id, app_user_id) values (page, artist), (page, fan);
  delete from public.notification_preferences where app_user_id = fan;
  -- Fixture users may carry artist notices left by earlier local runs; start them empty (rolled back with the rest).
  delete from public.fan_notifications where app_user_id = any(ids) and kind::text in ('artist_comment', 'artist_online');
  insert into public.fan_profile_public_fields(app_user_id, favorite_celebrity_id) values (fan, (select celebrity_id from public.group_pages where id = page))
    on conflict (app_user_id) do update set favorite_celebrity_id = excluded.favorite_celebrity_id;
  delete from public.user_blocks where (app_user_id = fan and blocked_app_user_id = artist) or (app_user_id = artist and blocked_app_user_id = fan);
  update public.artist_activity_push_control set mode = 'test', test_user_ids = '{}', inbox_enabled = false;
  insert into public.push_subscriptions(app_user_id, endpoint, endpoint_hash, p256dh, auth_secret)
    values (fan, 'https://fcm.googleapis.com/fcm/send/artist-activity-probe', encode(extensions.digest('artist-activity-probe', 'sha256'), 'hex'), repeat('p', 40), repeat('a', 16))
    returning id into sub;
  insert into public.group_posts(page_id, author_id, title, body, visibility, anonymous) values (page, fan, '시험 글', '본문', 'members', false) returning id into post;

  -- 0. Inbox switch off (the state right after the migration): a comment, a heartbeat and a direct call write nothing at all,
  -- no notice, no online marker, no job, no failure.
  insert into public.group_comments(post_id, author_id, body, anonymous) values (post, artist, '꺼짐 댓글', false) returning id into cm;
  perform public.artist_activity_notify_comment(cm, t0);
  delete from public.artist_online_daily where artist_app_user_id = artist;
  insert into public.group_presence values (page, artist, now()) on conflict (page_id, app_user_id) do update set seen_at = excluded.seen_at;
  select count(*) into n from public.fan_notifications where kind::text in ('artist_comment', 'artist_online') and payload ->> 'artistId' = artist::text;
  select (select count(*) from public.artist_online_daily where artist_app_user_id = artist) + (select count(*) from public.artist_activity_jobs where artist_app_user_id = artist)
    + (select count(*) from public.artist_activity_failures where artist_app_user_id = artist) into c;
  raise notice 'OFF notices=% markers+jobs+failures=% maintenance=%', n, c, public.enqueue_due_notification_maintenance(now()) ->> 'artistActivityNotifications';
  if n <> 0 or c <> 0 then raise exception 'OFF switch wrote rows'; end if;
  update public.artist_activity_push_control set inbox_enabled = true;

  -- 1. A real comment (trigger path): the member gets one notice, the outsider none, and the inbox link lands on the comment.
  insert into public.group_comments(post_id, author_id, body, anonymous) values (post, artist, '안녕하세요', false) returning id into cm;
  select count(*) into n from public.fan_notifications where app_user_id = fan and kind::text = 'artist_comment';
  select count(*) into c from public.fan_notifications where app_user_id = outsider and kind::text = 'artist_comment';
  path := public.fan_web_notification_path(fan, (select id from public.fan_notifications where app_user_id = fan and kind::text = 'artist_comment'));
  raise notice 'AC1 member=% outsider=% path=%', n, c, path;
  if n <> 1 or c <> 0 or path is distinct from '/pages/groups/' || page || '?tab=board&post=' || post || '#comment-' || cm then raise exception 'AC1 failed'; end if;
  if (select count(*) from jsonb_array_elements(public.get_owned_web_notifications(fan, 'ko')) x where x ->> 'kind' = 'artist_comment') <> 1 then raise exception 'AC1 inbox read failed'; end if;
  if exists (select 1 from public.notification_delivery_plans p join public.fan_notifications f on f.id = p.notification_id where f.kind::text in ('artist_comment','artist_online'))
    then raise exception 'AC1 email/kakao plan created'; end if;
  delete from public.notification_delivery_outbox where subscription_id = sub;
  delete from public.fan_notifications where kind::text = 'artist_comment' and app_user_id in (fan, outsider);

  -- 2. Three comments within the hour -> one notice, count 3. One more at +61 minutes -> two notices.
  alter table public.group_comments disable trigger artist_activity_comment;
  for i in 0..2 loop
    insert into public.group_comments(post_id, author_id, body, anonymous) values (post, artist, '댓글 ' || i, false) returning id into cm;
    perform public.artist_activity_notify_comment(cm, t0 + make_interval(mins => i * 10));
  end loop;
  select count(*), max((payload ->> 'count')::integer) into n, c from public.fan_notifications where app_user_id = fan and kind::text = 'artist_comment';
  raise notice 'AC2 notices=% count=% unread badge=%', n, c, public.count_owned_web_notifications(fan);
  if n <> 1 or c <> 3 then raise exception 'AC2 bundle failed'; end if;
  -- 8. the unread badge counts the bundle once
  if (select count(*) from public.fan_notifications f where f.app_user_id = fan and f.read_at is null and f.kind::text = 'artist_comment' and public.fan_web_notification_path(fan, f.id) is not null) <> 1 then raise exception 'AC8 failed'; end if;
  insert into public.group_comments(post_id, author_id, body, anonymous) values (post, artist, '61분 뒤', false) returning id into cm;
  perform public.artist_activity_notify_comment(cm, t0 + interval '61 minutes');
  select count(*) into n from public.fan_notifications where app_user_id = fan and kind::text = 'artist_comment';
  raise notice 'AC2 after 61 minutes notices=%', n;
  if n <> 2 then raise exception 'AC2 window failed'; end if;

  -- 5. 23:30 KST: inbox row, no push row. 09:00 with the fan on the dev list: one push row; the 23:30 row is never sent later.
  delete from public.notification_delivery_outbox where subscription_id = sub;
  delete from public.fan_notifications where kind::text = 'artist_comment' and app_user_id = fan;
  update public.artist_activity_push_control set test_user_ids = array[fan];
  insert into public.group_comments(post_id, author_id, body, anonymous) values (post, artist, '밤 댓글', false) returning id into cm;
  perform public.artist_activity_notify_comment(cm, (day0 + time '23:30') at time zone 'Asia/Seoul');
  select count(*) into n from public.fan_notifications where app_user_id = fan and kind::text = 'artist_comment';
  select count(*) into c from public.notification_delivery_outbox where subscription_id = sub;
  raise notice 'AC5 23:30 inbox=% push=%', n, c;
  if n <> 1 or c <> 0 then raise exception 'AC5 quiet failed'; end if;
  insert into public.group_comments(post_id, author_id, body, anonymous) values (post, artist, '아침 댓글', false) returning id into cm;
  perform public.artist_activity_notify_comment(cm, (day0 + 1 + time '09:00') at time zone 'Asia/Seoul');
  select count(*) into n from public.fan_notifications where app_user_id = fan and kind::text = 'artist_comment';
  select count(*) into c from public.notification_delivery_outbox o join public.fan_notifications f on f.id = o.notification_id where o.subscription_id = sub;
  raise notice 'AC5 09:00 inbox=% push=% (night row pushed=%)', n, c,
    (select count(*) from public.notification_delivery_outbox o join public.fan_notifications f on f.id = o.notification_id where o.subscription_id = sub and f.payload ->> 'targetId' <> cm::text);
  if n <> 2 or c <> 1 then raise exception 'AC5 day failed'; end if;
  -- claim-time gate: the same row is not sendable at 23:30, and not for a fan off the dev list
  if public.notification_delivery_is_eligible((select notification_id from public.notification_delivery_outbox where subscription_id = sub), (day0 + 1 + time '23:30') at time zone 'Asia/Seoul')
    then raise exception 'AC5 claim gate failed (night)'; end if;
  update public.artist_activity_push_control set test_user_ids = '{}';
  if public.notification_delivery_is_eligible((select notification_id from public.notification_delivery_outbox where subscription_id = sub), (day0 + 1 + time '10:00') at time zone 'Asia/Seoul')
    then raise exception 'AC5 claim gate failed (not listed)'; end if;
  -- default control (test, nobody listed): no push row at 09:00
  delete from public.notification_delivery_outbox where subscription_id = sub;
  delete from public.fan_notifications where kind::text = 'artist_comment' and app_user_id = fan;
  insert into public.group_comments(post_id, author_id, body, anonymous) values (post, artist, '목록 밖', false) returning id into cm;
  perform public.artist_activity_notify_comment(cm, (day0 + 1 + time '12:00') at time zone 'Asia/Seoul');
  select count(*) into c from public.notification_delivery_outbox where subscription_id = sub;
  raise notice 'AC5 not on the dev list push=%', c;
  if c <> 0 then raise exception 'AC5 allow list failed'; end if;

  -- 6. Setting off -> no notice.
  delete from public.fan_notifications where kind::text = 'artist_comment' and app_user_id = fan;
  perform public.fan_web_patch_notification_preferences(fan, '{"artist_activity_notifications": false}');
  insert into public.group_comments(post_id, author_id, body, anonymous) values (post, artist, '설정 끔', false) returning id into cm;
  function_result := public.artist_activity_notify_comment(cm, (day0 + 1 + time '13:00') at time zone 'Asia/Seoul');
  select count(*) into n from public.fan_notifications where app_user_id = fan and kind::text = 'artist_comment';
  raise notice 'AC6 setting off notices=%', n;
  if n <> 0 then raise exception 'AC6 failed'; end if;

  -- 3. Online twice the same KST day -> one notice; next day -> a second one (through the presence trigger).
  delete from public.artist_online_daily where artist_app_user_id = artist;
  delete from public.group_presence where app_user_id = artist and page_id = page;
  insert into public.group_presence values (page, artist, (day0 + time '10:00') at time zone 'Asia/Seoul');
  update public.group_presence set seen_at = (day0 + time '15:00') at time zone 'Asia/Seoul' where app_user_id = artist and page_id = page;
  select count(*) into n from public.fan_notifications where app_user_id = fan and kind::text = 'artist_online';
  raise notice 'AC3 same day notices=% path=%', n, public.fan_web_notification_path(fan, (select id from public.fan_notifications where app_user_id = fan and kind::text = 'artist_online' limit 1));
  if n <> 1 then raise exception 'AC3 same day failed'; end if;
  update public.group_presence set seen_at = (day0 + 1 + time '10:00') at time zone 'Asia/Seoul' where app_user_id = artist and page_id = page;
  select count(*) into n from public.fan_notifications where app_user_id = fan and kind::text = 'artist_online';
  raise notice 'AC3 next day notices=%', n;
  if n <> 2 then raise exception 'AC3 next day failed'; end if;

  -- 4. Notification consent off while display sharing stays on -> no online notice.
  update public.group_artist_presence_settings set notify_enabled = false where app_user_id = artist;
  update public.group_presence set seen_at = (day0 + 2 + time '10:00') at time zone 'Asia/Seoul' where app_user_id = artist and page_id = page;
  select count(*) into n from public.fan_notifications where app_user_id = fan and kind::text = 'artist_online';
  raise notice 'AC4 notification consent off notices=%', n;
  if n <> 2 then raise exception 'AC4 failed'; end if;

  -- Anonymous comments and non-artists never notify.
  update public.group_artist_presence_settings set notify_enabled = true where app_user_id = artist;
  perform public.fan_web_patch_notification_preferences(fan, '{"artist_activity_notifications": true}');
  insert into public.group_comments(post_id, author_id, body, anonymous) values (post, outsider, '일반 팬', false) returning id into cm;
  if public.artist_activity_notify_comment(cm) <> 0 then raise exception 'non-artist notified'; end if;

  -- M2 (review r5): a mobile push already queued is refused at prepare time when the gate now says no (operator stop).
  update public.artist_activity_push_control set mode = 'test', test_user_ids = array[fan];
  insert into public.mobile_app_settings(app_user_id, push_enabled) values (fan, true) on conflict (app_user_id) do update set push_enabled = true;
  insert into public.mobile_installations(app_user_id, installation_id, platform, push_token, push_token_hash, permission, app_version, locale)
    values (fan, extensions.gen_random_uuid(), 'ios', 'probe-token-artist', encode(extensions.digest('probe-token-artist', 'sha256'), 'hex'), 'authorized', '1.0', 'ko') returning id into inst;
  delete from public.fan_notifications where kind::text = 'artist_comment' and app_user_id = fan;
  insert into public.group_comments(post_id, author_id, body, anonymous) values (post, artist, '앱 푸시', false) returning id into cm;
  perform public.artist_activity_notify_comment(cm, (day0 + 1 + time '10:00') at time zone 'Asia/Seoul');
  select d.id into dlv from public.mobile_push_delivery_outbox d join public.fan_notifications f on f.id = d.notification_id where d.installation_row_id = inst and f.kind::text = 'artist_comment';
  if dlv is null then raise exception 'M2 fixture: no mobile delivery queued'; end if;
  update public.mobile_push_delivery_outbox set status = 'processing', lease_owner = 'artist-probe', lease_expires_at = clock_timestamp() + interval '5 minutes' where id = dlv;
  update public.artist_activity_push_control set mode = 'disabled', test_user_ids = '{}';
  r := public.mobile_prepare_push_delivery(dlv, 'artist-probe');
  raise notice 'M2 prepare after stop -> % (status %, %)', r, (select status from public.mobile_push_delivery_outbox where id = dlv), (select last_error_code from public.mobile_push_delivery_outbox where id = dlv);
  if r is not null or (select last_error_code from public.mobile_push_delivery_outbox where id = dlv) <> 'CURRENT_STATE_INELIGIBLE' then raise exception 'M2 failed'; end if;

  -- H2 (review r5): a failing notice write is recorded, and the comment still saves.
  alter table public.fan_notifications add constraint artist_probe_refuse check (kind::text <> 'artist_online') not valid;
  delete from public.artist_online_daily where artist_app_user_id = artist;
  update public.group_presence set seen_at = (day0 + 5 + time '10:00') at time zone 'Asia/Seoul' where app_user_id = artist and page_id = page;
  select count(*) into n from public.artist_activity_failures where artist_app_user_id = artist and kind = 'artist_online' and error_state = '23514';
  raise notice 'H2 failure recorded: %', n;
  if n <> 1 then raise exception 'H2 failure not recorded'; end if;
  alter table public.fan_notifications drop constraint artist_probe_refuse;
  -- M1 (review r5): a page over 500 members queues one job instead of writing in the comment's transaction; the worker's
  -- maintenance call writes it in slices.
  insert into public.group_memberships(page_id, app_user_id)
    select page, u.id from public.app_users u where u.status = 'active' and not exists (select 1 from public.group_memberships m where m.page_id = page and m.app_user_id = u.id)
    order by u.id limit 520;
  select count(*) into members from public.artist_activity_recipients(page, artist, 'artist_comment', null, null);
  insert into public.group_comments(post_id, author_id, body, anonymous) values (post, artist, '큰 페이지', false) returning id into cm;
  if public.artist_activity_notify_comment(cm, (day0 + 1 + time '14:00') at time zone 'Asia/Seoul') <> 0 then raise exception 'M1 wrote inline'; end if;
  if (select count(*) from public.artist_activity_jobs where target_id = cm and finished_at is null) <> 1 then raise exception 'M1 no job'; end if;
  jobs := public.run_artist_activity_jobs(300);
  if jobs <> 300 or (select cursor is null or finished_at is not null from public.artist_activity_jobs where target_id = cm) then raise exception 'M1 slice failed %', jobs; end if;
  r := public.enqueue_due_notification_maintenance(now());
  if (select finished_at is null from public.artist_activity_jobs where target_id = cm) then raise exception 'M1 maintenance did not finish the job'; end if;
  select count(*) into n from public.fan_notifications where kind::text = 'artist_comment' and payload ->> 'artistId' = artist::text
    and scheduled_for > ((day0 + 1 + time '14:00') at time zone 'Asia/Seoul') - interval '1 hour' and scheduled_for <= (day0 + 1 + time '14:00') at time zone 'Asia/Seoul';
  raise notice 'M1 members % -> notices % (first slice %, then maintenance answered %)', members, n, jobs, r;
  if n <> members or r ->> 'scheduledNotifications' is null then raise exception 'M1 job write failed'; end if;

  raise notice 'RESULT all artist activity checks passed';
end $$;
rollback;
