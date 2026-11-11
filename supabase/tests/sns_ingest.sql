-- Disposable local database only. Rolled back; no network calls or real Telegram sends.
begin;
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL %',label; end if; end $$;
-- A clean chain seeds the singleton; a reused local database may have lost it.
insert into public.telegram_alert_settings(singleton) values(true) on conflict do nothing;
select public.configure_telegram_alerts('-1001234567890',true);
delete from public.telegram_alert_outbox;
do $$
declare artist uuid:='fa400000-0000-4000-8000-0000000000a1'; other uuid:='fa400000-0000-4000-8000-0000000000a2';
  ig text:='https://www.instagram.com/ingest.test/'; run uuid; run2 uuid; saved jsonb; notice uuid; media uuid:='fa400000-0000-4000-8000-0000000000b1';
  doc jsonb:='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"원문"}]}]}';
  role_name text; fn text; failed boolean; batch jsonb; stale_source uuid;
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
    (artist,'sns-ingest-test','published','/images/creator.webp',now(),'{creator}','creator'),
    (other,'sns-ingest-other','published','/images/creator.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
    (artist,'ko','수집 최애','소개','사진'),(artist,'en','Ingest creator','Intro','Photo');
  insert into public.celebrity_social_links(celebrity_id,platform,url) values(artist,'instagram',ig),(other,'tiktok','https://www.tiktok.com/@other');

  foreach fn in array array['public.sns_ingest_source_context(text,text)','public.sns_ingest_begin_run(uuid,text,text,uuid,text)',
    'public.sns_ingest_save_draft(uuid,text,text,timestamptz,text,jsonb)','public.sns_ingest_publish(uuid,uuid,integer)',
    'public.sns_ingest_finish_run(uuid,jsonb,boolean)','public.sns_ingest_read_draft(uuid)'] loop
    foreach role_name in array array['anon','authenticated'] loop
      perform pg_temp.expect(not has_function_privilege(role_name,fn,'execute'),fn||' is service-only');
    end loop;
    perform pg_temp.expect(has_function_privilege('service_role',fn,'execute'),fn||' service can execute');
  end loop;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    perform pg_temp.expect(not has_table_privilege(role_name,'public.sns_ingest_runs','select,insert,update,delete'),'runs are private');
  end loop;

  perform pg_temp.expect(public.sns_ingest_source_context('sns-ingest-test','instagram')->>'accountUrl'=ig,'registered account is the source');
  perform pg_temp.expect(public.sns_ingest_source_context('sns-ingest-test','tiktok') is null,'unregistered platform has no source');
  perform pg_temp.expect(public.sns_ingest_source_context('sns-ingest-test','youtube') is null,'server-read platforms are out of scope');

  failed:=false;
  begin perform public.sns_ingest_begin_run(artist,'instagram','https://www.instagram.com/someone.else/',gen_random_uuid(),null);
  exception when others then failed:=sqlerrm='SNS_INGEST_SOURCE_NOT_REGISTERED'; end;
  perform pg_temp.expect(failed,'another account URL is refused');

  run:=public.sns_ingest_begin_run(artist,'instagram',ig,gen_random_uuid(),null);
  failed:=false;
  begin perform public.sns_ingest_save_draft(run,'tiktok-0123456789abcdef','https://www.instagram.com/ingest.test/p/A/',now(),'원문',doc);
  exception when others then failed:=sqlerrm='SNS_INGEST_INVALID_SLUG'; end;
  perform pg_temp.expect(failed,'slug platform must match the run');

  saved:=public.sns_ingest_save_draft(run,'instagram-0123456789abcdef','https://www.instagram.com/ingest.test/p/A/',now(),'원문',doc);
  notice:=(saved->>'noticeId')::uuid;
  perform pg_temp.expect(saved->>'status'='created','new post is a draft');
  perform pg_temp.expect((select publication_status='draft' and post_type='artist_post' and visibility='public' and not pinned from public.celebrity_notices where id=notice),'draft shape');

  failed:=false;
  begin perform public.sns_ingest_save_draft(run,'instagram-0123456789abcdef','https://www.instagram.com/ingest.test/p/A/',now(),'원문',
    jsonb_set(doc,'{content,1}','{"type":"image","attrs":{"src":"https://evil.example/a.jpg","alt":"원문"}}'));
  exception when others then failed:=sqlerrm='SNS_INGEST_INVALID_MEDIA'; end;
  perform pg_temp.expect(failed,'external image source is refused');

  perform public.sns_ingest_register_media(run,notice,media,'sns-ingest/'||notice||'/'||media||'.webp','sns-ingest/'||notice||'/'||media||'-thumbnail.webp',1080,1350,1000,repeat('a',64),'scontent.cdninstagram.com');
  saved:=public.sns_ingest_save_draft(run,'instagram-0123456789abcdef','https://www.instagram.com/ingest.test/p/A/',now(),'원문',
    jsonb_set(doc,'{content,1}',jsonb_build_object('type','image','attrs',jsonb_build_object('src','/api/public/notice-media/'||media,'alt','원문','width',1080,'height',1350))));
  perform pg_temp.expect(saved->>'status'='restored' and (saved->>'revision')::int=2,'same slug draft is restored');
  perform pg_temp.expect(public.authorize_public_official_media_read(media,'original') is null,'draft media is not public');
  perform pg_temp.expect((public.sns_ingest_read_draft(notice)#>>'{localizations,ko,title}')='원문','readback returns stored title');

  perform public.sns_ingest_publish(run,notice,2);
  perform pg_temp.expect(public.authorize_public_official_media_read(media,'original')->>'storagePath' like 'sns-ingest/%','published media is public');
  saved:=public.sns_ingest_save_draft(run,'instagram-0123456789abcdef','https://www.instagram.com/ingest.test/p/A/',now(),'바뀐 제목',doc);
  perform pg_temp.expect(saved->>'status'='duplicate','published post is a duplicate');
  perform pg_temp.expect((select title from public.celebrity_notice_localizations where notice_id=notice and locale='ko')='원문','published post is unchanged');

  failed:=false;
  begin perform public.sns_ingest_publish(run,notice,3); exception when others then failed:=sqlerrm='SNS_INGEST_NOTICE_NOT_WRITABLE'; end;
  perform pg_temp.expect(failed,'published post cannot be re-published');

  -- Unpublished by an administrator: ever published, so the machine path cannot rewrite it.
  update public.celebrity_notices set publication_status='draft',published_at=null where id=notice;
  saved:=public.sns_ingest_save_draft(run,'instagram-0123456789abcdef','https://www.instagram.com/ingest.test/p/A/',now(),'바뀐 제목',doc);
  perform pg_temp.expect(saved->>'status'='blocked','ever-published post is blocked');

  -- An administrator draft with an ingest-shaped slug is not the machine's to publish.
  insert into public.celebrity_notices(id,celebrity_id,slug,post_type,visibility) values('fa400000-0000-4000-8000-0000000000c1',artist,'instagram-fedcba9876543210','artist_post','public');
  insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json) values
    ('fa400000-0000-4000-8000-0000000000c1','ko','관리자',doc),('fa400000-0000-4000-8000-0000000000c1','en','관리자',doc);
  saved:=public.sns_ingest_save_draft(run,'instagram-fedcba9876543210','https://www.instagram.com/ingest.test/p/B/',now(),'원문',doc);
  perform pg_temp.expect(saved->>'status'='blocked','administrator notice draft is blocked');
  perform pg_temp.expect((select title='관리자' from public.celebrity_notice_localizations where notice_id='fa400000-0000-4000-8000-0000000000c1' and locale='ko'),'administrator title unchanged');
  perform pg_temp.expect(not exists(select 1 from public.sns_ingest_posts where notice_id='fa400000-0000-4000-8000-0000000000c1'),'administrator draft not claimed');

  perform public.sns_ingest_finish_run(run,'[{"status":"published"}]',true);
  perform pg_temp.expect((select last_success_at is not null and last_error is null from public.sns_ingest_sources where celebrity_id=artist),'success is recorded');
  run2:=public.sns_ingest_begin_run(artist,'instagram',ig,gen_random_uuid(),'BLOCKED_LOGIN');
  perform public.sns_ingest_finish_run(run2,'[]',false);
  perform pg_temp.expect((select last_error='BLOCKED_LOGIN' from public.sns_ingest_sources where celebrity_id=artist),'collector failure is recorded');

  -- Stale for 25 hours: one alert, not repeated within a day.
  update public.sns_ingest_sources set last_success_at=clock_timestamp()-interval '25 hours' where celebrity_id=artist returning id into stale_source;
  perform public.maintain_telegram_alerts();
  perform public.maintain_telegram_alerts();
  perform pg_temp.expect((select count(*) from public.telegram_alert_outbox where kind='sns_ingest_stale')=1,'stale source alerts once');
  batch:=public.claim_telegram_alert_batch_with_cs_content('-1001234567890');
  perform pg_temp.expect(batch#>>'{alerts,0,kind}'='sns_ingest_stale' and batch#>>'{alerts,0,creator_name}'='수집 최애'
    and batch#>>'{alerts,0,sns_platform}'='instagram' and batch#>'{alerts,0,sns_last_success_at}'<>'null'::jsonb,'stale payload');
  perform pg_temp.expect(batch#>'{alerts,0,actor_email}'='null'::jsonb,'no member data in stale alert');
  update public.sns_ingest_sources set last_alerted_at=clock_timestamp()-interval '25 hours' where id=stale_source;
  perform public.maintain_telegram_alerts();
  perform pg_temp.expect((select count(*) from public.telegram_alert_outbox where kind='sns_ingest_stale')=2,'stale source alerts again the next day');
  update public.sns_ingest_sources set last_success_at=clock_timestamp(),last_alerted_at=null where id=stale_source;
  perform public.maintain_telegram_alerts();
  perform pg_temp.expect((select count(*) from public.telegram_alert_outbox where kind='sns_ingest_stale')=2,'fresh source does not alert');
end $$;
rollback;
\echo sns_ingest ok
