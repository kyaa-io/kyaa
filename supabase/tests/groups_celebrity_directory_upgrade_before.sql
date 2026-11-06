-- A creator published before the directory followed publication: no page, one passport holder, one disabled holder.
begin;
insert into public.app_users(id,privy_user_id,verified_email,status) values
 ('fa210000-0000-4000-8000-000000000001','did:privy:dirsync-up-1','dirsync-up-1@example.test','active'),
 ('fa210000-0000-4000-8000-000000000002','did:privy:dirsync-up-2','dirsync-up-2@example.test','active');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
 ('fa200000-0000-4000-8000-000000000001','dirsync-up-fan','published','/images/dirsync-up.jpg',now(),'{artist}','idol'),
 ('fa200000-0000-4000-8000-000000000002','dirsync-up-hidden','published','/images/dirsync-up.jpg',now(),'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
 ('fa200000-0000-4000-8000-000000000001','ko','업그레이드','업그레이드 소개','업그레이드 사진'),
 ('fa200000-0000-4000-8000-000000000001','en','Upgrade','About upgrade','Upgrade photo'),
 ('fa200000-0000-4000-8000-000000000002','ko','숨김','숨김 소개','숨김 사진'),
 ('fa200000-0000-4000-8000-000000000002','en','Hidden','About hidden','Hidden photo');
insert into public.group_pages(id,kind,celebrity_id,name,status) values('fa220000-0000-4000-8000-000000000002','fan','fa200000-0000-4000-8000-000000000002','Operator name','hidden');
-- Only the membership mapping is under test, so the quiz and mint rules do not run for this fixture.
set local session_replication_role=replica;
insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at) values('fa230000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001',1,'published',now());
insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at) values
 ('fa240000-0000-4000-8000-000000000001','fa210000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa230000-0000-4000-8000-000000000001',1,'fa240000-0000-4000-8000-000000000011','passed',3,now()),
 ('fa240000-0000-4000-8000-000000000002','fa210000-0000-4000-8000-000000000002','fa200000-0000-4000-8000-000000000001','fa230000-0000-4000-8000-000000000001',1,'fa240000-0000-4000-8000-000000000012','passed',3,now());
insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id) values
 ('fa250000-0000-4000-8000-000000000001','fa210000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa240000-0000-4000-8000-000000000001'),
 ('fa250000-0000-4000-8000-000000000002','fa210000-0000-4000-8000-000000000002','fa200000-0000-4000-8000-000000000001','fa240000-0000-4000-8000-000000000002');
insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values
 ('fa270000-0000-4000-8000-000000000001','passport','fa260000-0000-4000-8000-000000000001','byus:passport:v1:fa210000-0000-4000-8000-000000000001:dirsync-up-fan',1,jsonb_build_object('recipient','0xf100000000000000000000000000000000000001','celebritySlug','dirsync-up-fan','passportId','0x'||repeat('1',64))),
 ('fa270000-0000-4000-8000-000000000002','passport','fa260000-0000-4000-8000-000000000002','byus:passport:v1:fa210000-0000-4000-8000-000000000002:dirsync-up-fan',1,jsonb_build_object('recipient','0xf100000000000000000000000000000000000002','celebritySlug','dirsync-up-fan','passportId','0x'||repeat('2',64)));
insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values
 ('fa260000-0000-4000-8000-000000000001','fa210000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa250000-0000-4000-8000-000000000001','fa270000-0000-4000-8000-000000000001'),
 ('fa260000-0000-4000-8000-000000000002','fa210000-0000-4000-8000-000000000002','fa200000-0000-4000-8000-000000000001','fa250000-0000-4000-8000-000000000002','fa270000-0000-4000-8000-000000000002');
set local session_replication_role=origin;
commit;
update public.app_users set status='disabled' where id='fa210000-0000-4000-8000-000000000002';
do $$ begin
 if exists(select 1 from public.group_pages where celebrity_id='fa200000-0000-4000-8000-000000000001') then raise exception 'upgrade fixture already has a page'; end if;
end $$;
