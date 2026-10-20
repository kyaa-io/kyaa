-- Synthetic fixtures roll back; use only the disposable local assertion database.
do $$ begin
 if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required'; end if;
end $$;
begin;
create function pg_temp.mission_status(owner_id uuid,mission_key text) returns text language sql as $$
 select item->>'status' from jsonb_array_elements(public.read_owned_kyaa_wave_missions(owner_id)->'progress') item where item->>'key'=mission_key;
$$;
insert into public.app_users(id,privy_user_id,verified_email)
select ('91700000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'did:privy:wave-mission-'||i,'wave-mission-'||i||'@example.test' from generate_series(1,3) i;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
values('91700000-0000-4000-8000-000000000010','kyaa-wave-fanpage','published','/wave-test.webp',clock_timestamp(),'{brand}','brand'),
 ('91700000-0000-4000-8000-000000000011','wave-mission-other','published','/wave-test.webp',clock_timestamp(),'{brand}','brand');
insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,ever_published_at)
values('91700000-0000-4000-8000-000000000020','91700000-0000-4000-8000-000000000010','live-insight','published',clock_timestamp(),clock_timestamp());
do $$
declare owner uuid:='91700000-0000-4000-8000-000000000001'; friend uuid:='91700000-0000-4000-8000-000000000002';
 wave uuid:='91700000-0000-4000-8000-000000000010'; other_wave uuid:='91700000-0000-4000-8000-000000000011';
 notice uuid:='91700000-0000-4000-8000-000000000020'; receipt_at timestamptz:='2026-10-22T00:00:00Z';
 post_id uuid; friendship_id uuid; conversation_id uuid; message_id uuid; comment_id uuid;
 reaction_id uuid:=extensions.gen_random_uuid(); job_id uuid:=extensions.gen_random_uuid(); result jsonb; jobs bigint; stamps bigint;
begin
 assert not has_function_privilege('anon','public.read_owned_kyaa_wave_missions(uuid)','EXECUTE'),'anon cannot supply owner';
 assert not has_function_privilege('authenticated','public.read_owned_kyaa_wave_missions(uuid)','EXECUTE'),'client cannot supply owner';
 assert has_function_privilege('service_role','public.read_owned_kyaa_wave_missions(uuid)','EXECUTE'),'server RPC grant';
 assert not has_table_privilege('service_role','public.kyaa_wave_participants','SELECT'),'receipt remains private';
 begin perform public.read_owned_kyaa_wave_missions(owner); raise exception 'missing receipt accepted';
 exception when others then if sqlerrm<>'FAN_WEB_FORBIDDEN' then raise; end if; end;
 begin perform public.read_owned_kyaa_wave_missions(null); raise exception 'null owner accepted';
 exception when others then if sqlerrm<>'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED' then raise; end if; end;
 insert into public.kyaa_wave_participants(app_user_id,name_encrypted,created_at)
 values(owner,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.'||repeat('c',24),receipt_at);
 result:=public.read_owned_kyaa_wave_missions(owner);
 assert jsonb_array_length(result->'progress')=10,'START and nine missions';
 assert pg_temp.mission_status(owner,'checkin')='completed','receipt is checkin';
 assert (select count(*) from jsonb_array_elements(result->'progress') item where item->>'status'='pending')=9,'missing evidence pending';
 assert (select count(*) from jsonb_array_elements(result->'progress') item where item->>'status'='unverified')=0,'all mission evidence supported';
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
 values(owner,91342,'0x1111111111111111111111111111111111111111','privy','embedded');
 insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
 values(job_id,'reaction',reaction_id,'byus:reaction:v1:'||reaction_id,1,jsonb_build_object('recipient','0x1111111111111111111111111111111111111111','celebritySlug','kyaa-wave-fanpage','issuanceId','0x'||repeat('a',64),'reactionType','FirstReaction'));
 insert into public.fan_reactions(id,app_user_id,celebrity_id,blockchain_job_id) values(reaction_id,owner,wave,job_id);
 assert pg_temp.mission_status(owner,'fanpage-like')='completed','own Wave reaction counts';
 insert into public.fan_posts(app_user_id,celebrity_id,body,visibility,idempotency_key,create_request_hash,created_at)
 values(owner,wave,'Introduction','public',extensions.gen_random_uuid(),'test',receipt_at-interval '1 second') returning id into post_id;
 assert pg_temp.mission_status(owner,'introduction')='pending','pre-receipt post excluded';
 update public.fan_posts set created_at=receipt_at+interval '1 second',visibility='members' where id=post_id;
 assert pg_temp.mission_status(owner,'introduction')='pending','member post excluded';
 update public.fan_posts set visibility='public',hidden_at=receipt_at where id=post_id;
 assert pg_temp.mission_status(owner,'introduction')='pending','hidden post excluded';
 update public.fan_posts set hidden_at=null,celebrity_id=other_wave where id=post_id;
 assert pg_temp.mission_status(owner,'introduction')='pending','other creator post excluded';
 update public.fan_posts set celebrity_id=wave where id=post_id;
 assert pg_temp.mission_status(owner,'introduction')='completed','event introduction counts';
 assert pg_temp.mission_status(owner,'name-tag') is null,'name-tag mission removed';
 assert pg_temp.mission_status(owner,'event-photo')='pending','text alone does not count';
 insert into public.content_assets(app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,post_id)
 values(owner,wave,'wave-mission-test/photo.webp',100,20,20,repeat('a',64),post_id);
 assert pg_temp.mission_status(owner,'event-photo')='pending','unfinished upload excluded';
 update public.content_assets set uploaded_at=receipt_at where storage_path='wave-mission-test/photo.webp';
 assert pg_temp.mission_status(owner,'event-photo')='completed','photo in media feed completes mission';
 update public.fan_posts set hidden_at=receipt_at where id=post_id;
 assert pg_temp.mission_status(owner,'event-photo')='pending','hidden photo excluded';
 update public.fan_posts set hidden_at=null,created_at=receipt_at-interval '1 second' where id=post_id;
 assert pg_temp.mission_status(owner,'event-photo')='pending','pre-checkin photo excluded';
 update public.fan_posts set created_at=receipt_at+interval '1 second' where id=post_id;
 update public.content_assets set deleted_at=receipt_at where storage_path='wave-mission-test/photo.webp';
 assert pg_temp.mission_status(owner,'event-photo')='pending','deleted photo excluded';

 insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash,accepted_at)
 values(owner,friend,other_wave,'accepted',extensions.gen_random_uuid(),'test',receipt_at+interval '1 second') returning id into friendship_id;
 assert pg_temp.mission_status(owner,'friendship')='pending','other creator friendship excluded';
 update public.social_friendships set celebrity_id=wave,accepted_at=receipt_at-interval '1 second' where id=friendship_id;
 assert pg_temp.mission_status(owner,'friendship')='pending','pre-receipt friendship excluded';
 update public.social_friendships set accepted_at=receipt_at+interval '1 second' where id=friendship_id;
 assert pg_temp.mission_status(owner,'friendship')='completed','accepted event friendship counts';
 insert into public.social_dm_conversations(user_low_id,user_high_id,requester_id,status,request_id,payload_hash)
 values(least(owner,friend),greatest(owner,friend),owner,'accepted',extensions.gen_random_uuid(),'test') returning id into conversation_id;
 insert into public.social_dm_messages(conversation_id,sender_id,body,request_id,payload_hash,created_at)
 values(conversation_id,friend,'Private incoming greeting',extensions.gen_random_uuid(),'test',receipt_at+interval '2 seconds') returning id into message_id;
 assert pg_temp.mission_status(owner,'dm-greeting')='pending','incoming DM excluded';
 update public.social_dm_messages set sender_id=owner,created_at=receipt_at-interval '1 second' where id=message_id;
 assert pg_temp.mission_status(owner,'dm-greeting')='pending','pre-receipt DM excluded';
 update public.social_dm_messages set created_at=receipt_at+interval '2 seconds' where id=message_id;
 assert pg_temp.mission_status(owner,'dm-greeting')='completed','own DM to accepted event friend counts';
 update public.social_friendships set status='unfriended' where id=friendship_id;
 assert pg_temp.mission_status(owner,'dm-greeting')='pending','unfriended pair excluded';
 update public.social_friendships set status='accepted' where id=friendship_id;
 insert into public.social_dm_message_deletions(message_id,app_user_id) values(message_id,owner);
 assert pg_temp.mission_status(owner,'dm-greeting')='pending','deleted DM excluded';
 insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key,created_at)
 values(notice,owner,'Session review',extensions.gen_random_uuid(),receipt_at-interval '1 second') returning id into comment_id;
 assert pg_temp.mission_status(owner,'insight-review')='pending','pre-receipt review excluded';
 update public.celebrity_notice_comments set created_at=receipt_at+interval '1 second' where id=comment_id;
 assert pg_temp.mission_status(owner,'insight-review')='completed','own session review counts';
 update public.celebrity_notice_comments set removed_at=receipt_at where id=comment_id;
 assert pg_temp.mission_status(owner,'insight-review')='pending','removed review excluded';
 insert into public.fan_posts(app_user_id,celebrity_id,program_notice_id,body,visibility,idempotency_key,create_request_hash,created_at)
 values(owner,wave,notice,'Thank you for the session','public',extensions.gen_random_uuid(),'test',receipt_at+interval '1 second') returning id into post_id;
 assert pg_temp.mission_status(owner,'insight-review')='completed','dedicated session board counts';
 update public.fan_posts set hidden_at=receipt_at where id=post_id;
 assert pg_temp.mission_status(owner,'insight-review')='pending','hidden session post excluded';
 insert into public.fan_lounge_messages(app_user_id,celebrity_id,body,idempotency_key,created_at)
 values(owner,wave,'Go WAVE!',extensions.gen_random_uuid(),receipt_at-interval '1 second') returning id into message_id;
 assert pg_temp.mission_status(owner,'live-cheer')='pending','pre-checkin live cheer excluded';
 update public.fan_lounge_messages set created_at=receipt_at+interval '1 second' where id=message_id;
 assert pg_temp.mission_status(owner,'live-cheer')='completed','Wave live cheer counts';
 update public.fan_lounge_messages set removed_at=receipt_at where id=message_id;
 assert pg_temp.mission_status(owner,'live-cheer')='pending','removed live cheer excluded';
 select count(*) into jobs from public.blockchain_jobs;
 select count(*) into stamps from public.fan_program_stamps;
 result:=public.read_owned_kyaa_wave_missions(owner);
 assert result::text not like '%Private incoming greeting%' and result::text not like '%'||owner::text||'%','no private message or owner returned';
 assert (select count(*) from public.blockchain_jobs)=jobs and (select count(*) from public.fan_program_stamps)=stamps,'read never issues awards';
 begin perform public.read_owned_kyaa_wave_missions(friend); raise exception 'other owner without receipt accepted';
 exception when others then if sqlerrm<>'FAN_WEB_FORBIDDEN' then raise; end if; end;
end $$;
rollback;
\echo 'Wave mission progress SQL assertions passed'
