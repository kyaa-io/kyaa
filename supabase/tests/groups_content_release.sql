\set ON_ERROR_STOP on
-- Only disposable local data; no real user comments or external deliveries.
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable local database required';end if;end $$;
\ir groups_legacy_membership.sql
begin;
create function pg_temp.expect_content_error(statement text,expected text)returns void language plpgsql as $$
begin
 begin execute statement;exception when others then if sqlerrm<>expected then raise;end if;return;end;
 raise exception 'Expected error: %',expected;
end $$;
do $$
declare actor uuid:=gen_random_uuid();other uuid:=gen_random_uuid();creator uuid:=gen_random_uuid();page uuid:=gen_random_uuid();notice uuid:=gen_random_uuid();
 quiz uuid:=gen_random_uuid();attempt uuid:=gen_random_uuid();pass uuid:=gen_random_uuid();passport uuid:=gen_random_uuid();job uuid:=gen_random_uuid();
 idem uuid:=gen_random_uuid();result jsonb;comment uuid;post uuid;group_post uuid;room uuid;admin uuid:=gen_random_uuid();report uuid;
begin
 insert into public.app_users(id,privy_user_id,verified_email)values(actor,'did:privy:content-release-'||actor,actor||'@example.test'),(other,'did:privy:content-release-'||other,other||'@example.test');
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'content-release-fixture','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','댓글 검증','검증','검증');
 insert into public.group_pages(id,kind,celebrity_id,name)values(page,'fan',creator,'Comment fixture');
 insert into public.group_memberships(page_id,app_user_id)values(page,other);
 insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,ever_published_at)values(notice,creator,'welcome','published',now(),now());
 insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json)values(notice,'ko','공지','{"type":"doc","content":[]}');
 perform pg_temp.expect_content_error(format('select public.post_celebrity_notice_comment(%L,%L,%L,%L,%L)',actor,'content-release-fixture','welcome','명호형 화이팅!!!!',idem),'FAN_WEB_FORBIDDEN');
 -- A passport issued after the one-time group backfill must retain legacy access.
 insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at)values(quiz,creator,1,'published',now());
 insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)values(attempt,actor,creator,quiz,1,gen_random_uuid(),'passed',3,now());
 insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)values(pass,actor,creator,attempt);
 insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)values(job,'passport',passport,'content-release-'||passport,'{}');
 alter table public.fan_passports disable trigger fan_passports_validate_blockchain_job_link;
 insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)values(passport,actor,creator,pass,job);
 alter table public.fan_passports enable trigger fan_passports_validate_blockchain_job_link;
 if not public.fan_web_is_member(actor,creator)or public.fan_web_is_page_member(actor,creator)then raise exception 'Regression fixture did not reproduce passport/group mismatch';end if;
 update public.group_content_release set enabled=false where singleton;
 if not public.fan_web_is_page_member(actor,creator)or public.fan_web_is_page_member(other,creator)then raise exception 'Legacy passport boundary not restored';end if;
 result:=public.post_celebrity_notice_comment(actor,'content-release-fixture','welcome','명호형 화이팅!!!!',idem);comment:=(result->>'id')::uuid;
 result:=public.post_celebrity_notice_comment(actor,'content-release-fixture','welcome','명호형 화이팅!!!!',idem);
 if result->>'id'<>comment::text or result->>'replayed'<>'true'then raise exception 'Comment replay failed';end if;
 perform public.post_celebrity_notice_reply(actor,'content-release-fixture','welcome','답글',gen_random_uuid(),comment);
 perform public.post_celebrity_notice_comment(other,'content-release-fixture','welcome','공개 댓글',gen_random_uuid());
 if public.read_celebrity_notice_comments('content-release-fixture','welcome',actor)->>'total'<>'3'then raise exception 'Saved comments not readable';end if;
 result:=public.save_fan_post(actor,'content-release-fixture',null,'패스포트 전용 글','members','{}',null,gen_random_uuid());post:=(result->>'id')::uuid;
 if public.read_fan_post(other,post,'ko')is not null then raise exception 'Group-only member gained legacy private access';end if;
 perform pg_temp.expect_content_error(format('select public.post_celebrity_notice_comment(null,%L,%L,%L,%L)','content-release-fixture','welcome','guest',gen_random_uuid()),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(actor,other);
 if public.read_celebrity_notice_comments('content-release-fixture','welcome',actor)->>'total'<>'2'then raise exception 'Blocked author remained visible';end if;
 delete from public.user_blocks where app_user_id=actor;
 insert into public.admin_allowlist(id,email,role)values(admin,'content-release-admin@example.test','admin');
 report:=(public.post_content_report(other,'notice_comment',comment,'harassment',gen_random_uuid())->>'id')::uuid;
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)values(actor,report,'Fixture restriction only',admin);
 perform pg_temp.expect_content_error(format('select public.post_celebrity_notice_comment(%L,%L,%L,%L,%L)',actor,'content-release-fixture','welcome','restricted',gen_random_uuid()),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
 delete from public.app_user_moderation_restrictions where app_user_id=actor;
 update public.app_users set status='disabled'where id=actor;
 perform pg_temp.expect_content_error(format('select public.post_celebrity_notice_comment(%L,%L,%L,%L,%L)',actor,'content-release-fixture','welcome','disabled',gen_random_uuid()),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
 update public.app_users set status='active'where id=actor;
 insert into public.group_posts(page_id,author_id,title,body,visibility,anonymous)values(page,other,'Private group','private','members',false)returning id into group_post;
 insert into public.group_rooms(page_id,name)values(page,'Private room')returning id into room;
 if public.group_post_visible(actor,group_post)or public.group_room_allowed(actor,page,'Gold')then raise exception 'Legacy release bypassed group access';end if;
 update public.group_content_release set enabled=true where singleton;
 perform pg_temp.expect_content_error(format('select public.post_celebrity_notice_comment(%L,%L,%L,%L,%L)',actor,'content-release-fixture','welcome','unjoined',gen_random_uuid()),'FAN_WEB_FORBIDDEN');
 if not public.fan_web_is_page_member(other,creator)then raise exception 'Group member policy not restored';end if;
 delete from public.group_content_release;
 perform pg_temp.expect_content_error(format('select public.post_celebrity_notice_comment(%L,%L,%L,%L,%L)',actor,'content-release-fixture','welcome','missing release',gen_random_uuid()),'FAN_WEB_FORBIDDEN');
 if public.fan_web_is_page_member(actor,creator)then raise exception 'Missing release relaxed membership';end if;
 if has_table_privilege('service_role','public.group_content_release','SELECT')or has_table_privilege('service_role','public.group_content_release','UPDATE')or has_table_privilege('authenticated','public.group_content_release','UPDATE')or has_table_privilege('anon','public.group_content_release','UPDATE')then raise exception 'API role can access release configuration';end if;
 raise notice 'PASS content release: issued passport, comment/reply/read/replay, legacy private access, guest/disabled rejection, group isolation, missing-row protection';
end $$;
rollback;
