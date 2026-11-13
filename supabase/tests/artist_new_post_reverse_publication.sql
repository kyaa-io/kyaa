-- Synthetic members/notices only; all source, inbox and outbox writes roll back.
-- Requires artist_new_post_notification and sns_ingest migrations.
begin;
create function pg_temp.publish_source(p_notice uuid,p_artist uuid,p_run uuid,p_slug text,p_source_at timestamptz) returns void language plpgsql as $$
begin
 insert into public.celebrity_notices(id,celebrity_id,slug,post_type,visibility) values(p_notice,p_artist,p_slug,'artist_post','public');
 insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json) values(p_notice,'ko',p_slug,'{"type":"doc","content":[]}');
 insert into public.sns_ingest_posts(notice_id,celebrity_id,platform,slug,source_url,source_published_at,created_run_id,last_run_id)
 values(p_notice,p_artist,'instagram',p_slug,'https://www.instagram.com/p/test/',p_source_at,p_run,p_run);
 update public.celebrity_notices set publication_status='published',published_at=clock_timestamp(),ever_published_at=clock_timestamp(),revision=revision+1 where id=p_notice;
end $$;
do $$
declare fan uuid:=gen_random_uuid(); artist uuid:=gen_random_uuid(); page uuid:=gen_random_uuid(); run uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); n public.fan_notifications; artist_slug text;
begin
 artist_slug:='reverse-'||substr(artist::text,1,8);
 insert into public.app_users(id,privy_user_id,verified_email) values(fan,'did:privy:reverse-'||fan,fan||'@example.test');
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(artist,artist_slug,'published','/test.webp',now(),'{creator}','creator');
 insert into public.group_pages(id,kind,celebrity_id,name) values(page,'fan',artist,'Reverse publication test');
 insert into public.group_memberships(page_id,app_user_id,role) values(page,fan,'member');
 insert into public.sns_ingest_runs(id,celebrity_id,platform,account_url,correlation_id) values(run,artist,'instagram','https://www.instagram.com/test/',gen_random_uuid());
 perform pg_temp.publish_source(a,artist,run,'instagram-000000000000000a',now()-interval '1 day');
 perform public.fan_web_drain_notification_intents(fan,100);
 select * into strict n from public.fan_notifications where app_user_id=fan and kind='official_post';
 if n.payload->>'targetId'<>a::text then raise exception 'A not selected initially'; end if;
 update public.fan_notifications set read_at=now() where id=n.id;
 perform pg_temp.publish_source(b,artist,run,'instagram-000000000000000b',now()-interval '10 days');
 perform public.fan_web_drain_notification_intents(fan,100);
 select * into strict n from public.fan_notifications where app_user_id=fan and kind='official_post';
 if n.payload->>'targetId'<>a::text or (n.payload->>'count')::int<>2 or n.read_at is not null then
  raise exception 'REVERSE_PUBLICATION: older B replaced A or count/unread was lost';
 end if;
 update public.fan_notifications set scheduled_for=now()-interval '1 minute' where id=n.id;
 if public.fan_web_notification_path(fan,n.id) is distinct from '/c/'||artist_slug||'/notices/instagram-000000000000000a' then raise exception 'Representative link no longer opens A'; end if;
 perform pg_temp.publish_source(c,artist,run,'instagram-000000000000000c',now());
 perform public.fan_web_drain_notification_intents(fan,100);
 select * into strict n from public.fan_notifications where app_user_id=fan and kind='official_post';
 if n.payload->>'targetId'<>c::text or (n.payload->>'count')::int<>3 then raise exception 'Newer C must advance the representative'; end if;
end $$;
rollback;
select 'Reverse publication A then older B keeps A; newer C advances; count/unread/link PASS' as result;
