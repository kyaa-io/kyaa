-- 20261216040000: artist_comment notices for fan-post comments. One transaction, rolled back.
-- Uses the local fixture of 261107-2: the test artist d2611001…0121 is bound to the fan page of [시험] 랭킹 확인 페이지
-- (d2611003…0001) and its fan post d2611004…0001. Run: psql -X -d byus -f supabase/tests/artist_activity_fan_post_comments.sql
\set ON_ERROR_STOP 1
begin;
update public.artist_activity_push_control set inbox_enabled = true where id;
\set artist '''d2611001-0000-4000-8000-000000000121'''
\set page '''d2611003-0000-4000-8000-000000000001'''
\set post '''d2611004-0000-4000-8000-000000000001'''
-- A member who is not the artist, and a time no earlier notice of this artist falls into.
select m.app_user_id as fan from public.group_memberships m join public.app_users u on u.id = m.app_user_id and u.status = 'active'
  left join public.notification_preferences p on p.app_user_id = m.app_user_id
  where m.page_id = :page and m.app_user_id <> :artist and coalesce(p.artist_activity_notifications, true) order by m.app_user_id limit 1 \gset
select count(*) as members from public.artist_activity_recipients(:page, :artist, 'artist_comment', null, null) \gset
delete from public.fan_notifications where kind::text = 'artist_comment' and payload ->> 'artistId' = :artist;

-- AC1 artist comment on a fan post -> every recipient gets one notice pointing at the post and the comment.
insert into public.fan_post_comments(post_id, app_user_id, body, idempotency_key) values (:post, :artist, '[SQL시험] 아티스트 팬 글 댓글', extensions.gen_random_uuid()) returning id as c1 \gset
select count(*) as n1 from public.fan_notifications where kind::text = 'artist_comment' and payload ->> 'artistId' = :artist \gset
select payload ->> 'targetType' as t1, payload ->> 'slug' as s1, (payload ->> 'count')::int as k1 from public.fan_notifications
  where app_user_id = :'fan' and kind::text = 'artist_comment' and payload ->> 'artistId' = :artist \gset
select public.fan_web_notification_path(:'fan', (select id from public.fan_notifications where app_user_id = :'fan' and kind::text = 'artist_comment' and payload ->> 'artistId' = :artist)) as path1 \gset
select :n1 = :members and :members > 0 as ac1_rows, :'t1' = 'fan_post_comment' and :k1 = 1 as ac1_payload,
  :'path1' = '/c/' || :'s1' || '/community/' || :post || '#comment-' || :'c1' as ac1_path \gset
\echo AC1 rows=:ac1_rows payload=:ac1_payload path=:ac1_path (:path1)

-- AC2 a second comment in the hour (a group-post comment this time) raises the same notice: still one row, count 2, group link.
insert into public.group_posts(page_id, author_id, title, body, visibility, anonymous)
  select :page, :'fan', '[SQL시험] 모임 글', '[SQL시험]', (select visibility from public.group_posts limit 1), false
  where not exists (select 1 from public.group_posts gp where gp.page_id = :page and gp.removed_at is null);
select exists (select 1 from public.group_posts gp where gp.page_id = :page and gp.removed_at is null) as has_gpost,
  (select gp.id from public.group_posts gp where gp.page_id = :page and gp.removed_at is null limit 1) as gpost \gset
\if :has_gpost
insert into public.group_comments(post_id, author_id, body, anonymous) values (:'gpost', :artist, '[SQL시험] 모임 글 댓글', false);
select count(*) = :members as ac2_rows, bool_and((payload ->> 'count')::int = 2 and payload ->> 'targetType' = 'group_comment') as ac2_bump
  from public.fan_notifications where kind::text = 'artist_comment' and payload ->> 'artistId' = :artist \gset
select public.fan_web_notification_path(:'fan', (select id from public.fan_notifications where app_user_id = :'fan' and kind::text = 'artist_comment' and payload ->> 'artistId' = :artist)) like '/pages/groups/%' as ac2_path \gset
\echo AC2 rows=:ac2_rows bump=:ac2_bump path=:ac2_path
-- and back to a fan post: count 3, fan-post link again
insert into public.fan_post_comments(post_id, app_user_id, body, idempotency_key) values (:post, :artist, '[SQL시험] 두 번째 팬 글 댓글', extensions.gen_random_uuid()) returning id as c3 \gset
select public.fan_web_notification_path(:'fan', (select id from public.fan_notifications where app_user_id = :'fan' and kind::text = 'artist_comment' and payload ->> 'artistId' = :artist)) = '/c/' || :'s1' || '/community/' || :post || '#comment-' || :'c3' as ac2_back \gset
\echo AC2 back to fan post path=:ac2_back
\else
\echo AC2 skipped: no group post on the fixture page
\endif

-- AC3 a fan (not a bound artist) comments: no notice.
delete from public.fan_notifications where kind::text = 'artist_comment' and payload ->> 'artistId' = :artist;
insert into public.fan_post_comments(post_id, app_user_id, body, idempotency_key) values (:post, :'fan', '[SQL시험] 팬 댓글', extensions.gen_random_uuid());
select count(*) = 0 as ac3 from public.fan_notifications where kind::text = 'artist_comment' and (payload ->> 'artistId')::uuid = :'fan'::uuid \gset
\echo AC3 fan comment writes nothing=:ac3

-- AC4 the hidden comment's notice links the post without the anchor; the switch off writes nothing.
insert into public.fan_post_comments(post_id, app_user_id, body, idempotency_key) values (:post, :artist, '[SQL시험] 숨길 댓글', extensions.gen_random_uuid()) returning id as c4 \gset
update public.fan_post_comments set hidden_at = now() where id = :'c4';
select public.fan_web_notification_path(:'fan', (select id from public.fan_notifications where app_user_id = :'fan' and kind::text = 'artist_comment' and payload ->> 'artistId' = :artist)) = '/c/' || :'s1' || '/community/' || :post as ac4_hidden \gset
\echo AC4 hidden comment link=:ac4_hidden
delete from public.fan_notifications where kind::text = 'artist_comment' and payload ->> 'artistId' = :artist;
update public.artist_activity_push_control set inbox_enabled = false where id;
insert into public.fan_post_comments(post_id, app_user_id, body, idempotency_key) values (:post, :artist, '[SQL시험] 꺼짐', extensions.gen_random_uuid());
select count(*) = 0 as ac4_off from public.fan_notifications where kind::text = 'artist_comment' and payload ->> 'artistId' = :artist \gset
\echo AC4 switch off writes nothing=:ac4_off

-- AC5 the big-page path: a queued fan-post job is written by the job runner (the same runner the notification worker calls).
update public.artist_activity_push_control set inbox_enabled = true where id;
delete from public.fan_notifications where kind::text = 'artist_comment' and payload ->> 'artistId' = :artist;
insert into public.artist_activity_jobs(kind, target_id, page_id, artist_app_user_id, at) values ('artist_fan_post_comment', :'c1', :page, :artist, now()) returning id as job \gset
select public.run_artist_activity_jobs(2000) >= :members as ac5_run \gset
select finished_at is not null as ac5_done from public.artist_activity_jobs where id = :'job' \gset
select count(*) = :members as ac5_rows from public.fan_notifications where kind::text = 'artist_comment' and payload ->> 'artistId' = :artist and payload ->> 'targetType' = 'fan_post_comment' \gset
\echo AC5 job run=:ac5_run done=:ac5_done rows=:ac5_rows
select (select count(*) from public.artist_activity_failures where kind like 'artist_fan_post_comment%' and created_at > now() - interval '1 minute') = 0 as no_failures \gset
\echo failures none=:no_failures
rollback;
