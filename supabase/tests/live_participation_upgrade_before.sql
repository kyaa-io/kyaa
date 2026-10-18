do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
-- Run with psql -v ON_ERROR_STOP=1. All fixtures are rolled back.
begin;

insert into public.app_users(id,privy_user_id,verified_email,status) values
('ad000000-0000-4000-8000-000000000001','did:privy:upgrade-owner','upgrade-owner@byus.test','active'),
('ad000000-0000-4000-8000-000000000002','did:privy:upgrade-other','upgrade-other@byus.test','active'),
('ad000000-0000-4000-8000-000000000003','did:privy:upgrade-admin','upgrade-admin@byus.test','active');
insert into public.admin_allowlist(id,email,role,active) values
('ad000000-0000-4000-8000-000000000010','upgrade-admin@byus.test','admin',true);
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
('ad100000-0000-4000-8000-000000000001','upgrade-certification-contract','draft','/upgrade-certification-contract.webp',null,'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
('ad100000-0000-4000-8000-000000000001','ko','인증 테스트','인증 테스트','인증 테스트'),
('ad100000-0000-4000-8000-000000000001','en','Certification Test','Certification Test','Certification Test');
insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at) values
('ad200000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001',1,'draft',null);
insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at) values
('ad200000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001','ad200000-0000-4000-8000-000000000001',1,'ad200000-0000-4000-8000-000000000003','passed',3,now());
insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id) values
('ad200000-0000-4000-8000-000000000004','ad000000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001','ad200000-0000-4000-8000-000000000002');
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)values('ad000000-0000-4000-8000-000000000001',91342,'0xad00000000000000000000000000000000000001','privy','embedded');
insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)values('ad200000-0000-4000-8000-000000000006','passport','ad200000-0000-4000-8000-000000000005','byus:passport:v1:ad000000-0000-4000-8000-000000000001:upgrade-certification-contract',1,jsonb_build_object('recipient','0xad00000000000000000000000000000000000001','celebritySlug','upgrade-certification-contract','passportId','0x'||repeat('c',64)));
insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values
('ad200000-0000-4000-8000-000000000005','ad000000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001','ad200000-0000-4000-8000-000000000004','ad200000-0000-4000-8000-000000000006');


update public.celebrities set status='published',published_at=now()where id='ad100000-0000-4000-8000-000000000001';
create table public.live_participation_upgrade_snapshot(owner_id uuid,source_id uuid,ticket_balance bigint);
do $$declare r jsonb;mission uuid;source uuid;upload uuid:='ad300000-0000-4000-8000-000000000001';begin
 r:=public.save_admin_certification_mission('ad000000-0000-4000-8000-000000000003','ad000000-0000-4000-8000-000000000010',extensions.gen_random_uuid(),null::uuid,'ad100000-0000-4000-8000-000000000001','upgrade-legacy-cert',null::bigint,'기타','기존 인증','Existing proof','설명','Description','원본 확인','Check original',now()-interval'1 day',now()+interval'1 day',3::smallint,2::bigint);
 mission:=(r->>'id')::uuid;perform public.set_admin_certification_mission_status('ad000000-0000-4000-8000-000000000003','ad000000-0000-4000-8000-000000000010',extensions.gen_random_uuid(),mission,1,'active');
 perform public.register_owned_certification_upload('ad000000-0000-4000-8000-000000000001',mission,upload,'ad000000-0000-4000-8000-000000000001/'||mission||'/'||upload||'.webp',100,10,10,repeat('d',64));
 r:=public.submit_owned_certification('ad000000-0000-4000-8000-000000000001',mission,extensions.gen_random_uuid(),jsonb_build_array(upload),'기존 제출',null);source:=(r->>'id')::uuid;
 perform public.review_admin_certification_submission('ad000000-0000-4000-8000-000000000003','ad000000-0000-4000-8000-000000000010',extensions.gen_random_uuid(),source,extensions.gen_random_uuid(),1,'approve',null);
 insert into public.live_participation_upgrade_snapshot values('ad000000-0000-4000-8000-000000000001',source,public.get_fan_ticket_balance('ad000000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001'));
end $$;
commit;
