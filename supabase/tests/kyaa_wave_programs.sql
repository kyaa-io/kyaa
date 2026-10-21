-- All fixtures roll back; the race verifier reuses only this bounded fixture setup.
do $$ begin
 if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required'; end if;
end $$;
create function pg_temp.expect_error(statement text,message text) returns void language plpgsql as $$
begin
 execute statement;
 raise exception 'Missing expected error: %',message;
exception when others then
 if sqlerrm like 'Missing expected error:%' or position(message in sqlerrm)=0 then raise; end if;
end $$;
begin;
insert into public.app_users(id,privy_user_id,verified_email)
select ('91600000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'did:privy:wave-qa-'||i,'wave-qa-'||i||'@example.test' from generate_series(1,5) i;
insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint)
select ('91600000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.'||repeat('c',24),md5('kyaa_wave_programs:'||i::text)||md5('kyaa_wave_programs:'||i::text) from generate_series(1,5) i;
insert into public.celebrities(id,slug,status,image_url,published_at,fan_count,roles,primary_role)
values('91600000-0000-4000-8000-000000000010','kyaa-wave-fanpage','published','/wave-test.webp',clock_timestamp(),1,'{brand}','brand'),
 ('91600000-0000-4000-8000-000000000011','wave-other-qa','published','/wave-test.webp',clock_timestamp(),1,'{brand}','brand');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
select id,locale,'Wave QA','Wave QA','Wave QA' from public.celebrities cross join unnest(enum_range(null::public.content_locale)) locale where id in('91600000-0000-4000-8000-000000000010','91600000-0000-4000-8000-000000000011');
insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,ever_published_at)
select ('91600000-0000-4000-8000-'||lpad((20+ord)::text,12,'0'))::uuid,'91600000-0000-4000-8000-000000000010',slug,'published',clock_timestamp(),clock_timestamp()
from unnest(array['live-insight','wave-quiz','community-starts']) with ordinality p(slug,ord);
insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json)
select id,locale,'Wave program','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Program"}]}]}'::jsonb
from public.celebrity_notices cross join unnest(enum_range(null::public.content_locale)) locale where celebrity_id='91600000-0000-4000-8000-000000000010';

do $$
declare owner uuid:='91600000-0000-4000-8000-000000000001'; other_user uuid:='91600000-0000-4000-8000-000000000002';
 asset uuid:=extensions.gen_random_uuid(); idem uuid:=extensions.gen_random_uuid(); general_key uuid:=extensions.gen_random_uuid();
 result jsonb; post_id uuid; plain_id uuid; comment_id uuid; s text; page jsonb; before_earned timestamptz; jobs bigint;
begin
 select count(*) into jobs from public.blockchain_jobs;
 foreach s in array array['live-insight','wave-quiz','community-starts'] loop
  result:=public.save_fan_program_post(owner,'kyaa-wave-fanpage',s,'plain '||s,'public','{}',extensions.gen_random_uuid());
  plain_id:=(result->>'id')::uuid;
  page:=public.read_fan_program_posts('91600000-0000-4000-8000-000000000002','kyaa-wave-fanpage',s);
  assert jsonb_array_length(page->'items')=1 and page->'items'->0->>'id'=plain_id::text,'program isolation';
 end loop;
 assert (select count(*) from public.fan_program_stamps)=0,'plain text must not earn';
 perform public.save_fan_post(owner,'kyaa-wave-fanpage',null,'general','public','{}',null,general_key);
 perform pg_temp.expect_error(format('select public.save_fan_program_post(%L,%L,%L,%L,%L,%L,%L)',owner,'kyaa-wave-fanpage','live-insight','general','public','{}',general_key),'FAN_WEB_CONFLICT');
 insert into public.content_assets(id,app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,uploaded_at)
 values(asset,owner,'91600000-0000-4000-8000-000000000010','wave-test/'||asset,50,100,100,repeat('a',64),clock_timestamp());
 perform pg_temp.expect_error(format('select public.save_fan_program_post(%L,%L,%L,%L,%L,%L::uuid[],%L)',other_user,'kyaa-wave-fanpage','live-insight','photo','public',array[asset],idem),'MEDIA_INVALID_ASSET');
 result:=public.save_fan_program_post(owner,'kyaa-wave-fanpage','live-insight','photo','public',array[asset],idem);
 post_id:=(result->>'id')::uuid;
 assert (select count(*) from public.fan_program_stamps where app_user_id=owner)=1,'photo earns after association';
 result:=public.save_fan_program_post(owner,'kyaa-wave-fanpage','live-insight','photo','public',array[asset],idem);
 assert result->>'replayed'='true','same program replay';
 perform pg_temp.expect_error(format('select public.save_fan_program_post(%L,%L,%L,%L,%L,%L::uuid[],%L)',owner,'kyaa-wave-fanpage','wave-quiz','photo','public',array[asset],idem),'FAN_WEB_CONFLICT');
 perform public.save_fan_post(owner,'kyaa-wave-fanpage',post_id,'edited photo','public',array[asset],1,null);
 perform pg_temp.expect_error(format('update public.fan_posts set visibility=%L where id=%L','members',post_id),'FAN_WEB_INVALID_INPUT');
 assert (select program_notice_id='91600000-0000-4000-8000-000000000021' from public.fan_posts where id=post_id),'edit preserves binding';
 perform pg_temp.expect_error(format('update public.fan_posts set program_notice_id=null where id=%L',post_id),'FAN_WEB_CONFLICT');
 insert into public.fan_post_comments(post_id,app_user_id,body,idempotency_key) values(post_id,other_user,'comment',extensions.gen_random_uuid()) returning id into comment_id;
 insert into public.fan_post_comments(post_id,parent_id,app_user_id,body,idempotency_key) values(post_id,comment_id,owner,'reply',extensions.gen_random_uuid());
 insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key) values('91600000-0000-4000-8000-000000000022',other_user,'notice comment',extensions.gen_random_uuid()) returning id into comment_id;
 insert into public.celebrity_notice_comments(notice_id,parent_id,app_user_id,body,idempotency_key) values('91600000-0000-4000-8000-000000000022',comment_id,owner,'notice reply',extensions.gen_random_uuid());
 assert (select count(*) from public.fan_program_stamps where app_user_id=owner)=2,'notice reply earns';
 assert jsonb_array_length(public.read_owned_fan_program_stamps('91600000-0000-4000-8000-000000000003','kyaa-wave-fanpage')->'stamps')=0,'no other owner stamps';
 select earned_at into before_earned from public.fan_program_stamps where app_user_id=owner and program_notice_id='91600000-0000-4000-8000-000000000021';
 perform public.remove_fan_post(owner,post_id);
 result:=public.save_fan_program_post(owner,'kyaa-wave-fanpage','live-insight','again','public','{}',extensions.gen_random_uuid());
 assert (select earned_at=before_earned from public.fan_program_stamps where app_user_id=owner and program_notice_id='91600000-0000-4000-8000-000000000021'),'deletion retains original stamp';
 update public.celebrity_notices set visibility='members' where id='91600000-0000-4000-8000-000000000021';
 assert public.fan_web_post_json(other_user,(result->>'id')::uuid) is null,'hidden notice hides general projection';
 perform pg_temp.expect_error($q$select public.read_fan_program_posts('91600000-0000-4000-8000-000000000002','kyaa-wave-fanpage','live-insight')$q$,'FAN_WEB_NOT_FOUND');
 update public.celebrity_notices set visibility='public' where id='91600000-0000-4000-8000-000000000021';
 assert public.fan_web_post_json(other_user,(result->>'id')::uuid) is not null,'restored notice visible to checked-in viewer';
 assert public.fan_web_post_json(null,(result->>'id')::uuid) is null,'guest cannot read Wave post';
 perform pg_temp.expect_error($q$select public.read_fan_program_posts(null,'wave-other-qa','live-insight')$q$,'FAN_WEB_NOT_FOUND');
 perform pg_temp.expect_error($q$select public.read_fan_program_posts('91600000-0000-4000-8000-000000000002','kyaa-wave-fanpage','unknown')$q$,'FAN_WEB_NOT_FOUND');
 perform pg_temp.expect_error($q$select public.read_fan_program_posts('91600000-0000-4000-8000-000000000002','kyaa-wave-fanpage','live-insight',now(),null)$q$,'FAN_WEB_INVALID_INPUT');
 perform pg_temp.expect_error($q$select public.save_fan_program_post(null,'kyaa-wave-fanpage','live-insight','guest','public','{}',extensions.gen_random_uuid())$q$,'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
 perform public.save_fan_program_post('91600000-0000-4000-8000-000000000003','kyaa-wave-fanpage','live-insight','inactive','public','{}',general_key);
 update public.app_users set status='disabled' where id='91600000-0000-4000-8000-000000000003';
 perform pg_temp.expect_error(format('select public.save_fan_program_post(%L,%L,%L,%L,%L,%L,%L)','91600000-0000-4000-8000-000000000003','kyaa-wave-fanpage','live-insight','inactive','public','{}',general_key),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
 -- Hidden comments and replies cannot earn a stamp for a fresh participant.
 insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key,removed_at)
 values('91600000-0000-4000-8000-000000000023',other_user,'removed parent',extensions.gen_random_uuid(),clock_timestamp()) returning id into comment_id;
 insert into public.celebrity_notice_comments(notice_id,parent_id,app_user_id,body,idempotency_key)
 values('91600000-0000-4000-8000-000000000023',comment_id,'91600000-0000-4000-8000-000000000005','hidden-parent reply',extensions.gen_random_uuid());
 assert not exists(select 1 from public.fan_program_stamps where app_user_id='91600000-0000-4000-8000-000000000005'),'hidden parent must not earn';
 delete from public.kyaa_wave_participants where app_user_id='91600000-0000-4000-8000-000000000005';
 insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key)
 values('91600000-0000-4000-8000-000000000023','91600000-0000-4000-8000-000000000005','unchecked participant',extensions.gen_random_uuid());
 assert not exists(select 1 from public.fan_program_stamps where app_user_id='91600000-0000-4000-8000-000000000005'),'unchecked participant must not earn';
 perform pg_temp.expect_error($q$insert into public.fan_posts(celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,program_notice_id)
 values('91600000-0000-4000-8000-000000000011','91600000-0000-4000-8000-000000000005','wrong creator','public',extensions.gen_random_uuid(),'test','91600000-0000-4000-8000-000000000021')$q$,'FAN_WEB_NOT_FOUND');
 page:=public.read_fan_program_posts('91600000-0000-4000-8000-000000000002','kyaa-wave-fanpage','live-insight',null,null,1);
 assert jsonb_array_length(page->'items')=1 and (page->>'hasMore')::boolean,'SQL filtered pagination';
 page:=public.read_fan_program_posts('91600000-0000-4000-8000-000000000002','kyaa-wave-fanpage','live-insight',(page->'items'->0->>'createdAt')::timestamptz,(page->'items'->0->>'id')::uuid,1);
 assert jsonb_array_length(page->'items')=1 and not (page->>'hasMore')::boolean,'cursor next page';
 assert not has_table_privilege('service_role','public.fan_program_stamps','SELECT'),'ledger has no raw service read';
 assert not has_function_privilege('authenticated','public.read_owned_fan_program_stamps(uuid,text)','EXECUTE'),'clients cannot spoof owner';
 assert (select count(*) from public.blockchain_jobs)=jobs,'isolated stamps must not mint';
end $$;
-- Avoid deferred publication checks requiring unrelated production localization fixtures.
rollback;
\echo 'Wave program SQL assertions passed'
