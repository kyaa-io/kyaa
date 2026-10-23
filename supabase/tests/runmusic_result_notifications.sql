-- Disposable local fixture; no provider calls. Every change rolls back.
begin;
create function pg_temp.runmusic_notify_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',label; end if; end $$;
do $$
<<fixture>>
declare
  owner_id uuid:=extensions.gen_random_uuid(); no_email uuid:=extensions.gen_random_uuid(); disabled_id uuid:=extensions.gen_random_uuid();
  draw_id uuid:=extensions.gen_random_uuid(); email_id uuid:=extensions.gen_random_uuid(); notification_id uuid;
  job jsonb; payload jsonb; stats jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (owner_id,'did:privy:rm-notify-owner','rm-notify@example.invalid'),
    (no_email,'did:privy:rm-notify-no-email','rm-notify-none@example.invalid'),
    (disabled_id,'did:privy:rm-notify-disabled','rm-notify-disabled@example.invalid');
  update public.app_users set status='disabled' where id=disabled_id;
  insert into public.fan_notification_channels(id,app_user_id,kind,status,consent_version,consented_at,destination_fingerprint,destination_label,verified_at)
    values(email_id,owner_id,'email','eligible','fixture',now(),repeat('e',64),'***@example.invalid',now());
  insert into public.fan_notification_channel_private(channel_id,destination) values(email_id,'rm-notify@example.invalid');
  insert into public.fan_notification_channels(app_user_id,kind,status,consent_version,consented_at,destination_fingerprint,destination_label,verified_at,priority)
    values(owner_id,'kakao','eligible','fixture',now(),repeat('f',64),'fixture-kakao',now(),1);
  insert into public.push_subscriptions(app_user_id,endpoint,endpoint_hash,p256dh,auth_secret)
    values(owner_id,'https://push.example.invalid/runmusic',repeat('d',64),repeat('p',32),repeat('a',16));
  insert into public.runmusic_draw_entries(draw_id,app_user_id,weight,mission_snapshot,rank,winner,receipt_id,prize_code)
    values(draw_id,owner_id,1,'{}',1,true,extensions.gen_random_uuid(),'andong_yogurt_1l'),
      (draw_id,no_email,1,'{}',2,false,null,null),
      (draw_id,disabled_id,1,'{}',3,false,null,null);
  update public.runmusic_campaign set draw_id=fixture.draw_id,results_published=false;
  perform pg_temp.runmusic_notify_assert(public.enqueue_runmusic_results(draw_id)=0,'unpublished results do not enqueue');
  update public.runmusic_campaign set results_published=true;
  update public.fan_notification_delivery_control set mode='enabled',activated_at=now()-interval '1 second',test_user_ids='{}',allowed_kinds=array['runmusic_result'] where channel='email';
  perform pg_temp.runmusic_notify_assert(public.enqueue_runmusic_results(draw_id)=2,'only active draw participants notified');
  perform pg_temp.runmusic_notify_assert(public.enqueue_runmusic_results(draw_id)=0,'source-key dedupe on repeat');
  select id into strict notification_id from public.fan_notifications where app_user_id=owner_id and source_key='runmusic_result:'||draw_id::text||':'||owner_id::text;
  perform pg_temp.runmusic_notify_assert(not exists(select 1 from public.notification_delivery_outbox o where o.notification_id=fixture.notification_id),'email only: no push');
  perform pg_temp.runmusic_notify_assert((select primary_channel_id=email_id and fallback_channel_id is null from public.notification_delivery_plans p where p.notification_id=fixture.notification_id),'email primary with no Kakao fallback');
  perform pg_temp.runmusic_notify_assert(public.email_notification_delivery_is_eligible(notification_id,email_id),'existing eligibility chain accepts result');
  insert into public.notification_preferences(app_user_id,benefit_notifications) values(owner_id,false) on conflict(app_user_id) do update set benefit_notifications=false;
  perform pg_temp.runmusic_notify_assert(not public.email_notification_delivery_is_eligible(notification_id,email_id),'benefit preference respected');
  update public.notification_preferences set benefit_notifications=true where app_user_id=owner_id;
  update public.fan_notification_channels set consent_revoked_at=now() where id=email_id;
  perform pg_temp.runmusic_notify_assert(not public.email_notification_delivery_is_eligible(notification_id,email_id),'withdrawn consent respected');
  update public.fan_notification_channels set consent_revoked_at=null where id=email_id;
  update public.app_users set status='disabled' where id=owner_id;
  perform pg_temp.runmusic_notify_assert(not public.email_notification_delivery_is_eligible(notification_id,email_id),'inactive account respected');
  update public.app_users set status='active' where id=owner_id;
  payload:=public.build_external_notification_payload(notification_id,'en');
  perform pg_temp.runmusic_notify_assert(payload->>'deepLink'='/connect/runmusic/results' and payload->>'title'='Your RUNMUSIC results are ready','allowlisted public payload and result link');
  perform pg_temp.runmusic_notify_assert(not(payload ? 'appUserId') and not(payload ? 'kakaoId') and not(payload ? 'winner'),'no private draw/contact data');
  update public.fan_notification_delivery_control set mode='disabled' where channel='email';
  perform pg_temp.runmusic_notify_assert(not public.fan_notification_is_released(notification_id,'email'),'global pause still blocks');
  update public.fan_notification_delivery_control set mode='enabled',allowed_kinds=array['live_reserved'] where channel='email';
  perform pg_temp.runmusic_notify_assert(not public.fan_notification_is_released(notification_id,'email'),'global kind allowlist still blocks');
  update public.fan_notification_delivery_control set allowed_kinds=array['runmusic_result'] where channel='email';
  select to_jsonb(q) into job from public.claim_email_notification_deliveries_safely('runmusic-fixture',100,120) q where q.notification_id=fixture.notification_id;
  perform pg_temp.runmusic_notify_assert(job is not null and job->>'template_key'='runmusic_result','result claims through guarded email lifecycle');
  perform pg_temp.runmusic_notify_assert(public.begin_email_notification_send((job->>'id')::uuid,'runmusic-fixture',(job->>'attempt_count')::integer,encode(extensions.digest(job->>'destination','sha256'),'hex')),'first begin permitted');
  perform pg_temp.runmusic_notify_assert(not public.begin_email_notification_send((job->>'id')::uuid,'runmusic-fixture',(job->>'attempt_count')::integer,encode(extensions.digest(job->>'destination','sha256'),'hex')),'duplicate send begin denied');
  perform pg_temp.runmusic_notify_assert(public.finish_email_notification_send((job->>'id')::uuid,'runmusic-fixture',(job->>'attempt_count')::integer,'accepted','fixture-no-provider-call',null),'accepted lifecycle completion');
  stats:=public.runmusic_delivery_stats(draw_id);
  perform pg_temp.runmusic_notify_assert(stats='{"pending":0,"sent":1,"failed":0,"skipped":1}'::jsonb,'real delivery statuses counted');
  perform pg_temp.runmusic_notify_assert(not has_function_privilege('authenticated','public.enqueue_runmusic_results(uuid)','execute'),'enqueue is service only');
  perform pg_temp.runmusic_notify_assert(not has_function_privilege('service_role','public.email_notification_delivery_is_eligible_base(uuid,uuid,timestamptz)','execute'),'base eligibility stays private');
end $$;
rollback;
