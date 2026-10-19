-- Disposable local database only. No network calls or real Telegram sends.
begin;
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL %',label; end if; end $$;
select public.configure_telegram_alerts('-1001234567890',true);
delete from public.telegram_alert_outbox;
do $$
declare artist uuid:='fa400000-0000-4000-8000-000000000021'; observation jsonb; other jsonb;
  batch jsonb; token uuid; captured integer; role_name text;
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
    values(artist,'telegram-live-test','published','/images/creator.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
    values(artist,'ko','알림 최애','소개','사진');
  insert into public.celebrity_social_links(celebrity_id,platform,url)
    values(artist,'youtube','https://www.youtube.com/@test-creator');
  observation:=jsonb_build_object('celebrity_slug','telegram-live-test','video_id','abcDEF123_-','observed_at',clock_timestamp());

  foreach role_name in array array['anon','authenticated'] loop
    perform pg_temp.expect(not has_function_privilege(role_name,'public.capture_telegram_youtube_live_starts(jsonb)','execute'),'capture is service-only');
  end loop;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    perform pg_temp.expect(not has_table_privilege(role_name,'public.telegram_youtube_live_starts','select,insert,update,delete'),'receipt is private');
  end loop;
  perform pg_temp.expect(has_function_privilege('service_role','public.capture_telegram_youtube_live_starts(jsonb)','execute'),'service can capture');
  perform pg_temp.expect((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.telegram_youtube_live_starts'::regclass),'receipt forces RLS');

  captured:=public.capture_telegram_youtube_live_starts(jsonb_build_array(observation,observation));
  perform pg_temp.expect(captured=1,'duplicate observations enqueue once');
  perform pg_temp.expect(public.capture_telegram_youtube_live_starts('[]')=0,'no live observation does not change receipts');
  perform pg_temp.expect(public.capture_telegram_youtube_live_starts(jsonb_build_array(observation))=0,'re-observation after source failure does not requeue');
  perform pg_temp.expect(public.claim_telegram_alert_batch_with_cs_content('-1009999999999') is null,'existing destination isolation');
  batch:=public.claim_telegram_alert_batch_with_cs_content('-1001234567890');
  perform pg_temp.expect(jsonb_array_length(batch->'alerts')=1 and batch#>>'{alerts,0,kind}'='youtube_live_started','one broadcast claimed');
  perform pg_temp.expect(batch#>>'{alerts,0,creator_name}'='알림 최애' and batch#>>'{alerts,0,youtube_video_id}'='abcDEF123_-','creator and immutable broadcast ID');
  perform pg_temp.expect(not (batch#>'{alerts,0}' ? 'activity_context') and batch#>'{alerts,0,actor_email}'='null'::jsonb,'no unrelated activity or member data');

  -- A dead process before begin releases its existing row, never inserts a second one.
  update public.telegram_alert_outbox set lease_expires_at=clock_timestamp()-interval '1 second' where status='claimed';
  update public.telegram_alert_settings set lease_expires_at=clock_timestamp()-interval '1 second' where singleton;
  perform public.maintain_telegram_alerts();
  perform pg_temp.expect(public.capture_telegram_youtube_live_starts(jsonb_build_array(observation))=0,'process restart does not duplicate');
  batch:=public.claim_telegram_alert_batch_with_cs_content('-1001234567890'); token:=(batch->>'batch_id')::uuid;
  perform pg_temp.expect(public.begin_telegram_alert_send(token,'-1001234567890'),'reclaimed row can begin');
  perform pg_temp.expect(not public.begin_telegram_alert_send(token,'-1001234567890'),'second begin cannot send');
  perform pg_temp.expect(public.finish_telegram_alert_batch(token,'sent',42,null),'successful send');
  perform pg_temp.expect(public.capture_telegram_youtube_live_starts(jsonb_build_array(observation))=0,'sent broadcast never requeues');

  other:=observation||jsonb_build_object('video_id','newDEF123_-');
  perform pg_temp.expect(public.capture_telegram_youtube_live_starts(jsonb_build_array(other))=1,'new broadcast enqueues once');
  update public.telegram_alert_settings set next_send_at='-infinity' where singleton;
  batch:=public.claim_telegram_alert_batch_with_cs_content('-1001234567890'); token:=(batch->>'batch_id')::uuid;
  perform pg_temp.expect(public.begin_telegram_alert_send(token,'-1001234567890'),'new broadcast begins');
  perform pg_temp.expect(public.finish_telegram_alert_batch(token,'unknown',null,null),'uncertain send recorded');
  perform pg_temp.expect(public.capture_telegram_youtube_live_starts(jsonb_build_array(other))=0,'uncertain send never requeues');
  update public.telegram_alert_settings set next_send_at='-infinity' where singleton;
  perform pg_temp.expect(public.claim_telegram_alert_batch_with_cs_content('-1001234567890') is null,'uncertain send is terminal');

  update public.telegram_alert_outbox set finished_at=clock_timestamp()-interval '31 days';
  perform public.maintain_telegram_alerts();
  perform pg_temp.expect((select count(*)=0 from public.telegram_alert_outbox),'existing outbox retention still works');
  perform pg_temp.expect(public.capture_telegram_youtube_live_starts(jsonb_build_array(observation,other))=0,'dedupe survives outbox cleanup');
  perform pg_temp.expect((select count(*)=2 from public.telegram_youtube_live_starts where celebrity_id=artist),'broadcast keys are durable');

  other:=observation||jsonb_build_object('video_id','oldDEF123_-','observed_at',clock_timestamp()-interval '6 minutes');
  perform pg_temp.expect(public.capture_telegram_youtube_live_starts(jsonb_build_array(other))=0,'stale source ignored');
  other:=other||jsonb_build_object('observed_at',clock_timestamp()+interval '1 minute');
  perform pg_temp.expect(public.capture_telegram_youtube_live_starts(jsonb_build_array(other))=0,'future source ignored');
  other:=other||jsonb_build_object('observed_at',clock_timestamp(),'video_id','hidDEF123_-');
  perform pg_temp.expect(public.capture_telegram_youtube_live_starts(jsonb_build_array(other))=1,'published creator captured');
  update public.celebrities set status='draft' where id=artist;
  perform pg_temp.expect(public.claim_telegram_alert_batch_with_cs_content('-1001234567890') is null,'hidden creator skipped at claim');
  other:=other||jsonb_build_object('video_id','offDEF123_-');
  perform pg_temp.expect(public.capture_telegram_youtube_live_starts(jsonb_build_array(other))=0,'unpublished creator ignored');
  update public.celebrities set status='published' where id=artist;
  update public.celebrity_social_links set active=false where celebrity_id=artist;
  perform pg_temp.expect(public.capture_telegram_youtube_live_starts(jsonb_build_array(other))=0,'inactive channel ignored');
  update public.celebrity_social_links set active=true where celebrity_id=artist;
  perform public.configure_telegram_alerts('-1001234567890',false);
  perform pg_temp.expect(public.capture_telegram_youtube_live_starts(jsonb_build_array(other))=0,'disabled alerts do not capture');
  perform public.configure_telegram_alerts('-1001234567890',true);
  perform pg_temp.expect(public.capture_telegram_youtube_live_starts(jsonb_build_array(observation))=0,'activation changes do not resend an old broadcast');
  begin
    perform public.capture_telegram_youtube_live_starts(jsonb_build_array(other||'{"video_id":"bad?url"}'::jsonb));
    raise exception 'FAIL invalid source accepted';
  exception when raise_exception then
    if sqlerrm<>'YOUTUBE_LIVE_OBSERVATION_INVALID' then raise; end if;
  end;
  insert into public.telegram_alert_outbox(kind,source_id,activation_id,chat_id,occurred_at,activity_context)
    select 'content_report_created',gen_random_uuid(),activation_id,chat_id,clock_timestamp(),'기존 신고 알림'
      from public.telegram_alert_settings where singleton;
  perform pg_temp.expect((select count(*)=1 from public.telegram_alert_outbox where kind='content_report_created'),'preserves the existing production event kinds');
end $$;
rollback;
