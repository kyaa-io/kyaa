\set ON_ERROR_STOP on
-- B6 plan v4 §10.1 S12–S13: profile reports into the admin queue. Synthetic fixtures only; everything rolls back.
do $$ begin if inet_server_addr() is not null then raise exception 'Disposable local database required'; end if; end $$;
begin;
create function pg_temp.err(p_statement text) returns text language plpgsql as $$
begin execute p_statement; return 'ok'; exception when others then return sqlerrm; end $$;

do $test$
declare creator uuid:=extensions.gen_random_uuid();slug text:='b6-report-fixture';gpage uuid:=extensions.gen_random_uuid();
 admin_id uuid:=extensions.gen_random_uuid();allow uuid:=extensions.gen_random_uuid();reporter uuid:=extensions.gen_random_uuid();target uuid:=extensions.gen_random_uuid();
 other uuid:=extensions.gen_random_uuid();post uuid;gpost uuid;ref jsonb;req uuid:=extensions.gen_random_uuid();r jsonb;r2 jsonb;rep uuid;rep2 uuid;items jsonb;item jsonb;i integer;u uuid;
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,slug,'published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','B6 신고','소개','사진');
 foreach u in array array[admin_id,reporter,target,other] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:b6p-'||u,u||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,'b6p'||left(u::text,8),'b6p'||left(u::text,8));
 end loop;
 insert into public.admin_allowlist(id,email,role)values(allow,admin_id||'@example.test','admin');
 update public.app_users set verified_email=admin_id||'@example.test' where id=admin_id;
 insert into public.fan_profile_public_fields(app_user_id,sns_links,bio)values(target,'{https://example.test/t}','첫 소개');
 post:=(public.save_fan_post(target,slug,null,'target post','public','{}',null,extensions.gen_random_uuid())->>'id')::uuid;
 insert into public.group_pages(id,kind,name)values(gpage,'hobby','B6 report group');
 insert into public.group_posts(id,page_id,author_id,title,body,visibility,anonymous)values(extensions.gen_random_uuid(),gpage,target,'t','group body','public',false) returning id into gpost;
 ref:=jsonb_build_object('kind','fan_post','id',post);

 -- S12: one report, replayed by request id and repeated with a new one; the admin sees it once, with the profile text.
 r:=public.report_social_profile(reporter,ref,'harassment','상세 내용',req);
 r2:=public.report_social_profile(reporter,ref,'harassment','상세 내용',req);
 if r<>r2 then raise exception 'S12 replay %/%',r,r2; end if;
 if (public.report_social_profile(reporter,ref,'harassment','상세 내용',extensions.gen_random_uuid())->>'id')<>r->>'id' then raise exception 'S12 an open report is the answer'; end if;
 rep:=(r->>'id')::uuid;
 if (select count(*) from public.content_reports where target_type='user_profile' and target_id=target)<>1 then raise exception 'S12 one row'; end if;
 if (select target_app_user_id from public.content_reports where id=rep)<>target or (select context_target_type||':'||context_target_id from public.content_reports where id=rep)<>'fan_post:'||post then raise exception 'S12 target/context'; end if;
 if (select body from public.social_profile_report_snapshots where report_id=rep) not like '%첫 소개%https://example.test/t%상세 내용%' then raise exception 'S12 snapshot %',(select body from public.social_profile_report_snapshots where report_id=rep); end if;
 items:=public.read_admin_content_reports(admin_id,allow,'open',null,null,50)->'items';
 select v into item from jsonb_array_elements(items) v where v->>'id'=rep::text;
 if item->>'targetType'<>'user_profile' or item#>>'{target,body}' is distinct from (select body from public.social_profile_report_snapshots where report_id=rep)
  or item#>>'{target,authorUserId}'<>target::text or item#>>'{target,contextTargetType}'<>'fan_post' then raise exception 'S12 admin item %',item; end if;
 if pg_temp.err(format('select public.report_social_profile(%L,%L,''spam'',null,%L)',target,ref,extensions.gen_random_uuid()))<>'SOCIAL_FORBIDDEN' then raise exception 'S12 self'; end if;
 if pg_temp.err(format('select public.report_social_profile(%L,%L,''spam'',null,%L)',reporter,jsonb_build_object('kind','fan_post','id',extensions.gen_random_uuid()),extensions.gen_random_uuid()))<>'SOCIAL_NOT_FOUND' then raise exception 'S12 unknown ref'; end if;
 if pg_temp.err(format('select public.report_social_profile(%L,%L,''nope'',null,%L)',reporter,ref,extensions.gen_random_uuid()))<>'SOCIAL_CONFLICT' then raise exception 'S12 reason'; end if;

 -- S13: nothing to hide on a profile; resolving and restricting the person works.
 if pg_temp.err(format('select public.resolve_admin_content_report(%L,%L,%L,%L,''resolved'',true,''프로필 신고 처리 사유입니다'',false)',admin_id,allow,extensions.gen_random_uuid(),rep))<>'FAN_WEB_INVALID_INPUT' then raise exception 'S13 hide'; end if;
 r:=public.resolve_admin_content_report(admin_id,allow,extensions.gen_random_uuid(),rep,'resolved',false,'프로필 신고 처리 사유입니다',true);
 if r->>'status'<>'resolved' or not exists(select 1 from public.app_user_moderation_restrictions where app_user_id=target and revoked_at is null) then raise exception 'S13 restrict %',r; end if;
 set local session_replication_role=replica;
 update public.app_user_moderation_restrictions set revoked_at=now() where app_user_id=target;
 set local session_replication_role=origin;

 -- S12b: after handling, the same text answers with the old report; a changed intro is revision 2; a group post is a context.
 if (public.report_social_profile(reporter,ref,'harassment','상세 내용',extensions.gen_random_uuid())->>'id')<>rep::text then raise exception 'S12b unchanged'; end if;
 update public.fan_profile_public_fields set bio='바뀐 소개' where app_user_id=target;
 rep2:=(public.report_social_profile(reporter,ref,'harassment','상세 내용',extensions.gen_random_uuid())->>'id')::uuid;
 if rep2=rep or (select target_revision from public.content_reports where id=rep2)<>2 then raise exception 'S12b revision'; end if;
 r:=public.report_social_profile(other,jsonb_build_object('kind','group_post','id',gpost),'spam',null,extensions.gen_random_uuid());
 if (select context_target_type from public.content_reports where id=(r->>'id')::uuid)<>'group_post' then raise exception 'S12b group post context'; end if;
 -- Daily limit: 30 new profile reports, the 31st refused.
 for i in 1..29 loop
  insert into public.app_users(id,privy_user_id,verified_email)values(extensions.gen_random_uuid(),'did:privy:b6p-fill-'||i,'b6p-fill-'||i||'@example.test') returning id into u;
  perform public.report_social_profile(other,jsonb_build_object('kind','profile','profileId',u),'spam',null,extensions.gen_random_uuid());
 end loop;
 insert into public.app_users(id,privy_user_id,verified_email)values(extensions.gen_random_uuid(),'did:privy:b6p-over','b6p-over@example.test') returning id into u;
 if pg_temp.err(format('select public.report_social_profile(%L,%L,''spam'',null,%L)',other,jsonb_build_object('kind','profile','profileId',u),extensions.gen_random_uuid()))<>'SOCIAL_RATE_LIMITED' then raise exception 'S12b 31st'; end if;

 if has_function_privilege('anon','public.report_social_profile(uuid,jsonb,text,text,uuid)','execute') or not has_function_privilege('service_role','public.report_social_profile(uuid,jsonb,text,text,uuid)','execute')
  or has_table_privilege('service_role','public.social_profile_report_snapshots','select') then raise exception 'grants'; end if;
end $test$;
rollback;
\echo PASS b6_profile_report
