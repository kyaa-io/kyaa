-- Synthetic fixtures only; never run against a hosted database.
do $$ begin
 if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required'; end if;
end $$;
begin;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then if sqlerrm=expected then return; else raise; end if; end;
 raise exception 'Expected error % for %',expected,statement;
end $$;
insert into public.app_users(id,privy_user_id,verified_email)
select ('91800000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'did:privy:wave-friends-'||i,'wave-friends-'||i||'@example.test' from generate_series(1,4) i;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
values('91800000-0000-4000-8000-000000000010','kyaa-wave-fanpage','published','/wave-test.webp',now(),'{brand}','brand'),
('91800000-0000-4000-8000-000000000011','wave-friends-other','published','/wave-test.webp',now(),'{brand}','brand');
insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint)
select ('91800000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture',md5('kyaa_wave_friends:'||i::text)||md5('kyaa_wave_friends:'||i::text) from generate_series(1,3) i;
do $$
declare a uuid:='91800000-0000-4000-8000-000000000001'; b uuid:='91800000-0000-4000-8000-000000000002';
 c uuid:='91800000-0000-4000-8000-000000000003'; outsider uuid:='91800000-0000-4000-8000-000000000004';
 wave uuid:='91800000-0000-4000-8000-000000000010'; other uuid:='91800000-0000-4000-8000-000000000011';
 link jsonb; result jsonb; request_id uuid:=extensions.gen_random_uuid(); dm_request uuid:=extensions.gen_random_uuid(); later_request uuid:=extensions.gen_random_uuid();
 friendship uuid; foreign_friendship uuid; conversation uuid; message uuid; signature text;
begin
 for signature in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('assert_kyaa_wave_friend_pair','read_owned_kyaa_wave_friends','read_owned_kyaa_wave_profile_link','resolve_kyaa_wave_profile_link','request_kyaa_wave_friend','resolve_kyaa_wave_friend','assert_kyaa_wave_dm_pair','read_kyaa_wave_friend_messages','send_kyaa_wave_friend_message') loop
  assert not has_function_privilege('anon',signature,'EXECUTE') and not has_function_privilege('authenticated',signature,'EXECUTE'),'no client supplied owners';
  assert has_function_privilege('service_role',signature,'EXECUTE'),'server grant';
 end loop;
 assert not exists(select 1 from public.fan_passports where app_user_id in(a,b));
 assert not exists(select 1 from public.social_favorite_visibility where app_user_id in(a,b));
 perform pg_temp.expect_error(format('select public.read_owned_kyaa_wave_friends(%L,''ko'')',outsider),'FAN_WEB_FORBIDDEN');
 perform pg_temp.expect_error(format('select public.request_kyaa_wave_friend(%L,%L,%L)',a,outsider,extensions.gen_random_uuid()),'SOCIAL_NOT_FOUND');
 perform pg_temp.expect_error(format('select public.request_social_friend(%L,%L,''kyaa-wave-fanpage'',%L)',a,b,extensions.gen_random_uuid()),'SOCIAL_NOT_FOUND');
 link:=public.read_owned_kyaa_wave_profile_link(b);
 result:=public.resolve_kyaa_wave_profile_link(a,(link->>'token')::uuid,'en');
 assert result->'profile'->>'id'=b::text and result->'relationship'->>'status'='none' and result->>'isSelf'='false';
 assert not result::text like '%nameEncrypted%' and not result::text like '%activities%' and not result::text like '%favorite%';
 assert public.resolve_kyaa_wave_profile_link(b,(link->>'token')::uuid,'ko')->>'isSelf'='true';
 perform pg_temp.expect_error(format('select public.request_kyaa_wave_friend(%L,%L,%L)',a,a,extensions.gen_random_uuid()),'SOCIAL_CONFLICT');
 update public.social_profile_links set expires_at=now()-interval '1 second' where app_user_id=b;
 perform pg_temp.expect_error(format('select public.resolve_kyaa_wave_profile_link(%L,%L,''ko'')',a,link->>'token'),'SOCIAL_NOT_FOUND');
 assert public.read_owned_kyaa_wave_profile_link(b)->>'token'<>link->>'token','expired QR rotates';
 result:=public.request_kyaa_wave_friend(a,b,request_id); friendship:=(result->>'id')::uuid;
 assert public.request_kyaa_wave_friend(a,b,request_id)->>'id'=friendship::text;
 perform pg_temp.expect_error(format('select public.request_kyaa_wave_friend(%L,%L,%L)',a,c,request_id),'SOCIAL_IDEMPOTENCY_CONFLICT');
 assert public.read_owned_kyaa_wave_friends(b,'ko')->'friendships'->0->>'status'='incoming';
 perform pg_temp.expect_error(format('select public.send_kyaa_wave_friend_message(%L,%L,''hi'',%L)',a,b,dm_request),'SOCIAL_FORBIDDEN');
 perform pg_temp.expect_error(format('select public.resolve_kyaa_wave_friend(%L,%L,''accept'',%L)',c,friendship,extensions.gen_random_uuid()),'SOCIAL_NOT_FOUND');
 perform public.resolve_kyaa_wave_friend(b,friendship,'accept',extensions.gen_random_uuid());
 assert public.read_owned_kyaa_wave_friends(a,'en')->'friendships'->0->>'status'='friends';
 result:=public.send_kyaa_wave_friend_message(a,b,'First hello',dm_request);
 assert public.send_kyaa_wave_friend_message(a,b,'First hello',dm_request)=result,'first DM replay response';
 assert (select count(*) from public.social_dm_messages m where m.sender_id=a and m.request_id=dm_request)=1,'first DM exactly once';
 perform pg_temp.expect_error(format('select public.send_kyaa_wave_friend_message(%L,%L,''changed'',%L)',a,b,dm_request),'SOCIAL_IDEMPOTENCY_CONFLICT');
 conversation:=(result->>'id')::uuid;
 perform public.send_kyaa_wave_friend_message(b,a,'Reply',later_request);
 perform public.send_kyaa_wave_friend_message(b,a,'Reply',later_request);
 assert (select count(*) from public.social_dm_messages where conversation_id=conversation)=2;
 result:=public.read_kyaa_wave_friend_messages(a,b);
 assert jsonb_array_length(result->'messages')=2 and result->'messages'->0->>'isMine'='true' and result->'messages'->1->>'isMine'='false';
 assert public.read_kyaa_wave_friend_messages(b,a)->'messages'->1->>'isMine'='true';
 -- A renewed friendship permits messaging even when its old conversation was cancelled.
 perform public.resolve_kyaa_wave_friend(a,friendship,'unfriend',extensions.gen_random_uuid());
 assert (select status from public.social_dm_conversations where id=conversation)='cancelled';
 result:=public.request_kyaa_wave_friend(a,b,extensions.gen_random_uuid()); friendship:=(result->>'id')::uuid;
 perform public.resolve_kyaa_wave_friend(b,friendship,'accept',extensions.gen_random_uuid());
 -- Model separate request transactions while this fixture stays rolled back.
 update public.social_friendships set accepted_at=clock_timestamp() where id=friendship;
 assert exists(select 1 from jsonb_array_elements(public.evaluate_owned_kyaa_wave_missions(a)->'progress') m
  where m->>'key'='dm-greeting' and m->>'status'='pending'),'old cancelled-conversation DM is not newly accepted evidence';
 perform public.send_kyaa_wave_friend_message(a,b,'Hello again',extensions.gen_random_uuid());
 assert exists(select 1 from jsonb_array_elements(public.evaluate_owned_kyaa_wave_missions(a)->'progress') m
  where m->>'key'='dm-greeting' and m->>'status'='completed'),'renewed friendship DM counts toward mission';
 insert into public.social_dm_messages(conversation_id,sender_id,body,request_id,payload_hash,created_at)
 select conversation,a,'Fixture '||i,extensions.gen_random_uuid(),'fixture',now()+i*interval '1 second' from generate_series(1,101) i;
 result:=public.read_kyaa_wave_friend_messages(a,b);
 assert jsonb_array_length(result->'messages')=100 and result->>'hasMore'='true';
 select id into message from public.social_dm_messages where conversation_id=conversation order by created_at desc limit 1;
 insert into public.social_dm_message_deletions(message_id,app_user_id) values(message,a);
 assert not exists(select 1 from jsonb_array_elements(public.read_kyaa_wave_friend_messages(a,b)->'messages') x where x->>'id'=message::text),'owner deletion preserved';
 select id into message from public.social_dm_messages where conversation_id=conversation and id<>message order by created_at desc offset 1 limit 1;
 update public.social_dm_messages set hidden_at=now() where id=message;
 assert not exists(select 1 from jsonb_array_elements(public.read_kyaa_wave_friend_messages(a,b)->'messages') x where x->>'id'=message::text),'moderation hiding preserved';
 insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash)
 values(a,c,other,'accepted',extensions.gen_random_uuid(),'fixture') returning id into foreign_friendship;
 assert jsonb_array_length(public.read_owned_kyaa_wave_friends(a,'ko')->'friendships')=1,'creator scope';
 perform pg_temp.expect_error(format('select public.resolve_kyaa_wave_friend(%L,%L,''unfriend'',%L)',a,foreign_friendship,extensions.gen_random_uuid()),'SOCIAL_NOT_FOUND');
 perform pg_temp.expect_error(format('select public.read_kyaa_wave_friend_messages(%L,%L)',a,c),'SOCIAL_FORBIDDEN');
 insert into public.user_blocks(app_user_id,blocked_app_user_id) values(b,a);
 assert jsonb_array_length(public.read_owned_kyaa_wave_friends(a,'ko')->'friendships')=0;
 perform pg_temp.expect_error(format('select public.send_kyaa_wave_friend_message(%L,%L,''blocked'',%L)',a,b,extensions.gen_random_uuid()),'SOCIAL_BLOCKED');
 perform pg_temp.expect_error(format('select public.read_kyaa_wave_friend_messages(%L,%L)',a,b),'SOCIAL_BLOCKED');
 link:=public.read_owned_kyaa_wave_profile_link(b);
 perform pg_temp.expect_error(format('select public.resolve_kyaa_wave_profile_link(%L,%L,''ko'')',a,link->>'token'),'SOCIAL_BLOCKED');
 delete from public.user_blocks where app_user_id=b and blocked_app_user_id=a;
 delete from public.kyaa_wave_participants where app_user_id=b;
 assert jsonb_array_length(public.read_owned_kyaa_wave_friends(a,'ko')->'friendships')=0;
 perform pg_temp.expect_error(format('select public.read_kyaa_wave_friend_messages(%L,%L)',a,b),'SOCIAL_NOT_FOUND');
 perform pg_temp.expect_error(format('select public.resolve_kyaa_wave_friend(%L,%L,''unfriend'',%L)',a,friendship,extensions.gen_random_uuid()),'SOCIAL_NOT_FOUND');
 update public.app_users set status='disabled' where id=c;
 perform pg_temp.expect_error(format('select public.request_kyaa_wave_friend(%L,%L,%L)',a,c,extensions.gen_random_uuid()),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
end $$;
rollback;
\echo 'Wave friends SQL assertions passed'
