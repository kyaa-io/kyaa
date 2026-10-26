\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'REGISTRATION_TEST: %',message; end if; end $$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
declare caught boolean:=false;
begin begin execute statement; exception when others then if position(expected in sqlerrm)=0 then raise exception 'Unexpected %, wanted %',sqlerrm,expected; end if; caught:=true; end;
if not caught then raise exception 'Expected %',expected; end if; end $$;
create or replace function public.fan_action_native_enabled(p_action_code integer,p_app_user_id uuid) returns boolean language sql security definer set search_path='' as $$ select true $$;
do $$
declare creator uuid; second_creator uuid; draft_creator uuid; binding uuid; legacy_binding uuid; campaign_binding uuid; j uuid; j2 uuid; fence bigint; envelope jsonb; result jsonb; raw text:='0x1234'; tx text:='0x'||repeat('a',64); bh text:='0x'||repeat('b',64); signer text:='0x'||repeat('c',40); count_before bigint;
begin
 select count(*) into count_before from public.creator_registration_jobs;
 insert into public.fan_action_bindings(chain_id,environment_id,hub_proxy,relayer,schema_uid,schema_version,binding_version,asset_base_uri,assets)
 values(91342,'0x'||repeat('d',64),'0x'||repeat('e',40),signer,'0x'||repeat('f',64),1,2,'ipfs://bafyfixture','{}') returning id into binding;
 insert into public.fan_action_producer_routes(action_code,binding_id,enabled,policy_version,enabled_at) values(6,binding,true,1,clock_timestamp()),(1,binding,true,1,clock_timestamp()) on conflict(action_code) do update set binding_id=excluded.binding_id,enabled=true,enabled_at=excluded.enabled_at;
 -- Creator routes on legacy bindings and campaign-only v2 bindings are not automatic registration targets.
 insert into public.fan_action_bindings(chain_id,environment_id,hub_proxy,relayer,schema_uid,schema_version,binding_version,asset_base_uri,assets)
 values(91342,'0x'||repeat('d',64),'0x'||repeat('4',40),signer,'0x'||repeat('f',64),1,1,'ipfs://bafyfixture','{}') returning id into legacy_binding;
 insert into public.fan_action_bindings(chain_id,environment_id,hub_proxy,relayer,schema_uid,schema_version,binding_version,asset_base_uri,assets)
 values(91342,'0x'||repeat('d',64),'0x'||repeat('5',40),signer,'0x'||repeat('f',64),1,2,'ipfs://bafyfixture','{}') returning id into campaign_binding;
 insert into public.fan_action_producer_routes(action_code,binding_id,enabled,policy_version,enabled_at)
 values(8,legacy_binding,true,1,clock_timestamp()),(2,campaign_binding,true,1,clock_timestamp()) on conflict(action_code) do update set binding_id=excluded.binding_id,enabled=true,enabled_at=excluded.enabled_at;

 insert into public.celebrities(slug,status,image_url,roles,primary_role) values('registration-auto-draft','draft','/test.webp','{artist}','idol') returning id into draft_creator;
 perform pg_temp.assert(not exists(select 1 from public.creator_registration_jobs where creator_id=draft_creator),'draft queued');
 insert into public.celebrities(slug,status,image_url,published_at,roles,primary_role) values('registration-auto-first','published','/test.webp',clock_timestamp(),'{artist}','idol') returning id into creator;
 perform pg_temp.assert((select ever_published_at is not null from public.celebrities where id=creator),'published INSERT not stamped');
 select id into strict j from public.creator_registration_jobs where creator_id=creator and binding_id=binding;
 perform pg_temp.assert(not exists(select 1 from public.creator_registration_jobs where creator_id=creator and binding_id in (legacy_binding,campaign_binding)),'published INSERT queued a legacy or campaign-only binding');
 perform pg_temp.expect_error(format('update public.celebrities set slug=''registration-renamed'' where id=%L',creator),'immutable after first publication');
 update public.celebrities set status='draft' where id=creator;
 update public.celebrities set status='published',published_at=clock_timestamp() where id=creator;
 perform pg_temp.assert((select count(*)=1 from public.creator_registration_jobs where creator_id=creator and binding_id=binding),'republication duplicated job');
 update public.celebrities set status='published',published_at=clock_timestamp() where id=draft_creator;
 perform pg_temp.assert(exists(select 1 from public.creator_registration_jobs where creator_id=draft_creator and binding_id=binding),'first UPDATE publication not queued');
 perform pg_temp.assert(not exists(select 1 from public.creator_registration_jobs where creator_id=draft_creator and binding_id in (legacy_binding,campaign_binding)),'first UPDATE publication queued a legacy or campaign-only binding');
 insert into public.celebrities(slug,status,image_url,published_at,roles,primary_role) values('registration-auto-second','published','/test.webp',clock_timestamp(),'{artist}','idol') returning id into second_creator;
 select id into strict j2 from public.creator_registration_jobs where creator_id=second_creator and binding_id=binding;
 -- Keep unrelated jobs out of this lease fixture; no production rows escape the rollback.
 update public.creator_registration_jobs set next_attempt_at=clock_timestamp()+interval '1 day' where id not in(j,j2);
 result:=public.creator_registration_claim('worker-a',signer,10);
 perform pg_temp.assert(jsonb_array_length(result)=2,'claim failed');
 select lease_fence into fence from public.creator_registration_jobs where id=j;
 perform pg_temp.assert(jsonb_array_length(public.creator_registration_claim('worker-b',signer,10))=0,'live lease stolen');
 perform pg_temp.expect_error(format('select public.creator_registration_transition(%L,''worker-a'',%s,''submit'',''{}'')',j,fence-1),'LEASE_LOST');
 envelope:=jsonb_build_object('chainId',91342,'to','0x4e104e5dfb3d466a2aac9ed0cf7572578068529b','data',public.creator_registration_calldata(j),'value','0','nonce','12','gasLimit','150000','maxFeePerGas','100000000','maxPriorityFeePerGas','0');
 result:=public.creator_registration_transition(j,'worker-a',fence,'reserve',jsonb_build_object('nonce','12','envelope',envelope));
 perform pg_temp.assert(result->'attempt'->>'status'='reserved','reserve missing');
 perform public.creator_registration_transition(j,'worker-a',fence,'reserve',jsonb_build_object('nonce','12','envelope',envelope));
 perform pg_temp.assert((select count(*)=1 from public.creator_registration_attempts where job_id=j),'lost reserve response duplicated attempt');
 perform pg_temp.expect_error(format('select public.creator_registration_transition(%L,''worker-a'',%s,''submit'',''{}'')',j,fence),'NOT_PREPARED');
 perform pg_temp.expect_error(format('select public.creator_registration_transition(%L,''worker-a'',1,''reserve'',%L::jsonb)',j2,jsonb_build_object('nonce','13','envelope',envelope||jsonb_build_object('nonce','13','data',public.creator_registration_calldata(j2)))),'NONCE_BLOCKED');
 update public.celebrities set status='draft' where id=creator;
 perform public.creator_registration_transition(j,'worker-a',fence,'prepare',jsonb_build_object('signedTransaction',raw,'transactionHash',tx));
 perform public.creator_registration_transition(j,'worker-a',fence,'prepare',jsonb_build_object('signedTransaction',raw,'transactionHash',tx));
 perform pg_temp.expect_error(format('select public.creator_registration_transition(%L,''worker-a'',%s,''prepare'',%L::jsonb)',j,fence,jsonb_build_object('signedTransaction','0x5678','transactionHash',tx)),'ATTEMPT_IMMUTABLE');
 perform public.creator_registration_transition(j,'worker-a',fence,'submit','{}');
 perform public.creator_registration_transition(j,'worker-a',fence,'confirm',jsonb_build_object('transactionHash',tx,'blockNumber','100','blockHash',bh));
 perform pg_temp.assert(public.fan_action_native_enabled(6,null,creator),'confirmed like denied');
 -- Canonical success consumes nonce immediately; finality must not block unrelated registration.
 perform public.creator_registration_transition(j2,'worker-a',1,'reserve',jsonb_build_object('nonce','13','envelope',envelope||jsonb_build_object('nonce','13','data',public.creator_registration_calldata(j2))));
 perform pg_temp.assert((select count(*)=2 from public.creator_registration_attempts where registrar=signer),'confirmed success blocked next nonce');
 perform public.creator_registration_transition(j2,'worker-a',1,'prepare',jsonb_build_object('signedTransaction',raw,'transactionHash','0x'||repeat('d',64)));

 perform pg_temp.expect_error(format('select public.fan_action_native_enabled(1,null,%L)',creator),'CONTEXT_NOT_VERIFIED');
 update public.fan_action_confirmed_creators set confirmed_at=clock_timestamp()-interval '11 minutes' where creator_id=creator;
 perform pg_temp.expect_error(format('select public.fan_action_native_enabled(6,null,%L)',creator),'CONTEXT_NOT_VERIFIED');
 perform public.creator_registration_transition(j,'worker-a',fence,'confirm',jsonb_build_object('transactionHash',tx,'blockNumber','100','blockHash',bh));
 perform pg_temp.assert(public.fan_action_native_enabled(6,null,creator),'canonical refresh failed');
 perform pg_temp.expect_error(format('select public.creator_registration_transition(%L,''worker-a'',%s,''orphan'',%L::jsonb)',j,fence,jsonb_build_object('transactionHash',tx,'blockHash','0x'||repeat('0',64))),'PROOF_CHANGED');
 perform public.creator_registration_transition(j,'worker-a',fence,'orphan',jsonb_build_object('transactionHash',tx,'blockHash',bh));
 perform pg_temp.assert(not exists(select 1 from public.fan_action_confirmed_creators where creator_id=creator),'orphan admission survived');
 perform pg_temp.expect_error(format('select public.creator_registration_transition(%L,''worker-a'',1,''prepare'',%L::jsonb)',j2,jsonb_build_object('signedTransaction',raw,'transactionHash','0x'||repeat('d',64))),'NONCE_BLOCKED');
 perform pg_temp.expect_error(format('select public.creator_registration_transition(%L,''worker-a'',1,''submit'',''{}'')',j2),'NONCE_BLOCKED');
 perform public.creator_registration_transition(j,'worker-a',fence,'submit','{}');
 perform pg_temp.assert(exists(select 1 from public.creator_registration_attempts a cross join lateral jsonb_array_elements(a.receipt_history) h where a.job_id=j and h->'receipt'->>'blockHash'=bh),'orphan receipt history lost');

 perform public.creator_registration_transition(j,'worker-a',fence,'confirm',jsonb_build_object('transactionHash',tx,'blockNumber','101','blockHash',bh));
 perform public.creator_registration_transition(j,'worker-a',fence,'finalize',jsonb_build_object('transactionHash',tx,'blockNumber','101','blockHash',bh));
 update public.fan_action_confirmed_creators set confirmed_at=clock_timestamp()-interval '11 minutes' where creator_id=creator;
 perform pg_temp.assert(public.fan_action_native_enabled(6,null,creator) and public.fan_action_native_enabled(1,null,creator),'finalized proof incorrectly expired');
 update public.celebrities set status='published',published_at=clock_timestamp() where id=creator;
 perform pg_temp.expect_error(format('delete from public.creator_registration_attempts where job_id=%L',j),'ATTEMPT_IMMUTABLE');
 perform pg_temp.expect_error(format('update public.creator_registration_attempts set receipt_history=''[]''::jsonb where job_id=%L',j),'RECEIPT_HISTORY_IMMUTABLE');
 update public.creator_registration_jobs set lease_expires_at=clock_timestamp()-interval '1 second',next_attempt_at=clock_timestamp()-interval '1 hour' where id=j2;
 result:=public.creator_registration_claim('worker-b',signer,1);
 perform pg_temp.expect_error(format('select public.creator_registration_transition(%L,''worker-a'',1,''submit'',''{}'')',j2),'LEASE_LOST');
-- Finalized failed receipt allows a new nonce, while preserving the failed attempt.
 select lease_fence into fence from public.creator_registration_jobs where id=j2;
 envelope:=envelope||jsonb_build_object('nonce','13','data',public.creator_registration_calldata(j2));
 perform public.creator_registration_transition(j2,'worker-b',fence,'reserve',jsonb_build_object('nonce','13','envelope',envelope));
 perform public.creator_registration_transition(j2,'worker-b',fence,'prepare',jsonb_build_object('signedTransaction',raw,'transactionHash','0x'||repeat('d',64)));
 perform public.creator_registration_transition(j2,'worker-b',fence,'revert',jsonb_build_object('transactionHash','0x'||repeat('d',64),'blockNumber','102','blockHash',bh,'contextAbsent',true));
 envelope:=envelope||jsonb_build_object('nonce','14');
 perform public.creator_registration_transition(j2,'worker-b',fence,'reserve',jsonb_build_object('nonce','14','envelope',envelope));
 perform pg_temp.assert((select count(*)=2 from public.creator_registration_attempts where job_id=j2),'revert attempt evidence lost');
end $$;
-- Both explicit source types enter the same queue and cannot mint creator admission.
do $$
declare binding uuid; creator uuid; live_id uuid:=extensions.gen_random_uuid(); wave_creator uuid; wave_id uuid; template jsonb; result jsonb; job uuid; env jsonb; fence bigint; kind text; h text:='0x'||repeat('9',64); signer text:='0x'||repeat('c',40); historical text:='0x'||repeat('8',40); nonce integer:=50;
begin
 select id into strict binding from public.fan_action_bindings where hub_proxy='0x'||repeat('e',40);
 select id into strict creator from public.celebrities where slug='registration-auto-first';
 select to_jsonb(l) into strict template from public.live_events l limit 1;
 insert into public.live_events select * from jsonb_populate_record(null::public.live_events,template||jsonb_build_object('id',live_id,'celebrity_id',creator,'slug','registration-explicit-live','publication_status','published','published_at',clock_timestamp(),'archived_at',null));
 select id into wave_creator from public.celebrities where slug='kyaa-wave-fanpage';
 if wave_creator is null then
  insert into public.celebrities(slug,status,image_url,published_at,roles,primary_role) values('kyaa-wave-fanpage','published','/test.webp',clock_timestamp(),'{artist}','idol') returning id into wave_creator;
 else update public.celebrities set status='published',published_at=clock_timestamp() where id=wave_creator;
 end if;
 select campaign_id into strict wave_id from public.kyaa_wave_participation_config where event_key='kyaa-wave-2026';
 insert into public.fan_action_verified_creators(binding_id,creator_id,verified_block_number,verified_block_hash,verified_at) values(binding,wave_creator,1,h,clock_timestamp()) on conflict do nothing;
 foreach kind in array array['live','wave'] loop
  result:=public.enqueue_campaign_registration(binding,case when kind='live' then live_id else wave_id end);
  job:=(result->'job'->>'id')::uuid;
  perform pg_temp.assert(result->'job'->>'slug'=case when kind='live' then 'registration-explicit-live' else 'kyaa-wave-2026' end,'campaign source slug changed');
  perform pg_temp.assert((result->'source'->>'valid')::boolean,'campaign source invalid');
  perform public.enqueue_campaign_registration(binding,case when kind='live' then live_id else wave_id end);
  update public.creator_registration_jobs set next_attempt_at=clock_timestamp()+interval '1 day' where id<>job;
  perform public.creator_registration_claim('campaign-worker',signer,1);
  select lease_fence into fence from public.creator_registration_jobs where id=job;
  env:=jsonb_build_object('chainId',91342,'to','0x4e104e5dfb3d466a2aac9ed0cf7572578068529b','data',public.creator_registration_calldata(job),'value','0','nonce',nonce::text,'gasLimit','150000','maxFeePerGas','100000000','maxPriorityFeePerGas','0');
  perform pg_temp.expect_error(format('select public.creator_registration_transition(%L,''campaign-worker'',%s,''reserve'',%L::jsonb)',job,fence,jsonb_build_object('nonce',nonce::text,'envelope',env)),'NONCE_BLOCKED');
  perform public.creator_registration_transition(job,'campaign-worker',fence,'recover',jsonb_build_object('nonce',nonce::text,'registrar',historical,'envelope',env,'transactionHash',h,'blockNumber','200','blockHash',h));
  perform public.creator_registration_transition(job,'campaign-worker',fence,'confirm',jsonb_build_object('transactionHash',h,'blockNumber','200','blockHash',h));
  perform pg_temp.assert(not exists(select 1 from public.fan_action_confirmed_creators where transaction_hash=h),'campaign created likes proof');
  perform public.creator_registration_transition(job,'campaign-worker',fence,'finalize',jsonb_build_object('transactionHash',h,'blockNumber','200','blockHash',h));
  perform pg_temp.assert(exists(select 1 from public.fan_action_verified_campaigns where binding_id=binding and campaign_id=case when kind='live' then live_id else wave_id end),'campaign finality missing');
  nonce:=nonce+1;
 end loop;
end $$;
-- Recovery windows resume after restart without spending the transport/signing failure budget.
do $$
declare job uuid; attempt_job uuid; fence bigint; cursor text; result jsonb; signer text:='0x'||repeat('c',40);
begin
 select j.id into strict job from public.creator_registration_jobs j join public.celebrities c on c.id=j.creator_id join public.fan_action_bindings b on b.id=j.binding_id where c.slug='registration-auto-draft' and j.kind='creator' and b.hub_proxy='0x'||repeat('e',40);
 update public.creator_registration_jobs set next_attempt_at=clock_timestamp()+interval '1 day';
 update public.creator_registration_jobs set failures=9 where id=job;
 foreach cursor in array array['1000','900','900','0'] loop
  update public.creator_registration_jobs set next_attempt_at=clock_timestamp()-interval '1 second' where id=job;
  result:=public.creator_registration_claim('recovery-worker',signer,1);
  perform pg_temp.assert(jsonb_array_length(result)=1,'recovery restart claim missing');
  select lease_fence into fence from public.creator_registration_jobs where id=job;
  perform public.creator_registration_transition(job,'recovery-worker',fence,'defer',jsonb_build_object('recoveryBeforeBlock',cursor,'delaySeconds',60,'errorCode','REGISTRATION_RECOVERY_PENDING'));
  perform pg_temp.assert((select recovery_before_block=cursor::numeric and failures=9 and status<>'failed' from public.creator_registration_jobs where id=job),'recovery pending spent budget or lost cursor');
 end loop;
 update public.creator_registration_jobs set next_attempt_at=clock_timestamp()-interval '1 second' where id=job;
 result:=public.creator_registration_claim('recovery-worker',signer,1);
 perform pg_temp.assert(result->0->'job'->>'recovery_before_block'='0' and jsonb_typeof(result->0->'job'->'recovery_before_block')='string','recovery cursor not persisted as exact decimal text');
 select lease_fence into fence from public.creator_registration_jobs where id=job;
 foreach cursor in array array['1','-1','0.1','invalid'] loop
  perform pg_temp.expect_error(format('select public.creator_registration_transition(%L,''recovery-worker'',%s,''defer'',%L::jsonb)',job,fence,jsonb_build_object('recoveryBeforeBlock',cursor,'delaySeconds',60,'errorCode','REGISTRATION_RECOVERY_PENDING')),'INVALID_RECOVERY_CURSOR');
 end loop;
 select j.id into strict attempt_job from public.creator_registration_jobs j join public.celebrities c on c.id=j.creator_id join public.fan_action_bindings b on b.id=j.binding_id where c.slug='registration-auto-second' and j.kind='creator' and b.hub_proxy='0x'||repeat('e',40);
 update public.creator_registration_jobs set lease_owner='recovery-worker',lease_fence=41,lease_expires_at=clock_timestamp()+interval '2 minutes' where id=attempt_job;
 perform pg_temp.expect_error(format('select public.creator_registration_transition(%L,''recovery-worker'',41,''defer'',%L::jsonb)',attempt_job,jsonb_build_object('recoveryBeforeBlock','800','delaySeconds',60,'errorCode','REGISTRATION_RECOVERY_PENDING')),'INVALID_RECOVERY_CURSOR');
end $$;
-- Denial is checked against actual PostgreSQL roles, not only JWT claims.
grant execute on function pg_temp.expect_error(text,text) to service_role,creator_registration_worker;
set local role service_role;
select pg_temp.expect_error('select public.creator_registration_claim(''forged'',''0xcccccccccccccccccccccccccccccccccccccccc'',1)','permission denied');
select pg_temp.expect_error('select * from public.creator_registration_attempts','permission denied');
reset role;
set local role creator_registration_worker;
select pg_temp.expect_error('select * from public.creator_registration_jobs','permission denied');
select pg_temp.expect_error('select public.enqueue_campaign_registration(null,null)','permission denied');
reset role;
select pg_temp.assert(not has_function_privilege('anon','public.creator_registration_transition(uuid,text,bigint,text,jsonb)','execute') and not has_function_privilege('authenticated','public.creator_registration_transition(uuid,text,bigint,text,jsonb)','execute'),'public proof mutation grant');
rollback;
