-- Run inside the existing Membership fixtures, before their rollback.
create or replace function pg_temp.expect_stamp_error(statement text, marker text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if strpos(sqlerrm,marker)>0 then return; end if;
    raise;
  end;
  raise exception 'expected failure: %',marker;
end $$;

do $$
declare s public.stamps; j public.blockchain_jobs; facts jsonb; candidate_payload jsonb; bad jsonb;
  candidate uuid; candidate_job uuid; kind text; tx text:='0x'||repeat('d',64);
begin
  select * into strict s from public.stamps where app_user_id='d1000000-0000-4000-8000-000000000001' and stamp_type='membership';
  select * into strict j from public.blockchain_jobs where id=s.blockchain_job_id;
  if j.payload->'bindingVersion' is distinct from '2'::jsonb then raise exception 'new Membership job missing numeric binding 2'; end if;
  -- Restore only this rolled-back fixture when the replacement regression withdrew approval.
  update public.certification_submissions set status='approved',rejection_reason=null where id=(select source_id from public.fan_activities where id=s.activity_id);
  perform pg_temp.expect_stamp_error(format('update public.blockchain_jobs set payload=payload-''bindingVersion'' where id=%L',j.id),'immutable');
  perform pg_temp.expect_stamp_error(format('update public.blockchain_jobs set payload=jsonb_set(payload,''{bindingVersion}'',''1'') where id=%L',j.id),'immutable');
  if j.status<>'COMPLETED' then
    update public.blockchain_jobs set status='PROCESSING',lease_owner='direct-stamp-fixture',lease_expires_at=now()+interval '1 minute' where id=j.id;
    update public.blockchain_jobs set payload=payload||jsonb_build_object('workerSubmission',jsonb_build_object('txHash',tx,'signedTransaction','0x12')),tx_hash=tx where id=j.id;
    update public.blockchain_jobs set status='COMPLETED',lease_owner=null,lease_expires_at=null,token_id=901,completed_at=clock_timestamp() where id=j.id;
  end if;
  select * into strict s from public.stamps where id=s.id;
  -- Existing replacement mappings retain precedence; use the points fixture for direct assertions.
  if not exists(select 1 from public.nft_credential_replacement_entities where entity_type='stamp' and entity_id=s.id) then
    facts:=public.effective_fan_action_mint(s.app_user_id,'stamp',s.id,'minted',s.tx_hash,s.token_id::text);
    if facts is distinct from jsonb_build_object('status','minted','txHash',s.tx_hash,'tokenId',s.token_id::text,'nftContract','0x527a70c0f7cf129650dc282b709327c5958a4ccf') then raise exception 'invalid direct projection: %',facts; end if;
    if public.effective_fan_action_mint(extensions.gen_random_uuid(),'stamp',s.id,'minted',s.tx_hash,s.token_id::text)?'nftContract'
      or public.effective_fan_action_mint(s.app_user_id,'stamp',extensions.gen_random_uuid(),'minted',s.tx_hash,s.token_id::text)?'nftContract'
      or public.effective_fan_action_mint(s.app_user_id,'stamp',s.id,'minted','0x'||repeat('e',64),s.token_id::text)?'nftContract'
      or public.effective_fan_action_mint(s.app_user_id,'stamp',s.id,'minted',s.tx_hash,'902')?'nftContract'
      or public.effective_fan_action_mint(s.app_user_id,'stamp',s.id,'queued',null,null)?'nftContract' then raise exception 'direct projection accepted mismatched facts'; end if;
    update public.certification_submissions set status='rejected',rejection_reason='Fixture withdrawal' where id=(select source_id from public.fan_activities where id=s.activity_id);
    if public.effective_fan_action_mint(s.app_user_id,'stamp',s.id,'minted',s.tx_hash,s.token_id::text)?'nftContract' then raise exception 'withdrawn membership projected direct contract'; end if;
  end if;
  foreach kind in array array['Attendance','Membership'] loop
    candidate:=extensions.gen_random_uuid(); candidate_job:=extensions.gen_random_uuid();
    candidate_payload:=(j.payload-'workerSubmission')||jsonb_build_object('stampType',kind);
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
      values(candidate_job,'stamp',candidate,'byus:stamp:v1:'||candidate,1,candidate_payload);
    perform public.assert_stamp_blockchain_job_link_v2(candidate,s.app_user_id,s.celebrity_id,lower(kind),'queued',candidate_job,null,null);
    perform pg_temp.expect_stamp_error(format('select public.assert_stamp_blockchain_job_link_v2(%L,%L,%L,%L,''queued'',%L,null,null)',candidate,extensions.gen_random_uuid(),s.celebrity_id,lower(kind),candidate_job),'not owned');
    perform pg_temp.expect_stamp_error(format('select public.assert_stamp_blockchain_job_link_v2(%L,%L,%L,''survey'',''queued'',%L,null,null)',candidate,s.app_user_id,s.celebrity_id,candidate_job),'stamp type');
    perform pg_temp.expect_stamp_error(format('select public.assert_stamp_blockchain_job_link_v2(%L,%L,%L,%L,''minted'',%L,null,null)',candidate,s.app_user_id,s.celebrity_id,lower(kind),candidate_job),'queue status');
    perform pg_temp.expect_stamp_error(format('select public.assert_stamp_blockchain_job_link_v2(%L,%L,%L,%L,''queued'',%L,%L,1)',candidate,s.app_user_id,s.celebrity_id,lower(kind),candidate_job,tx),'non-completed');
    foreach bad in array array['"2"'::jsonb,'null'::jsonb,'true'::jsonb,'1'::jsonb,'{}'::jsonb] loop
      update public.blockchain_jobs set payload=jsonb_set(payload,'{bindingVersion}',bad) where id=candidate_job;
      perform pg_temp.expect_stamp_error(format('select public.assert_stamp_blockchain_job_link_v2(%L,%L,%L,%L,''queued'',%L,null,null)',candidate,s.app_user_id,s.celebrity_id,lower(kind),candidate_job),'binding version');
    end loop;
    update public.blockchain_jobs set payload=(payload-'bindingVersion')||'{"stampType":"Knowledge","bindingVersion":2}' where id=candidate_job;
    perform pg_temp.expect_stamp_error(format('select public.assert_stamp_blockchain_job_link_v2(%L,%L,%L,''knowledge'',''queued'',%L,null,null)',candidate,s.app_user_id,s.celebrity_id,candidate_job),'binding version');
    update public.blockchain_jobs set payload=payload-'bindingVersion' where id=candidate_job;
    perform public.assert_stamp_blockchain_job_link_v2(candidate,s.app_user_id,s.celebrity_id,'knowledge','queued',candidate_job,null,null);
    update public.blockchain_jobs set payload=payload||jsonb_build_object('workerSubmission',jsonb_build_object('txHash',tx,'signedTransaction','0x12')) where id=candidate_job;
    perform public.assert_stamp_blockchain_job_link_v2(candidate,s.app_user_id,s.celebrity_id,'knowledge','queued',candidate_job,null,null);
    update public.blockchain_jobs set payload=(payload||'{"stampType":"Membership","bindingVersion":2,"extra":true}') where id=candidate_job;
    perform pg_temp.expect_stamp_error(format('select public.assert_stamp_blockchain_job_link_v2(%L,%L,%L,''membership'',''queued'',%L,null,null)',candidate,s.app_user_id,s.celebrity_id,candidate_job),'stamp payload');
  end loop;
  raise notice 'PASS direct Stamp binding validation, immutable marker, signed payload, owner/entity/result/approval projection';
end $$;

do $$
declare owner_id uuid:='d1000000-0000-4000-8000-000000000001';
  admin_id uuid:='d1000000-0000-4000-8000-000000000004';allowlist_id uuid:='d1000000-0000-4000-8000-000000000010';
  creator_id uuid:='d1100000-0000-4000-8000-000000000001'; event jsonb;qr jsonb;first_result jsonb;second_result jsonb;
  stamp_id uuid;job public.blockchain_jobs; before_tickets bigint;facts jsonb;
begin
  select count(*) into before_tickets from public.fan_ticket_ledger where app_user_id=owner_id;
  event:=public.upsert_admin_mobile_participation_event(admin_id,allowlist_id,null,null,'direct-stamp-qr',creator_id,'general','direct-stamp-v1','published',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '2 hours','스탬프 테스트','Stamp test','','',null,'로컬 스탬프 검증입니다.',extensions.gen_random_uuid());
  qr:=public.issue_admin_mobile_participation_qr(admin_id,allowlist_id,'stamp','event',(event->>'id')::uuid,owner_id,null,'/my/activity','direct-stamp-v1',clock_timestamp()+interval '1 hour',true,false,'로컬 스탬프 검증입니다.',extensions.gen_random_uuid());
  first_result:=public.award_owned_mobile_participation_qr_stamp((qr->>'id')::uuid,owner_id);
  second_result:=public.award_owned_mobile_participation_qr_stamp((qr->>'id')::uuid,owner_id);
  stamp_id:=(first_result->>'id')::uuid;
  select j.* into strict job from public.blockchain_jobs j join public.stamps s on s.blockchain_job_id=j.id where s.id=stamp_id;
  if first_result is distinct from second_result or first_result->>'scorePoints'<>'3'
    or job.payload->'bindingVersion' is distinct from '2'::jsonb or job.payload->>'stampType'<>'Attendance'
    or (select count(*) from public.fan_score_ledger where activity_id=(first_result->>'activityId')::uuid and points=3)<>1
    or (select count(*) from public.blockchain_jobs where entity_type='stamp' and entity_id=stamp_id)<>1
    or (select count(*) from public.fan_ticket_ledger where app_user_id=owner_id)<>before_tickets then
    raise exception 'QR Attendance reward/idempotency/marker regression';
  end if;
  update public.blockchain_jobs set status='PROCESSING',lease_owner='direct-qr-fixture',lease_expires_at=now()+interval '1 minute' where id=job.id;
  update public.blockchain_jobs set status='COMPLETED',lease_owner=null,lease_expires_at=null,tx_hash='0x'||repeat('f',64),token_id=903,completed_at=clock_timestamp() where id=job.id;
  facts:=public.effective_fan_action_mint(owner_id,'stamp',stamp_id,'minted','0x'||repeat('f',64),'903');
  if facts is distinct from jsonb_build_object('status','minted','txHash','0x'||repeat('f',64),'tokenId','903','nftContract','0x527a70c0f7cf129650dc282b709327c5958a4ccf') then raise exception 'QR direct projection invalid'; end if;
  raise notice 'PASS QR Attendance direct target, unchanged 3 XP, no tickets, idempotent replay';
end $$;
