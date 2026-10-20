-- Run only in the disposable clean migration verifier; every fixture rolls back.
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required'; end if; end $$;
begin;
create function pg_temp.expect_quiz_error(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if sqlerrm=expected then return; else raise; end if; end; raise exception 'Expected error %',expected; end $$;
create function pg_temp.mission(owner uuid,key text) returns text language sql as $$
 select m->>'status' from jsonb_array_elements(public.read_owned_kyaa_wave_missions(owner)->'progress') m where m->>'key'=key $$;
insert into public.app_users(id,privy_user_id,verified_email)
select ('91b00000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'did:privy:quiz-cheer-'||i,'quiz-cheer-'||i||'@example.test' from generate_series(1,8)i;
insert into public.admin_allowlist(id,email,role,active) values
('91b00000-0000-4000-8000-000000000006','quiz-cheer-6@example.test','admin',true),
('91b00000-0000-4000-8000-000000000007','quiz-cheer-7@example.test','operator',true),
('91b00000-0000-4000-8000-000000000008','quiz-cheer-8@example.test','viewer',true);
insert into public.kyaa_wave_participants(app_user_id,name_encrypted)
select ('91b00000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture' from generate_series(1,4)i;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
values('91b00000-0000-4000-8000-000000000090','kyaa-wave-fanpage','published','/fixture.webp',now(),'{brand}','brand');
insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,ever_published_at)
values('91b00000-0000-4000-8000-000000000091','91b00000-0000-4000-8000-000000000090','wave-home-cheer','published',now(),now());
insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json)
select '91b00000-0000-4000-8000-000000000091',locale,'Home cheer','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Fixture"}]}]}'::jsonb from unnest(enum_range(null::public.content_locale)) locale;
do $$
declare owner uuid:='91b00000-0000-4000-8000-000000000001'; other_owner uuid:='91b00000-0000-4000-8000-000000000002'; admin_id uuid:='91b00000-0000-4000-8000-000000000006'; operator_id uuid:='91b00000-0000-4000-8000-000000000007'; viewer uuid:='91b00000-0000-4000-8000-000000000008'; outsider uuid:='91b00000-0000-4000-8000-000000000005'; participant uuid; other_participant uuid; disabled_participant uuid; receipt timestamptz; first_result jsonb; result jsonb; comment_id uuid; parent_id uuid; live_id uuid; signature text;
begin
 select id,created_at into participant,receipt from public.kyaa_wave_participants where app_user_id=owner;
 select id into other_participant from public.kyaa_wave_participants where app_user_id=other_owner;
 select id into disabled_participant from public.kyaa_wave_participants where app_user_id='91b00000-0000-4000-8000-000000000004';
 signature:='public.grant_admin_kyaa_wave_quiz_stamp(uuid,uuid,uuid,uuid)';
 assert has_function_privilege('service_role',signature,'EXECUTE');
 assert not has_function_privilege('anon',signature,'EXECUTE') and not has_function_privilege('authenticated',signature,'EXECUTE');
 assert not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace,aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='public' and p.proname='grant_admin_kyaa_wave_quiz_stamp' and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC cannot execute';
 assert (select relrowsecurity from pg_class where oid='public.kyaa_wave_participants'::regclass),'participant RLS enabled';
 assert not has_table_privilege('service_role','public.kyaa_wave_participants','UPDATE'),'service cannot directly stamp participants';
 perform pg_temp.expect_quiz_error(format('select public.grant_admin_kyaa_wave_quiz_stamp(%L,%L,%L,%L)',viewer,viewer,participant,extensions.gen_random_uuid()),'FAN_WEB_FORBIDDEN');
 perform pg_temp.expect_quiz_error(format('select public.grant_admin_kyaa_wave_quiz_stamp(%L,%L,%L,%L)',outsider,admin_id,participant,extensions.gen_random_uuid()),'FAN_WEB_FORBIDDEN');
 perform pg_temp.expect_quiz_error(format('select public.grant_admin_kyaa_wave_quiz_stamp(%L,%L,%L,%L)',outsider,outsider,participant,extensions.gen_random_uuid()),'FAN_WEB_FORBIDDEN');
 update public.app_users set status='disabled' where id='91b00000-0000-4000-8000-000000000004';
 -- Account disable purges its receipt; recreate a stale receipt to exercise the RPC guard.
 insert into public.kyaa_wave_participants(app_user_id,name_encrypted) values('91b00000-0000-4000-8000-000000000004','v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture') returning id into disabled_participant;
 perform pg_temp.expect_quiz_error(format('select public.grant_admin_kyaa_wave_quiz_stamp(%L,%L,%L,%L)',admin_id,admin_id,disabled_participant,extensions.gen_random_uuid()),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
 perform pg_temp.expect_quiz_error(format('select public.grant_admin_kyaa_wave_quiz_stamp(%L,%L,%L,%L)',admin_id,admin_id,extensions.gen_random_uuid(),extensions.gen_random_uuid()),'FAN_WEB_NOT_FOUND');
 perform pg_temp.expect_quiz_error(format('select public.grant_admin_kyaa_wave_quiz_stamp(%L,%L,%L,null)',admin_id,admin_id,participant),'FAN_WEB_INVALID_INPUT');
 perform pg_temp.expect_quiz_error(format('select public.read_owned_kyaa_wave_missions(%L)',outsider),'FAN_WEB_FORBIDDEN');
 assert pg_temp.mission(owner,'quiz-correct')='pending' and pg_temp.mission(owner,'website-cheer')='pending';
 first_result:=public.grant_admin_kyaa_wave_quiz_stamp(admin_id,admin_id,participant,extensions.gen_random_uuid());
 assert first_result->>'quizCorrectAt' is not null;
 assert public.grant_admin_kyaa_wave_quiz_stamp(operator_id,operator_id,participant,extensions.gen_random_uuid())=first_result,'replay preserves exact timestamp';
 assert (select count(*) from public.audit_logs where action='kyaa_wave.quiz_stamp_granted' and entity_id=participant::text)=1,'first grant audit only';
 assert exists(select 1 from jsonb_array_elements(public.list_admin_kyaa_wave_participants(viewer,viewer)) p where p->>'id'=participant::text and p->>'quizCorrectAt'=first_result->>'quizCorrectAt'),'admin list returns stamp';
 perform public.grant_admin_kyaa_wave_quiz_stamp(operator_id,operator_id,other_participant,extensions.gen_random_uuid());
 assert pg_temp.mission(other_owner,'quiz-correct')='completed','operator grants new stamp';
 insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key,created_at)
 values('91b00000-0000-4000-8000-000000000091',owner,'Home cheer',extensions.gen_random_uuid(),receipt-interval '1 second') returning id into comment_id;
 assert pg_temp.mission(owner,'website-cheer')='pending','precheckin home cheer excluded';
 update public.celebrity_notice_comments set created_at=receipt+interval '1 second' where id=comment_id;
 assert pg_temp.mission(owner,'website-cheer')='completed' and pg_temp.mission(owner,'live-cheer')='pending','home cheer does not complete LIVE';
 update public.celebrity_notice_comments set removed_at=clock_timestamp() where id=comment_id;
 assert pg_temp.mission(owner,'website-cheer')='pending','removed home cheer excluded';
 update public.celebrity_notice_comments set removed_at=null where id=comment_id;
 update public.celebrity_notices set visibility='members' where id='91b00000-0000-4000-8000-000000000091';
 assert pg_temp.mission(owner,'website-cheer')='pending','members notice excluded';
 update public.celebrity_notices set visibility='public',archived_at=clock_timestamp(),archived_by_admin_allowlist_id=admin_id,archive_reason='Fixture archive reason' where id='91b00000-0000-4000-8000-000000000091';
 assert pg_temp.mission(owner,'website-cheer')='pending','archived notice excluded';
 update public.celebrity_notices set archived_at=null,archived_by_admin_allowlist_id=null,archive_reason=null,publication_status='draft',published_at=null where id='91b00000-0000-4000-8000-000000000091';
 assert pg_temp.mission(owner,'website-cheer')='pending','unpublished notice excluded';
 update public.celebrity_notices set publication_status='published',published_at=clock_timestamp() where id='91b00000-0000-4000-8000-000000000091';
 update public.celebrity_notices set archived_at=null,archived_by_admin_allowlist_id=null,archive_reason=null where id='91b00000-0000-4000-8000-000000000091';
 insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key,removed_at)
 values('91b00000-0000-4000-8000-000000000091',owner,'Removed parent',extensions.gen_random_uuid(),clock_timestamp()) returning id into parent_id;
 insert into public.celebrity_notice_comments(notice_id,parent_id,app_user_id,body,idempotency_key,created_at)
 values('91b00000-0000-4000-8000-000000000091',parent_id,other_owner,'Hidden reply',extensions.gen_random_uuid(),clock_timestamp());
 assert pg_temp.mission(other_owner,'website-cheer')='pending','reply beneath removed parent excluded';
 insert into public.fan_lounge_messages(app_user_id,celebrity_id,body,idempotency_key,created_at)
 values(other_owner,'91b00000-0000-4000-8000-000000000090','LIVE cheer',extensions.gen_random_uuid(),receipt-interval '1 second') returning id into live_id;
 assert pg_temp.mission(other_owner,'live-cheer')='pending','precheckin LIVE excluded';
 update public.fan_lounge_messages set created_at=clock_timestamp() where id=live_id;
 assert pg_temp.mission(other_owner,'live-cheer')='completed' and pg_temp.mission(other_owner,'website-cheer')='pending','LIVE does not complete home cheer';
 update public.fan_lounge_messages set removed_at=clock_timestamp() where id=live_id;
 assert pg_temp.mission(other_owner,'live-cheer')='pending','removed LIVE excluded';
 result:=public.save_owned_kyaa_wave_draw_preferences(owner,array['camera','meal','blue'],extensions.gen_random_uuid());
 result:=public.execute_admin_kyaa_wave_draw(admin_id,admin_id,extensions.gen_random_uuid(),extensions.gen_random_uuid());
 assert (select tickets from public.kyaa_wave_draw_candidates where app_user_id=owner)=3,'checkin + quiz + home cheer count as tickets';
 assert public.grant_admin_kyaa_wave_quiz_stamp(admin_id,admin_id,participant,extensions.gen_random_uuid())=first_result,'postdraw replay allowed';
 select id into participant from public.kyaa_wave_participants where app_user_id='91b00000-0000-4000-8000-000000000003';
 perform pg_temp.expect_quiz_error(format('select public.grant_admin_kyaa_wave_quiz_stamp(%L,%L,%L,%L)',admin_id,admin_id,participant,extensions.gen_random_uuid()),'FAN_WEB_CONFLICT');
 assert (select quiz_correct_at is null from public.kyaa_wave_participants where id=participant),'postdraw conflict leaves no stamp';
 assert not exists(select 1 from public.audit_logs where action='kyaa_wave.quiz_stamp_granted' and entity_id=participant::text),'postdraw conflict leaves no audit';
end $$;
rollback;
\echo 'Wave quiz and home cheer SQL assertions passed'
