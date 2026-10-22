-- Included before the first rollback in kyaa_wave_mission_stamps.sql; never reads /missions.
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required'; end if; end $$;
create function pg_temp.flush_wave_evidence() returns void language plpgsql as $$
declare points bigint; tickets bigint;
begin
 select count(*) into points from public.fan_score_ledger;
 select count(*) into tickets from public.fan_ticket_ledger;
 set constraints wave_mission_evidence_fan_posts, wave_mission_evidence_fan_clips,
  wave_mission_evidence_content_assets, wave_mission_evidence_mobile_media_assets,
  wave_mission_evidence_social_friendships, wave_mission_evidence_social_dm_messages,
  wave_mission_evidence_social_dm_conversations, wave_mission_evidence_fan_lounge_messages,
  wave_mission_evidence_celebrity_notice_comments, wave_mission_evidence_fan_post_comments immediate;
 set constraints wave_mission_evidence_fan_posts, wave_mission_evidence_fan_clips,
  wave_mission_evidence_content_assets, wave_mission_evidence_mobile_media_assets,
  wave_mission_evidence_social_friendships, wave_mission_evidence_social_dm_messages,
  wave_mission_evidence_social_dm_conversations, wave_mission_evidence_fan_lounge_messages,
  wave_mission_evidence_celebrity_notice_comments, wave_mission_evidence_fan_post_comments deferred;
 assert (select count(*) from public.fan_score_ledger)=points,'reconciliation adds no points beyond the action';
 assert (select count(*) from public.fan_ticket_ledger)=tickets,'reconciliation adds no tickets beyond the action';
end $$;
create function pg_temp.assert_wave_auto_stamp(owner uuid, mission text) returns void language plpgsql as $$
begin
 assert (select count(*) from public.kyaa_wave_mission_completions where app_user_id=owner and mission_key=mission)=1,'one durable mission proof: '||mission;
 assert (select count(*) from public.kyaa_wave_mission_completions c
  join public.community_stamps s on s.source_key='wave-mission:'||c.id::text and s.app_user_id=c.app_user_id and s.kind='wave_mission'
  join public.fan_action_outbox o on o.id=s.fan_action_outbox_id
  where c.app_user_id=owner and c.mission_key=mission and (o.source_snapshot->>'actionCode')::integer=4)=1,'one native stamp/outbox: '||mission;
end $$;
insert into public.app_users(id,privy_user_id,verified_email)
select ('91d00000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'did:privy:mission-auto-'||i,'mission-auto-'||i||'@example.test' from generate_series(8,15)i;
-- Model checkin from an earlier request; post RPCs use transaction-start now().
insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint,created_at)
select ('91d00000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture',md5('mission-auto:'||i)||md5('mission-auto:'||i),now()-interval '1 second' from generate_series(8,14)i;
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
select ('91d00000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,91342,'0x'||lpad(i::text,40,'0'),'privy','embedded' from generate_series(8,15)i;
insert into public.celebrity_notices(celebrity_id,slug,publication_status,published_at,ever_published_at)
select '91d00000-0000-4000-8000-000000000090',slug,'published',clock_timestamp(),clock_timestamp() from unnest(array['live-insight','wave-home-cheer'])slug;
insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json)
select n.id,locale,'Autosync fixture','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Fixture"}]}]}'::jsonb
from public.celebrity_notices n cross join unnest(array['ko','en']::public.content_locale[])locale
where n.celebrity_id='91d00000-0000-4000-8000-000000000090' and n.slug in('live-insight','wave-home-cheer');
do $$
declare a uuid:='91d00000-0000-4000-8000-000000000008'; b uuid:='91d00000-0000-4000-8000-000000000009';
 photo_owner uuid:='91d00000-0000-4000-8000-000000000010'; comment_owner uuid:='91d00000-0000-4000-8000-000000000011';
 mobile_owner uuid:='91d00000-0000-4000-8000-000000000012'; renewed_owner uuid:='91d00000-0000-4000-8000-000000000013';
 disabled_owner uuid:='91d00000-0000-4000-8000-000000000014'; outsider uuid:='91d00000-0000-4000-8000-000000000015';
 creator uuid:='91d00000-0000-4000-8000-000000000090'; result jsonb; asset uuid:=extensions.gen_random_uuid(); post_id uuid; friendship uuid;
 key uuid:=extensions.gen_random_uuid(); reaction uuid:=extensions.gen_random_uuid(); job uuid:=extensions.gen_random_uuid(); first_count bigint;
begin
 assert not has_function_privilege('service_role','public.reconcile_owned_kyaa_wave_missions(uuid)','EXECUTE'),'reconciliation stays private';
 assert not has_function_privilege('authenticated','public.reconcile_owned_kyaa_wave_missions(uuid)','EXECUTE');
 assert not has_function_privilege('anon','public.reconcile_wave_mission_evidence()','EXECUTE');
 -- save_fan_program_post first inserts a generic post and then binds its program.
 result:=public.save_fan_program_post(a,'kyaa-wave-fanpage','live-insight','Session review','public','{}',key);
 post_id:=(result->>'id')::uuid;
 perform pg_temp.flush_wave_evidence();
 perform pg_temp.assert_wave_auto_stamp(a,'insight-review');
 assert not exists(select 1 from public.kyaa_wave_mission_completions where app_user_id=a and mission_key='introduction'),'intermediate generic INSERT must not earn introduction';
 perform public.save_fan_program_post(a,'kyaa-wave-fanpage','live-insight','Session review','public','{}',key);
 perform pg_temp.flush_wave_evidence();
 perform pg_temp.assert_wave_auto_stamp(a,'insight-review');
 perform public.save_fan_post(a,'kyaa-wave-fanpage',null,'Hello WAVE','public','{}',null,extensions.gen_random_uuid());
 perform pg_temp.flush_wave_evidence();
 perform pg_temp.assert_wave_auto_stamp(a,'introduction');

 insert into public.content_assets(id,app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,uploaded_at)
 values(asset,photo_owner,creator,'wave-autosync/'||asset,100,20,20,repeat('a',64),clock_timestamp());
 perform pg_temp.flush_wave_evidence();
 assert not exists(select 1 from public.kyaa_wave_mission_completions where app_user_id=photo_owner and mission_key='event-photo'),'unattached web image does not count';
 perform public.save_fan_post(photo_owner,'kyaa-wave-fanpage',null,'Event image','public',array[asset],null,extensions.gen_random_uuid());
 perform pg_temp.flush_wave_evidence();
 perform pg_temp.assert_wave_auto_stamp(photo_owner,'event-photo');

 result:=public.reserve_owned_mobile_media(mobile_owner,'video','wave_album','video/mp4',100,extensions.gen_random_uuid());asset:=(result->>'assetId')::uuid;
 update public.mobile_media_assets set state='ready',actual_byte_size=100,width=20,height=10,duration_seconds=1 where id=asset;
 perform public.create_kyaa_wave_album(mobile_owner,'kyaa-wave-fanpage','Event video','public',array[asset],extensions.gen_random_uuid());
 perform pg_temp.flush_wave_evidence();
 assert not exists(select 1 from public.kyaa_wave_mission_completions where app_user_id=mobile_owner and mission_key='event-photo'),'video album does not count as photo';
 result:=public.reserve_owned_mobile_media(mobile_owner,'image','wave_album','image/jpeg',100,extensions.gen_random_uuid());asset:=(result->>'assetId')::uuid;
 update public.mobile_media_assets set state='ready',actual_byte_size=100,width=20,height=10 where id=asset;
 perform pg_temp.flush_wave_evidence();
 assert not exists(select 1 from public.kyaa_wave_mission_completions where app_user_id=mobile_owner and mission_key='event-photo'),'ready unattached mobile image does not count';
 result:=public.create_kyaa_wave_album(mobile_owner,'kyaa-wave-fanpage','Event image','public',array[asset],extensions.gen_random_uuid());
 perform pg_temp.flush_wave_evidence();
 perform pg_temp.assert_wave_auto_stamp(mobile_owner,'event-photo');
 update public.mobile_media_assets set cleanup_requested_at=clock_timestamp() where id=asset;
 perform pg_temp.flush_wave_evidence();
 perform pg_temp.assert_wave_auto_stamp(mobile_owner,'event-photo');

 result:=public.request_kyaa_wave_friend(a,b,extensions.gen_random_uuid());friendship:=(result->>'id')::uuid;
 perform pg_temp.flush_wave_evidence();
 assert not exists(select 1 from public.kyaa_wave_mission_completions where app_user_id in(a,b) and mission_key='friendship'),'pending friend request does not count';
 perform public.resolve_kyaa_wave_friend(b,friendship,'accept',extensions.gen_random_uuid());
 perform pg_temp.flush_wave_evidence();
 perform pg_temp.assert_wave_auto_stamp(a,'friendship');
 perform pg_temp.assert_wave_auto_stamp(b,'friendship');
 key:=extensions.gen_random_uuid();
 perform public.send_kyaa_wave_friend_message(a,b,'Hello friend',key);
 perform pg_temp.flush_wave_evidence();
 perform pg_temp.assert_wave_auto_stamp(a,'dm-greeting');
 assert not exists(select 1 from public.kyaa_wave_mission_completions where app_user_id=b and mission_key='dm-greeting'),'incoming DM does not count';
 perform public.send_kyaa_wave_friend_message(a,b,'Hello friend',key);
 perform pg_temp.flush_wave_evidence();
 perform pg_temp.assert_wave_auto_stamp(a,'dm-greeting');
 -- A fresh owner sends its first greeting only after its conversation has been cancelled and renewed.
 result:=public.request_kyaa_wave_friend(renewed_owner,b,extensions.gen_random_uuid());friendship:=(result->>'id')::uuid;
 perform public.resolve_kyaa_wave_friend(b,friendship,'accept',extensions.gen_random_uuid());
 perform public.send_kyaa_wave_friend_message(b,renewed_owner,'Incoming first greeting',extensions.gen_random_uuid());
 perform public.resolve_kyaa_wave_friend(b,friendship,'unfriend',extensions.gen_random_uuid());
 perform pg_temp.flush_wave_evidence();
 assert not exists(select 1 from public.kyaa_wave_mission_completions where app_user_id=renewed_owner and mission_key='dm-greeting');
 result:=public.request_kyaa_wave_friend(renewed_owner,b,extensions.gen_random_uuid());friendship:=(result->>'id')::uuid;
 perform public.resolve_kyaa_wave_friend(b,friendship,'accept',extensions.gen_random_uuid());
 perform public.send_kyaa_wave_friend_message(renewed_owner,b,'Renewed greeting',extensions.gen_random_uuid());
 perform pg_temp.flush_wave_evidence();
 perform pg_temp.assert_wave_auto_stamp(renewed_owner,'dm-greeting');

 perform public.post_celebrity_lounge_message(a,'kyaa-wave-fanpage','Go WAVE!',extensions.gen_random_uuid(),null,'en');
 perform pg_temp.flush_wave_evidence();
 perform pg_temp.assert_wave_auto_stamp(a,'live-cheer');
 perform public.post_fan_post_comment(comment_owner,post_id,null,'Session discussion',extensions.gen_random_uuid());
 perform pg_temp.flush_wave_evidence();
 perform pg_temp.assert_wave_auto_stamp(comment_owner,'insight-review');
 perform public.post_celebrity_notice_comment(b,'kyaa-wave-fanpage','live-insight','Session comment',extensions.gen_random_uuid());
 perform pg_temp.flush_wave_evidence();
 perform pg_temp.assert_wave_auto_stamp(b,'insight-review');
 perform public.post_celebrity_notice_comment(a,'kyaa-wave-fanpage','wave-home-cheer','Website cheer',extensions.gen_random_uuid());
 perform pg_temp.flush_wave_evidence();
 perform pg_temp.assert_wave_auto_stamp(a,'website-cheer');

 -- Auto reconciliation must preserve the existing reaction canary restriction.
 insert into public.fan_action_producer_routes(action_code,binding_id,enabled,policy_version,enabled_at)
 select 6,binding_id,true,1,clock_timestamp() from public.fan_action_producer_routes where action_code=4;
 insert into public.fan_action_canary_scope(action_code,app_user_id) values(6,b);
 perform pg_temp.wave_stamp_error(format('select public.react_to_creator(%L,%L,%L,%L,%L)',a,creator,reaction,job,'0x'||repeat('c',64)),'FAN_ACTION_ROUTE_REQUIRED');
 assert not exists(select 1 from public.fan_reactions where id=reaction),'reaction outside canary cannot issue';
 insert into public.fan_action_canary_scope(action_code,app_user_id) values(6,a);
 perform public.react_to_creator(a,creator,reaction,job,'0x'||repeat('c',64));
 assert exists(select 1 from public.fan_reactions where id=reaction and fan_action_outbox_id is not null),'allowed reaction keeps native routing';
 perform pg_temp.assert_wave_auto_stamp(a,'fanpage-like');
 select count(*) into first_count from public.fan_score_ledger;
 perform public.react_to_creator(a,creator,reaction,job,'0x'||repeat('c',64));
 perform pg_temp.flush_wave_evidence();
 perform pg_temp.assert_wave_auto_stamp(a,'fanpage-like');
 assert (select count(*) from public.fan_score_ledger)=first_count,'reaction replay adds no points';

 -- Invalid final evidence, inactive owners and missing receipts cannot issue mission stamps.
 insert into public.fan_posts(celebrity_id,app_user_id,body,idempotency_key,create_request_hash)
 values(creator,disabled_owner,'Disabled fixture',extensions.gen_random_uuid(),'fixture'),
 (creator,outsider,'No receipt fixture',extensions.gen_random_uuid(),'fixture');
 update public.app_users set status='disabled' where id=disabled_owner;
 insert into public.fan_posts(celebrity_id,app_user_id,body,idempotency_key,create_request_hash,hidden_at)
 values(creator,comment_owner,'Hidden fixture',extensions.gen_random_uuid(),'fixture',clock_timestamp());
 perform pg_temp.flush_wave_evidence();
 assert not exists(select 1 from public.kyaa_wave_mission_completions where app_user_id in(disabled_owner,outsider) and mission_key='introduction');
 assert not exists(select 1 from public.kyaa_wave_mission_completions where app_user_id=comment_owner and mission_key='introduction'),'hidden final evidence cannot issue';
end $$;
