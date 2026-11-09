\set ON_ERROR_STOP on
-- Runs just before 20261220040000 in a clean replay. Rows that exist when B6 ships: a declined (rejected) request, a request
-- ended by a block, one whose block was lifted, saved message settings, kyaa wave friends with a sanctioned one, and a greeting.
do $$
declare a uuid:='b6c00000-0000-4000-8000-000000000001';s uuid:='b6c00000-0000-4000-8000-000000000002';gone uuid:='b6c00000-0000-4000-8000-000000000003';
 w uuid:='b6c00000-0000-4000-8000-000000000004';ws uuid:='b6c00000-0000-4000-8000-000000000005';b uuid:='b6c00000-0000-4000-8000-000000000006';
 x uuid:='b6c00000-0000-4000-8000-000000000007';y uuid:='b6c00000-0000-4000-8000-000000000008';wave uuid:='b6c00000-0000-4000-8000-0000000000a0';
 pub uuid:='b6c00000-0000-4000-8000-0000000000a1';u uuid;r jsonb;
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(wave,'kyaa-wave-fanpage','published','/wave.webp',now(),'{brand}','brand');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(wave,'ko','WAVE','소개','사진'),(wave,'en','WAVE','Summary','Photo');
 insert into public.group_pages(id,kind,name)values(pub,'hobby','B6 upgrade page');
 foreach u in array array[a,s,gone,w,ws,b,x,y] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:b6c-'||u,u||'@example.test');
  insert into public.group_memberships(page_id,app_user_id)values(pub,u);
 end loop;
 foreach u in array array[a,w,ws] loop
  insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint)values(u,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture',md5('b6c:'||u)||md5('b6c:'||u));
 end loop;
 insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash,accepted_at)values(a,w,wave,'accepted',extensions.gen_random_uuid(),'b6c',now()-interval '2 hours');
 insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash)values(ws,a,wave,'pending',extensions.gen_random_uuid(),'b6c');
 insert into public.social_profile_settings(app_user_id,dm_policy)values(x,'friends'),(y,'none'),(b,'requests');
 -- Declined by the recipient (old 'rejected'), ended by a block, block lifted.
 insert into public.social_dm_conversations(id,user_low_id,user_high_id,requester_id,status,request_id,payload_hash,updated_at,retry_at)values
  ('b6c00000-0000-4000-8000-0000000000c1',least(a,b),greatest(a,b),a,'rejected',extensions.gen_random_uuid(),'b6c',now()-interval '1 hour',now()+interval '23 hours'),
  ('b6c00000-0000-4000-8000-0000000000c2',least(a,x),greatest(a,x),a,'rejected',extensions.gen_random_uuid(),'b6c',now()-interval '1 hour',now()+interval '23 hours'),
  ('b6c00000-0000-4000-8000-0000000000c3',least(a,y),greatest(a,y),y,'rejected',extensions.gen_random_uuid(),'b6c',now()-interval '1 hour',now()+interval '23 hours');
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(x,a);
 -- A greeting in the wave chat.
 perform public.send_kyaa_wave_friend_message(a,w,'wave hello',extensions.gen_random_uuid());
 set local session_replication_role=replica;
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)values(s,extensions.gen_random_uuid(),'B6 업그레이드 시험 제재입니다',extensions.gen_random_uuid()),
  (ws,extensions.gen_random_uuid(),'B6 업그레이드 시험 제재입니다',extensions.gen_random_uuid());
 set local session_replication_role=origin;
 insert into public.account_deletion_requests(app_user_id,provider_subject)values(gone,'did:privy:b6c-gone');
 update public.app_users set status='disabled' where id=gone;
end $$;
create table public.b6_upgrade_probe(phase text not null,call text not null,answer text,primary key(phase,call));
set b6.phase='before';
\ir b6_dm_request_privacy_upgrade_probe.sql
