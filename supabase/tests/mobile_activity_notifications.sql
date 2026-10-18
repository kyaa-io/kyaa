\ir mobile_notification_inbox.sql
begin;
do $$
declare owner uuid:='92500000-0000-4000-8000-000000000001'; viewer uuid:='92500000-0000-4000-8000-000000000002'; creator uuid:='92500000-0000-4000-8000-000000000010'; quiz uuid:='92500000-0000-4000-8000-000000000011'; attempt uuid:='92500000-0000-4000-8000-000000000012'; pass uuid:='92500000-0000-4000-8000-000000000013'; job uuid:='92500000-0000-4000-8000-000000000014'; passport uuid:='92500000-0000-4000-8000-000000000015'; post_public uuid:='92500000-0000-4000-8000-000000000016'; post_members uuid:='92500000-0000-4000-8000-000000000017'; activity1 uuid:='92500000-0000-4000-8000-000000000018';activity2 uuid:='92500000-0000-4000-8000-000000000019'; brand uuid:='92500000-0000-4000-8000-000000000021'; live uuid:='92500000-0000-4000-8000-000000000022'; reservation uuid:='92500000-0000-4000-8000-000000000023'; live_stamp uuid:='92500000-0000-4000-8000-000000000024'; live_activity uuid:='92500000-0000-4000-8000-000000000025'; stamp_job uuid:='92500000-0000-4000-8000-000000000026'; result jsonb; admin_id uuid:=extensions.gen_random_uuid(); inquiry uuid:=extensions.gen_random_uuid(); reply uuid:=extensions.gen_random_uuid();
 event_id uuid:=extensions.gen_random_uuid(); context_id uuid:=extensions.gen_random_uuid(); policy_id uuid:=extensions.gen_random_uuid(); session_id uuid:=extensions.gen_random_uuid(); n uuid; d uuid; cs uuid; count_before integer; source_id uuid:=extensions.gen_random_uuid();
begin
  insert into public.app_users(id,privy_user_id,verified_email)values(owner,'did:privy:activity-notification-owner','activity-notification-owner@example.test'),(viewer,'did:privy:activity-notification-viewer','activity-notification-viewer@example.test');
  insert into public.user_wallets(app_user_id,chain_id,address)values(owner,91342,'0x1111111111111111111111111111111111111111');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(owner,'실제팬','실제팬');
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values(creator,'activity-notification-creator','draft','/profile.webp','{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','프로필 최애','소개','최애'),(creator,'en','Profile Favorite','Summary','Favorite');
  update public.celebrities set status='published',published_at=now() where id=creator;
  insert into public.celebrity_quizzes(id,celebrity_id,version,status)values(quiz,creator,1,'draft');
  insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)values(attempt,owner,creator,quiz,1,extensions.gen_random_uuid(),'passed',3,now());
  insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)values(pass,owner,creator,attempt);
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)values(job,'passport',passport,'activity-notification-passport','{}');
  alter table public.fan_passports disable trigger fan_passports_validate_blockchain_job_link;
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)values(passport,owner,creator,pass,job);
  alter table public.fan_passports enable trigger fan_passports_validate_blockchain_job_link;
  insert into public.social_profile_settings(app_user_id,profile_visible,dm_policy)values(owner,true,'requests');
  insert into public.social_favorite_visibility(app_user_id,celebrity_id,visible)values(owner,creator,false);
  insert into public.fan_activities(id,app_user_id,celebrity_id,activity_type,source_type,source_id)
    values(activity1,owner,creator,'knowledge','quiz_pass',pass);
  insert into public.fan_score_ledger(activity_id,app_user_id,celebrity_id,points)values(activity1,owner,creator,1);
  insert into public.brands(id,slug,status,logo_url,logo_alt,published_at)values(brand,'activity-notification-brand','published','/brand.webp','Brand',now());
  insert into public.live_events(id,slug,celebrity_id,brand_id,publication_status,content_status,starts_at,ends_at,reservation_opens_at,reservation_closes_at,youtube_url,approved_hero_url,fan_code_hash,published_at)
    values(live,'activity-notification-live',creator,brand,'published','scheduled',now()+interval'1 day',now()+interval'25 hours',now()-interval'3 days',now()+interval'12 hours','https://youtube.com/watch?v=mobileprofile','/activity-notification-live.webp',extensions.crypt('123456',extensions.gen_salt('bf',12)),now()-interval'4 days');
  insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt)values(live,'ko','실제 LIVE','실제 요약','실제 LIVE 이미지'),(live,'en','Real LIVE','Real summary','Real LIVE image');
  insert into public.live_reservations(id,app_user_id,live_event_id,celebrity_id,passport_id,idempotency_key)
    values(reservation,owner,live,creator,passport,extensions.gen_random_uuid());
  insert into public.fan_activities(id,app_user_id,celebrity_id,activity_type,source_type,source_id,occurred_at)
    values(live_activity,owner,creator,'reservation','live_reservation',reservation,now()-interval'1 day');
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)values(stamp_job,'stamp',live_stamp,'byus:stamp:v1:'||live_stamp::text,jsonb_build_object('recipient','0x1111111111111111111111111111111111111111','celebritySlug','activity-notification-creator','issuanceId','0x'||repeat('1',64),'stampType','Reservation'));
  insert into public.stamps(id,app_user_id,celebrity_id,passport_id,activity_id,stamp_type,blockchain_job_id)
    values(live_stamp,owner,creator,passport,live_activity,'reservation',stamp_job);

 perform public.issue_community_stamp(owner,null,'welcome','welcome:'||owner::text);
 select id into cs from public.community_stamps where app_user_id=owner and kind='welcome';
 insert into public.admin_allowlist(id,email,role,active) values(admin_id,'activity-notification-admin@example.test','operator',true);
 insert into public.cs_inquiries(id,app_user_id,subject,locale) values(inquiry,owner,'never expose support subject','ko');
 insert into public.cs_messages(inquiry_id,actor_app_user_id,operation,body,idempotency_key)
  values(inquiry,owner,'post','never expose support question',extensions.gen_random_uuid());
 if exists(select 1 from public.fan_web_notification_intents where recipient_app_user_id=owner and kind='support_reply') then raise exception 'fan message created support notification'; end if;
 insert into public.cs_messages(id,inquiry_id,actor_app_user_id,actor_admin_allowlist_id,operation,body,idempotency_key)
  values(reply,inquiry,viewer,admin_id,'post','never expose support reply',extensions.gen_random_uuid());
 perform public.fan_web_drain_notification_intents(owner);
 update public.fan_notifications set scheduled_for=now()-interval '1 second' where app_user_id=owner;
 select id into n from public.fan_notifications where app_user_id=owner and kind::text='support_reply';
 if public.fan_web_notification_path(owner,n) is distinct from ('/support/'||inquiry) or public.fan_web_notification_path(viewer,n) is not null then raise exception 'owned support path invalid'; end if;
 if (select payload::text from public.fan_notifications where id=n) like '%never expose%' or (select count(*) from jsonb_object_keys((select payload from public.fan_notifications where id=n))) is distinct from 3 then raise exception 'support payload leaked source content'; end if;
 if public.mobile_get_owned_notification(owner,n,'ko')->>'group' is distinct from 'info' then raise exception 'support group invalid'; end if;
 select id into n from public.fan_notifications where app_user_id=owner and kind::text='stamp_issued' and payload->>'targetId'=live_stamp::text;
 if public.fan_web_notification_path(owner,n) is distinct from ('/stamps/'||live_stamp) then raise exception 'issued stamp path invalid'; end if;
 select id into n from public.fan_notifications where app_user_id=owner and kind::text='stamp_issued' and payload->>'targetId'=cs::text;
 if public.fan_web_notification_path(owner,n) is distinct from '/my/community-stamps' then raise exception 'community stamp path invalid'; end if;
 if exists(select 1 from public.notification_delivery_outbox o join public.fan_notifications f on f.id=o.notification_id where f.app_user_id=owner and f.kind::text in('stamp_issued','support_reply')) or exists(select 1 from public.external_notification_delivery_outbox o join public.fan_notifications f on f.id=o.notification_id where f.app_user_id=owner and f.kind::text in('stamp_issued','support_reply')) then raise exception 'activity notification escaped native inbox channels'; end if;
 select count(*) into count_before from public.fan_notifications where app_user_id=owner;
 perform public.fan_web_emit_notification(owner,'stamp_issued','stamp',live_stamp,1,now());
 perform public.fan_web_drain_notification_intents(owner);
 if (select count(*) from public.fan_notifications where app_user_id=owner) is distinct from count_before then raise exception 'repeated event created duplicate notification'; end if;

 perform public.mobile_get_owned_settings(owner);
 perform public.mobile_register_owned_installation(owner,'92500000-0000-4000-8000-000000000801','ios','activity-test-token','authorized','1.0.0','ko',0,'92500000-0000-4000-8000-000000000802');
 insert into public.mobile_participation_events(id,slug,celebrity_id,event_kind,policy_version,state,starts_at,ends_at,title_ko,title_en)
  values(event_id,'activity-notification-day',creator,'byus_day','v1','published',now()-interval '1 hour',now()+interval '2 days','마감 테스트','Deadline test');
 insert into public.mobile_participation_contexts(id,context_type,source_event_id,celebrity_id,slug,policy_version,state,opens_at,closes_at,require_checkin)
  values(context_id,'event',event_id,creator,'activity-notification-context','v1','published',now()-interval '1 hour',now()+interval '2 days',true);
 insert into public.mobile_participation_checkins(event_id,app_user_id,source,policy_version) values(event_id,owner,'qr','v1');
 insert into public.mobile_participation_activity_sources(id,source_kind,playback_url,duration_ms,state,created_by_admin_id) values(source_id,'mission','https://media.byus.test/activity.webm',60000,'active',admin_id);
 insert into public.mobile_participation_activity_policies(id,context_id,source_id,policy_version,activity_kind,state,opens_at,closes_at,completion_seconds,max_heartbeat_gap_seconds)
  values(policy_id,context_id,source_id,'v1','mission','published',now()-interval '1 hour',now()+interval '25 hours',30,10);
 insert into public.mobile_participation_activity_sessions(id,activity_id,app_user_id,source_id,source_revision,request_key,payload_hash)
  values(session_id,policy_id,owner,source_id,1,extensions.gen_random_uuid(),md5('activity-notification-session'));
 perform public.enqueue_due_fan_notifications();
 if exists(select 1 from public.fan_notifications where app_user_id=owner and kind::text='participation_deadline') then raise exception 'deadline reminder emitted too early'; end if;
 update public.mobile_participation_activity_policies set closes_at=now()+interval '1 hour' where id=policy_id;
 perform public.enqueue_due_fan_notifications();
 perform public.enqueue_due_fan_notifications();
 update public.fan_notifications set scheduled_for=now()-interval '1 second' where app_user_id=owner;
 if (select count(*) from public.fan_notifications where app_user_id=owner and kind::text='participation_deadline') is distinct from 1 then raise exception 'deadline missing or duplicated'; end if;
 select id into n from public.fan_notifications where app_user_id=owner and kind::text='participation_deadline';
 if public.fan_web_notification_path(owner,n) is distinct from ('/activities/'||policy_id) or public.fan_web_notification_path(viewer,n) is not null then raise exception 'deadline owner path invalid'; end if;
 perform public.mobile_claim_push_deliveries('activity-worker',100,60);
 select id into d from public.mobile_push_delivery_outbox where notification_id=n;
 result:=public.mobile_prepare_push_delivery(d,'activity-worker');
 if result is null or result#>>'{payload,category}' is distinct from 'participation' or (select count(*) from jsonb_object_keys(result->'payload')) is distinct from 3 then raise exception 'generic activity push payload invalid: %',result; end if;
 update public.notification_preferences set participation_notifications=false where app_user_id=owner;
 if public.mobile_prepare_push_delivery(d,'activity-worker') is not null then raise exception 'disabled activity topic still sent push'; end if;
 update public.notification_preferences set participation_notifications=true where app_user_id=owner;
 update public.mobile_participation_activity_sessions set state='completed',completed_at=now() where id=session_id;
 if public.fan_web_notification_path(owner,n) is not null then raise exception 'completed mission retained closing reminder'; end if;
 update public.mobile_participation_activity_sessions set state='viewing',completed_at=null where id=session_id;
 update public.mobile_participation_checkins set status='revoked' where app_user_id=owner;
 if public.fan_web_notification_path(owner,n) is not null then raise exception 'revoked checkin retained reminder'; end if;
 update public.mobile_participation_checkins set status='valid' where app_user_id=owner;
 update public.mobile_participation_activity_sources set state='revoked' where id=source_id;
 if public.fan_web_notification_path(owner,n) is not null then raise exception 'revoked mission source retained reminder'; end if;
 update public.mobile_participation_activity_sources set state='active' where id=source_id;
 update public.mobile_participation_events set state='cancelled' where id=event_id;
 if public.fan_web_notification_path(owner,n) is not null then raise exception 'cancelled event retained reminder'; end if;
 update public.mobile_participation_events set state='published' where id=event_id;
 update public.mobile_participation_activity_policies set closes_at=now()-interval '1 minute' where id=policy_id;
 if public.fan_web_notification_path(owner,n) is not null then raise exception 'expired mission remained eligible'; end if;
 if has_function_privilege('service_role','public.mobile_activity_notification_path(uuid,text,text,uuid)','EXECUTE') or has_function_privilege('anon','public.enqueue_due_fan_notifications(timestamptz)','EXECUTE') then raise exception 'private activity helper exposed'; end if;
 update public.app_users set status='disabled' where id=owner;
 if public.mobile_activity_notification_path(owner,'support_reply','cs_message',reply) is not null or public.mobile_activity_notification_path(owner,'stamp_issued','stamp',live_stamp) is not null then raise exception 'disabled owner retained activity notification'; end if;
end $$;
rollback;
