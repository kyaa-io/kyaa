-- Synthetic fixtures only; every mutation rolls back in the disposable verifier.
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required'; end if; end $$;
begin;
\ir wave_stage_upgrade_before.sql
create function pg_temp.expect_presentation_error(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if sqlerrm=expected then return; else raise; end if; end; raise exception 'Expected error %',expected; end $$;
create function pg_temp.presentation() returns jsonb language sql as $$
 select public.read_admin_wave_stage_presentation('92900000-0000-4000-8000-000000000001','92900000-0000-4000-8000-000000000002','all'); $$;
create function pg_temp.completed(key text) returns bigint language sql as $$
 select (item->>'completed')::bigint from jsonb_array_elements(pg_temp.presentation()->'missions'->'items') item where item->>'key'=key; $$;
insert into public.app_users(id,privy_user_id,verified_email)
select ('92c00000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'did:privy:wave-presentation-'||i,'wave-presentation-'||i||'@example.test' from generate_series(1,6)i;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
values('92c00000-0000-4000-8000-000000000090','kyaa-wave-fanpage','published','/fixture.webp',now(),'{brand}','brand');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
values('92c00000-0000-4000-8000-000000000090','ko','Fixture wave','Fixture','Fixture'),('92c00000-0000-4000-8000-000000000090','en','Fixture wave','Fixture','Fixture');
insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,ever_published_at)
values('92c00000-0000-4000-8000-000000000091','92c00000-0000-4000-8000-000000000090','live-insight','published',now(),now()),
('92c00000-0000-4000-8000-000000000092','92c00000-0000-4000-8000-000000000090','wave-home-cheer','published',now(),now());
insert into public.kyaa_wave_participants(app_user_id,name_encrypted,created_at,name_fingerprint)
select ('92c00000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture',
 case i when 3 then '2026-10-21T14:59:59.999999Z'::timestamptz when 4 then '2026-10-21T15:00:00Z'::timestamptz when 5 then '2026-10-22T15:00:00Z'::timestamptz else '2026-01-01T00:00:00Z'::timestamptz end
,md5('wave_stage_presentation:'||i::text)||md5('wave_stage_presentation:'||i::text) from generate_series(1,5)i;

insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json)
select n.id,locale,'Fixture notice','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Fixture"}]}]}'::jsonb
from public.celebrity_notices n cross join unnest(enum_range(null::public.content_locale)) locale where n.celebrity_id='92c00000-0000-4000-8000-000000000090';

do $$
declare actor uuid:='92900000-0000-4000-8000-000000000001'; admin_id uuid:='92900000-0000-4000-8000-000000000002';
 owner uuid:='92c00000-0000-4000-8000-000000000001'; friend uuid:='92c00000-0000-4000-8000-000000000002'; wave uuid:='92c00000-0000-4000-8000-000000000090';
 creator uuid; quiz uuid; attempt uuid; pass uuid; passport uuid; job uuid; reaction uuid; user_id uuid; stamp_time timestamptz; boundary timestamptz;
 result jsonb; day_result jsonb; old_result jsonb; progress jsonb; expected bigint; actual bigint; item jsonb; post uuid; asset uuid; friendship uuid; conversation uuid; message uuid; comment uuid; parent uuid; report uuid; n integer; signature text;
begin
 signature:='public.read_admin_wave_stage_presentation(uuid,uuid,text)';
 assert not has_function_privilege('anon',signature,'EXECUTE') and not has_function_privilege('authenticated',signature,'EXECUTE');
 assert has_function_privilege('service_role',signature,'EXECUTE');
 perform pg_temp.expect_presentation_error(format('select public.read_admin_wave_stage_presentation(%L,%L,''all'')',owner,admin_id),'FAN_WEB_FORBIDDEN');
 perform pg_temp.expect_presentation_error(format('select public.read_admin_wave_stage_presentation(%L,%L,''today'')',actor,admin_id),'FAN_WEB_INVALID_INPUT');
 perform pg_temp.expect_presentation_error(format('select public.read_admin_wave_stage_presentation(%L,%L,null)',actor,admin_id),'FAN_WEB_INVALID_INPUT');
 update public.admin_allowlist set role='viewer' where id=admin_id;
 result:=pg_temp.presentation();
 assert result->>'scope'='all' and result->'from'='null'::jsonb and result->>'to'=result->>'asOf';
 assert jsonb_array_length(result->'creators')=2 and jsonb_array_length(result->'missions'->'items')=10;
 assert result->'creators'->0->>'engagedFans'='0','empty metrics are zero';
 assert not (result::text ~ '(appUserId|email|wallet|nameEncrypted|body|signup|campaignId|liveEventId)');
 select id into creator from public.celebrities where slug='changha';
 insert into public.celebrity_quizzes(celebrity_id,version,status) values(creator,1,'draft') returning id into quiz;
 for n in 1..5 loop
  user_id:=('92c00000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  boundary:=case n when 3 then '2026-10-21T14:59:59.999999Z'::timestamptz when 4 then '2026-10-21T15:00:00Z'::timestamptz when 5 then '2026-10-22T15:00:00Z'::timestamptz else '2026-01-02T00:00:00Z'::timestamptz end;
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values(user_id,91342,'0x'||lpad(n::text,40,'0'),'privy','embedded');
  insert into public.quiz_attempts(app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
  values(user_id,creator,quiz,1,extensions.gen_random_uuid(),'passed',3,boundary) returning id into attempt;
  insert into public.quiz_passes(app_user_id,celebrity_id,winning_attempt_id) values(user_id,creator,attempt) returning id into pass;
  passport:=extensions.gen_random_uuid();
  insert into public.blockchain_jobs(entity_type,entity_id,operation_key,payload)
  values('passport',passport,'byus:passport:v1:'||user_id||':changha',jsonb_build_object('recipient','0x'||lpad(n::text,40,'0'),'celebritySlug','changha','passportId','0x'||repeat('a',64))) returning id into job;
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id,issued_at) values(passport,user_id,creator,pass,job,boundary);
  insert into public.live_reservations(app_user_id,live_event_id,celebrity_id,passport_id,idempotency_key,reserved_at)
  values(user_id,'fde5ff1b-ac41-4c20-902b-034cba972023',creator,passport,extensions.gen_random_uuid(),boundary);
  reaction:=extensions.gen_random_uuid();
  insert into public.blockchain_jobs(entity_type,entity_id,operation_key,payload)
  values('reaction',reaction,'byus:reaction:v1:'||reaction,jsonb_build_object('recipient','0x'||lpad(n::text,40,'0'),'celebritySlug','changha','issuanceId','0x'||repeat('b',64),'reactionType','FirstReaction')) returning id into job;
  insert into public.fan_reactions(id,app_user_id,celebrity_id,blockchain_job_id,completed_at) values(reaction,user_id,creator,job,boundary);
  insert into public.fan_lounge_messages(app_user_id,celebrity_id,body,idempotency_key,created_at) values(user_id,creator,'Fixture cheer',extensions.gen_random_uuid(),boundary);
 end loop;
 -- More than one cheer from the same fan never increases the distinct fan count.
 insert into public.fan_lounge_messages(app_user_id,celebrity_id,body,idempotency_key,created_at,removed_at) values
 (owner,creator,'Second cheer',extensions.gen_random_uuid(),'2026-01-02T00:00:00Z',null),
 (owner,creator,'Removed cheer',extensions.gen_random_uuid(),'2026-01-02T00:00:00Z',now());
 -- Explicitly seed an old whitespace-only row to protect reads against legacy invalid data.
 set constraints wave_mission_evidence_fan_lounge_messages immediate;
 alter table public.fan_lounge_messages drop constraint fan_lounge_messages_body_check;
 set constraints wave_mission_evidence_fan_lounge_messages deferred;
 insert into public.fan_lounge_messages(app_user_id,celebrity_id,body,idempotency_key,created_at) values(owner,creator,'  ',extensions.gen_random_uuid(),'2026-01-02T00:00:00Z');
 update public.app_users set status='disabled' where id=friend;
 result:=pg_temp.presentation();
 select count(*) into expected from public.live_reservations r join public.app_users u on u.id=r.app_user_id and u.status='active' where r.live_event_id='fde5ff1b-ac41-4c20-902b-034cba972023' and r.reserved_at<(result->>'to')::timestamptz;
 assert (result->'creators'->0->>'reservations')::bigint=expected;
 assert (result->'creators'->0->>'passports')::bigint=expected and (result->'creators'->0->>'likes')::bigint=expected;
 assert (result->'creators'->0->>'comments')::bigint=expected+1 and (result->'creators'->0->>'engagedFans')::bigint=expected,'union deduplicates all four sources';
 assert result->'creators'->1->>'engagedFans'='0','creator isolation';
 day_result:=public.read_admin_wave_stage_presentation(actor,admin_id,'event-day');
 assert (day_result->>'from')::timestamptz='2026-10-21T15:00:00Z'::timestamptz;
 assert (day_result->>'to')::timestamptz=least((day_result->>'asOf')::timestamptz,'2026-10-22T15:00:00Z'::timestamptz);
 select count(*) into expected from public.live_reservations r join public.app_users u on u.id=r.app_user_id and u.status='active' where r.live_event_id='fde5ff1b-ac41-4c20-902b-034cba972023' and r.reserved_at>=(day_result->>'from')::timestamptz and r.reserved_at<(day_result->>'to')::timestamptz;
 assert (day_result->'creators'->0->>'reservations')::bigint=expected and (day_result->'creators'->0->>'passports')::bigint=expected and (day_result->'creators'->0->>'likes')::bigint=expected;
 select count(*) into expected from public.kyaa_wave_participants p join public.app_users u on u.id=p.app_user_id and u.status='active' where p.created_at>=(day_result->>'from')::timestamptz and p.created_at<(day_result->>'to')::timestamptz;
 assert (day_result->'missions'->>'participants')::bigint=expected;
 -- Exercise the exact half-open event-day predicate with a fixed after-event cutoff.
 assert (select array_agg(t order by t) from unnest(array['2026-10-21T14:59:59.999999Z'::timestamptz,'2026-10-21T15:00:00Z'::timestamptz,'2026-10-22T14:59:59.999999Z'::timestamptz,'2026-10-22T15:00:00Z'::timestamptz]) t
  where t>=(day_result->>'from')::timestamptz and t<least('2026-10-23T00:00:00Z'::timestamptz,'2026-10-22T15:00:00Z'::timestamptz))
  =array['2026-10-21T15:00:00Z'::timestamptz,'2026-10-22T14:59:59.999999Z'::timestamptz],'inclusive start and exclusive end';
 -- Existing participant cohort stays fixed while current completion evidence changes.
 insert into public.fan_posts(app_user_id,celebrity_id,body,visibility,idempotency_key,create_request_hash,created_at)
 values(owner,wave,'Fixture introduction','public',extensions.gen_random_uuid(),'test','2026-01-03T00:00:00Z') returning id into post;
 insert into public.content_assets(app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,post_id,uploaded_at)
 values(owner,wave,'presentation-fixture/photo.webp',100,20,20,repeat('a',64),post,'2026-01-03T00:00:00Z') returning id into asset;
 assert pg_temp.completed('event-photo')=1 and pg_temp.completed('introduction')=1;
 update public.fan_posts set hidden_at=now() where id=post;
 assert pg_temp.completed('event-photo')=0 and pg_temp.completed('introduction')=0;
 update public.fan_posts set hidden_at=null where id=post;
 update public.app_users set status='active' where id=friend;
 insert into public.kyaa_wave_participants(app_user_id,name_encrypted,created_at,name_fingerprint) values(friend,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture','2026-01-01T00:00:00Z',md5('wave_stage_presentation:0')||md5('wave_stage_presentation:0')) on conflict(app_user_id,event_key) do nothing;
 insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash,accepted_at)
 values(owner,friend,wave,'accepted',extensions.gen_random_uuid(),'test','2026-01-03T00:00:00Z') returning id into friendship;
 insert into public.social_dm_conversations(user_low_id,user_high_id,requester_id,status,request_id,payload_hash)
 values(least(owner,friend),greatest(owner,friend),owner,'accepted',extensions.gen_random_uuid(),'test') returning id into conversation;
 insert into public.social_dm_messages(conversation_id,sender_id,body,request_id,payload_hash,created_at)
 values(conversation,owner,'Fixture private greeting',extensions.gen_random_uuid(),'test','2026-01-03T00:00:00Z') returning id into message;
 assert pg_temp.completed('friendship')=2 and pg_temp.completed('dm-greeting')=1,format('friendship %s dm %s',pg_temp.completed('friendship'),pg_temp.completed('dm-greeting'));
 insert into public.social_dm_message_deletions(message_id,app_user_id) values(message,owner);
 assert pg_temp.completed('dm-greeting')=0;
 delete from public.social_dm_message_deletions where message_id=message and app_user_id=owner;
 insert into public.fan_lounge_messages(app_user_id,celebrity_id,body,idempotency_key,created_at) values(owner,wave,'Wave cheer',extensions.gen_random_uuid(),'2026-01-03T00:00:00Z');
 insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key,created_at) values('92c00000-0000-4000-8000-000000000091',owner,'Insight',extensions.gen_random_uuid(),'2026-01-03T00:00:00Z');
 insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key,created_at) values('92c00000-0000-4000-8000-000000000092',owner,'Home cheer',extensions.gen_random_uuid(),'2026-01-03T00:00:00Z') returning id into comment;
 reaction:=extensions.gen_random_uuid();
 insert into public.blockchain_jobs(entity_type,entity_id,operation_key,payload)
 values('reaction',reaction,'byus:reaction:v1:'||reaction,jsonb_build_object('recipient','0x'||lpad('1',40,'0'),'celebritySlug','kyaa-wave-fanpage','issuanceId','0x'||repeat('c',64),'reactionType','FirstReaction')) returning id into job;
 insert into public.fan_reactions(id,app_user_id,celebrity_id,blockchain_job_id,completed_at) values(reaction,owner,wave,job,'2025-12-01T00:00:00Z');
 assert pg_temp.completed('fanpage-like')=1,'current like need not have occurred after checkin';
 update public.kyaa_wave_participants set quiz_correct_at=now() where app_user_id=owner;
 assert pg_temp.completed('live-cheer')=1 and pg_temp.completed('insight-review')=1 and pg_temp.completed('website-cheer')=1 and pg_temp.completed('quiz-correct')=1;
 update public.celebrity_notice_comments set removed_at=now() where id=comment;
 assert pg_temp.completed('website-cheer')=0;
 -- Stage counts use the same renewed-DM and session-comment evidence as participant missions.
 update public.social_dm_conversations set status='cancelled' where id=conversation;
 update public.social_friendships set accepted_at='2026-01-04T00:00:00Z' where id=friendship;
 assert pg_temp.completed('dm-greeting')=0,'old cancelled-conversation DM excluded from presentation';
 update public.social_dm_messages set created_at='2026-01-05T00:00:00Z' where id=message;
 assert pg_temp.completed('dm-greeting')=1,'renewed friendship DM included in presentation';
 insert into public.fan_posts(app_user_id,celebrity_id,program_notice_id,body,visibility,idempotency_key,create_request_hash,created_at)
 values(owner,wave,'92c00000-0000-4000-8000-000000000091','Session discussion','public',extensions.gen_random_uuid(),'test','2026-01-03T00:00:00Z') returning id into post;
 insert into public.fan_post_comments(post_id,app_user_id,body,idempotency_key,created_at)
 values(post,friend,'Session appreciation',extensions.gen_random_uuid(),'2026-01-04T00:00:00Z') returning id into comment;
 assert pg_temp.completed('insight-review')=2,'session post comment included in presentation';
 update public.fan_post_comments set hidden_at=now() where id=comment;
 assert pg_temp.completed('insight-review')=1,'hidden session post comment excluded from presentation';
 update public.fan_post_comments set hidden_at=null where id=comment;
 -- Aggregates agree with the canonical mission reader for all active, unrestricted participants.
 result:=pg_temp.presentation();
 for item in select * from jsonb_array_elements(result->'missions'->'items') loop
  select count(*) into expected from public.kyaa_wave_participants p join public.app_users u on u.id=p.app_user_id and u.status='active'
   cross join lateral jsonb_array_elements(public.read_owned_kyaa_wave_missions(p.app_user_id)->'progress') m
   where p.event_key='kyaa-wave-2026' and p.created_at<(result->>'to')::timestamptz and m->>'key'=item->>'key' and m->>'status'='completed';
  assert (item->>'completed')::bigint=expected,'exact current mission predicates';
 end loop;
 -- Active moderation-restricted participants still count; no per-participant locking RPC is called.
 insert into public.content_reports(app_user_id,celebrity_id,target_type,target_id,target_revision,target_app_user_id,reason,idempotency_key)
 values(owner,wave,'fan_post',extensions.gen_random_uuid(),1,friend,'Fixture restriction',extensions.gen_random_uuid()) returning id into report;
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id) values(friend,report,'Fixture restriction',admin_id);
 old_result:=pg_temp.presentation();
 assert old_result->'missions'->>'participants'=result->'missions'->>'participants';
 -- Wrong creator joins fail closed instead of silently returning an incomplete aggregate.
 -- Only this synthetic corruption fixture bypasses the immutable-slug trigger.
 set constraints all immediate;
 alter table public.celebrities disable trigger celebrities_preserve_referenced_slug;
 update public.celebrities set slug='presentation-wrong-creator' where slug='wena';
 alter table public.celebrities enable trigger celebrities_preserve_referenced_slug;
 perform pg_temp.expect_presentation_error('select pg_temp.presentation()','FAN_WEB_UNAVAILABLE');
end $$;
rollback;
\echo 'Wave presentation SQL assertions passed'
