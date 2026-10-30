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

-- Queue claims permit reconciliation; admission always enforces retirement/HOLD.
do $$
declare kind text; marker jsonb; job_id uuid; claimed uuid; job public.blockchain_jobs; before_budget bigint;
  worker text:='retirement-fixture'; v_payload jsonb;
begin
  update public.mint_dispatch_policy set legacy_credential_issuance_retired=true,direct_stamp_dispatch_enabled=false,transmission_paused=false;
  begin
    update public.mint_dispatch_policy set legacy_credential_issuance_retired=false,direct_stamp_dispatch_enabled=true;
    raise exception 'invalid policy accepted';
  exception when check_violation then null;end;
  foreach kind in array array['passport','stamp','reaction','community_stamp'] loop
    job_id:=extensions.gen_random_uuid();
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
      values(job_id,kind,extensions.gen_random_uuid(),'retirement:'||job_id,1,'{}');
    select id into claimed from public.claim_blockchain_jobs(worker,100,60,array[kind]) where id=job_id;
    if claimed is not null then raise exception 'unsigned legacy claimed: %',kind;end if;
    -- A worker which leased just before retirement must still fail admission, even with a reservation.
    update public.blockchain_jobs set status='PROCESSING',attempts=1,lease_owner=worker,lease_expires_at=now()+interval '1 minute' where id=job_id;
    insert into public.mint_dispatch_budget_reservations(budget_day,job_id) values((clock_timestamp() at time zone 'UTC')::date,job_id);
    if public.admit_mint_dispatch(job_id,worker) then raise exception 'retirement race bypassed admission';end if;
    select * into strict job from public.blockchain_jobs where id=job_id;
    if job.status<>'RETRYING' or job.attempts<>0 or job.lease_owner is not null or job.lease_expires_at is not null
      or job.last_error_code<>'LEGACY_CREDENTIAL_ISSUANCE_RETIRED' or job.next_attempt_at<now()+interval '50 seconds' then raise exception 'invalid retirement hold';end if;
    -- A tx-only job remains bounded by max_attempts.
    update public.blockchain_jobs set tx_hash='0x'||repeat('a',64),attempts=max_attempts,next_attempt_at=now()-interval '1 minute' where id=job_id;
    select id into claimed from public.claim_blockchain_jobs(worker,100,60,array[kind]) where id=job_id;
    if claimed is not null then raise exception 'exhausted tx-only job newly eligible';end if;
    update public.blockchain_jobs set attempts=0 where id=job_id;
    select id into claimed from public.claim_blockchain_jobs(worker,100,60,array[kind]) where id=job_id;
    if claimed is null or public.admit_mint_dispatch(job_id,worker) then raise exception 'tx recovery claim/admission boundary failed';end if;
    -- Saved signed transactions retain existing exhausted-attempt and stale-lease recovery.
    update public.blockchain_jobs set payload=jsonb_build_object('workerSubmission',jsonb_build_object('txHash','0x'||repeat('a',64),'signedTransaction','0x12')),
      status='PROCESSING',attempts=max_attempts,lease_owner='stale-worker',lease_expires_at=now()-interval '1 minute' where id=job_id;
    select id into claimed from public.claim_blockchain_jobs(worker,100,60,array[kind]) where id=job_id;
    if claimed is null or public.admit_mint_dispatch(job_id,worker) then raise exception 'signed recovery bypassed admission';end if;
  end loop;
  foreach marker in array array['null'::jsonb,'"2"'::jsonb,'true'::jsonb,'1'::jsonb,'{}'::jsonb,'2'::jsonb] loop
    job_id:=extensions.gen_random_uuid();v_payload:=jsonb_build_object('bindingVersion',marker,'stampType','Attendance');
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
      values(job_id,'stamp',extensions.gen_random_uuid(),'retirement:'||job_id,1,v_payload);
    update public.mint_dispatch_policy set direct_stamp_dispatch_enabled=true;
    select id into claimed from public.claim_blockchain_jobs(worker,100,60,array['stamp']) where id=job_id;
    if (marker='2'::jsonb) is distinct from (claimed is not null) then raise exception 'marker release classification failed: %',marker;end if;
    if claimed is not null then
      if not public.admit_mint_dispatch(job_id,worker) then raise exception 'enabled direct Stamp admission denied';end if;
      -- Release changed after claim: direct HOLD wins before budget admission.
      update public.mint_dispatch_policy set direct_stamp_dispatch_enabled=false;
      select count(*) into before_budget from public.mint_dispatch_budget_reservations;
      if public.admit_mint_dispatch(job_id,worker) then raise exception 'direct race admitted';end if;
      select * into strict job from public.blockchain_jobs where id=job_id;
      if job.last_error_code<>'DIRECT_STAMP_DISPATCH_HELD' or job.attempts<>0
        or (select count(*) from public.mint_dispatch_budget_reservations)<>before_budget then raise exception 'direct hold consumed budget/attempt';end if;
    end if;
    update public.mint_dispatch_policy set direct_stamp_dispatch_enabled=false;
  end loop;
  -- Marker2 on a different entity/version/type never opens a retired route.
  update public.mint_dispatch_policy set direct_stamp_dispatch_enabled=true;
  foreach kind in array array['passport','reaction','community_stamp','stamp'] loop
    job_id:=extensions.gen_random_uuid();
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
      values(job_id,kind,extensions.gen_random_uuid(),'retirement:'||job_id,1,'{"bindingVersion":2,"stampType":"Knowledge"}');
    select id into claimed from public.claim_blockchain_jobs(worker,100,60,array[kind]) where id=job_id;
    if claimed is not null then raise exception 'invalid marker entity/type released: %',kind;end if;
  end loop;
  job_id:=extensions.gen_random_uuid();
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(job_id,'stamp',extensions.gen_random_uuid(),'retirement:'||job_id,2,'{"bindingVersion":2,"stampType":"Membership"}');
  select id into claimed from public.claim_blockchain_jobs(worker,100,60,array['stamp']) where id=job_id;
  if claimed is not null then raise exception 'invalid payload version released';end if;
  update public.mint_dispatch_policy set direct_stamp_dispatch_enabled=false;
  -- Valid marker2 is held even before retirement; malformed/null markers remain legacy.
  update public.mint_dispatch_policy set legacy_credential_issuance_retired=false;
  job_id:=extensions.gen_random_uuid();
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(job_id,'stamp',extensions.gen_random_uuid(),'retirement:'||job_id,1,'{"bindingVersion":2,"stampType":"Membership"}');
  select id into claimed from public.claim_blockchain_jobs(worker,100,60,array['stamp']) where id=job_id;
  if claimed is not null then raise exception 'direct marker2 claimed before retirement while held';end if;
  update public.mint_dispatch_policy set legacy_credential_issuance_retired=true;
  -- Collectibles retain the shared global pause and budget; native fan-action admission is unchanged.
  job_id:=extensions.gen_random_uuid();
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(job_id,'collectible',extensions.gen_random_uuid(),'retirement:'||job_id,1,'{}');
  select id into claimed from public.claim_blockchain_jobs(worker,100,60,array['collectible']) where id=job_id;
  if claimed is null or not public.admit_mint_dispatch(job_id,worker) then raise exception 'collectible admission affected';end if;
  update public.mint_dispatch_policy set transmission_paused=true;
  if public.admit_mint_dispatch(job_id,worker) then raise exception 'global pause bypassed';end if;
  select * into strict job from public.blockchain_jobs where id=job_id;
  if job.last_error_code<>'MINT_TRANSMISSION_PAUSED' then raise exception 'global pause priority changed';end if;
  update public.mint_dispatch_policy set transmission_paused=false;
  declare native_job uuid;occurrence uuid;binding uuid;entity uuid:=extensions.gen_random_uuid();
  begin
    select id into strict binding from public.fan_action_bindings limit 1;
    insert into public.fan_action_occurrences(source_namespace,canonical_source_key,app_user_id,source_occurred_at)
      values('retirement_fixture',entity::text,'d1000000-0000-4000-8000-000000000001',clock_timestamp()) returning id into occurrence;
    insert into public.fan_action_outbox(occurrence_row_id,binding_id,operation_kind,source_snapshot,status,attempts,lease_owner,lease_expires_at)
      values(occurrence,binding,'record_only','{}','PROCESSING',1,worker,now()+interval '1 minute') returning id into native_job;
    if not public.admit_fan_action_dispatch(native_job,worker) then raise exception 'native action held by retirement';end if;
    -- A new collectible must count native reservations against the shared budget.
    job_id:=extensions.gen_random_uuid();
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload,status,attempts,lease_owner,lease_expires_at)
      values(job_id,'collectible',extensions.gen_random_uuid(),'retirement:'||job_id,1,'{}','PROCESSING',1,worker,now()+interval '1 minute');
    update public.mint_dispatch_policy set daily_job_limit=(select count(*) from public.mint_dispatch_budget_reservations where budget_day=(clock_timestamp() at time zone 'UTC')::date)
      +(select count(*) from public.fan_action_dispatch_reservations where budget_day=(clock_timestamp() at time zone 'UTC')::date);
    if public.admit_mint_dispatch(job_id,worker) then raise exception 'shared native budget bypassed';end if;
    if (select last_error_code from public.blockchain_jobs where id=job_id)<>'MINT_DAILY_DISPATCH_LIMIT' then raise exception 'shared budget hold changed';end if;
    update public.mint_dispatch_policy set daily_job_limit=1000;
    -- Import-linked jobs remain excluded even when tx recovery would otherwise permit a claim.
    insert into public.fan_action_occurrences(source_namespace,canonical_source_key,app_user_id,source_occurred_at)
      values('retirement_fixture',extensions.gen_random_uuid()::text,'d1000000-0000-4000-8000-000000000001',clock_timestamp()) returning id into occurrence;
    insert into public.fan_action_outbox(occurrence_row_id,binding_id,operation_kind,source_snapshot)
      values(occurrence,binding,'import_historical','{}') returning id into native_job;
    job_id:=extensions.gen_random_uuid();
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload,tx_hash)
      values(job_id,'passport',entity,'retirement:'||job_id,1,'{}','0x'||repeat('a',64));
    insert into public.fan_action_credentials(outbox_id,entity_type,entity_id,credential_kind,issuance_key,legacy_job_id)
      values(native_job,'passport',entity,0,'0x'||repeat('9',64),job_id);
    select id into claimed from public.claim_blockchain_jobs(worker,100,60,array['passport']) where id=job_id;
    if claimed is not null then raise exception 'historical import recovery claim bypassed exclusion';end if;
  end;
  raise notice 'PASS retirement old4, numeric marker release, NULL/type rejection, stale signed/tx recovery, racing admission and global pause';
end $$;
