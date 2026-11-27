-- Disposable PostgreSQL only; all fixtures roll back.
begin;
create function pg_temp.expect_action_error(statement text,expected text) returns void language plpgsql as $$
declare caught boolean:=false;
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm)=0 then raise exception 'Unexpected error %, expected %',sqlerrm,expected; end if;
    caught:=true;
  end;
  if not caught then raise exception 'Expected failure: %',expected; end if;
end $$;

do $$
declare
  owner_id uuid:=extensions.gen_random_uuid(); binding uuid; occurrence uuid; job uuid; other_job uuid;
  h text:='0x'||repeat('1',64); h2 text:='0x'||repeat('2',64); h3 text:='0x'||repeat('3',64);
  address text:='0x'||repeat('1',40); relayer text:='0x'||repeat('2',40);
  source jsonb; payload jsonb; q public.fan_action_outbox; next_status text; r integer; signed text;
begin
  assert not has_function_privilege('anon','public.supersede_fan_action_transaction(uuid,text,text,numeric,numeric)','EXECUTE');
  assert not has_function_privilege('authenticated','public.supersede_fan_action_transaction(uuid,text,text,numeric,numeric)','EXECUTE');
  assert has_function_privilege('service_role','public.supersede_fan_action_transaction(uuid,text,text,numeric,numeric)','EXECUTE');
  assert not has_table_privilege('service_role','public.fan_action_superseded_transactions','SELECT');
  assert not has_table_privilege('authenticated','public.fan_action_superseded_transactions','SELECT');

  insert into public.app_users(id,privy_user_id,verified_email) values(owner_id,'did:privy:action-supersede','action-supersede@example.test');
  insert into public.fan_action_bindings(chain_id,environment_id,hub_proxy,relayer,migrator_relayer,schema_uid,schema_version,binding_version,asset_base_uri,assets)
    values(91342,h,address,relayer,'0x'||repeat('3',40),h2,1,1,'ipfs://bafyfixture','{}') returning id into binding;
  source:=jsonb_build_object('chainId',91342,'environmentId',h,'hubProxy',address,'schemaUid',h2,'bindingVersion',1);
  insert into public.fan_action_occurrences(source_namespace,canonical_source_key,app_user_id,source_occurred_at)
    values('supersede_fixture','1',owner_id,clock_timestamp()) returning id into occurrence;
  insert into public.fan_action_outbox(occurrence_row_id,binding_id,operation_kind,source_snapshot)
    values(occurrence,binding,'record_only',source) returning id into job;
  perform public.claim_fan_action_jobs('core-test',1,120);
  payload:=source||jsonb_build_object('actionId',h,'occurrenceId',h2,'requestHash',h3,'request',jsonb_build_object('bindingVersion',1));
  q:=public.prepare_fan_action_job(job,'core-test',payload);
  if not public.admit_chain_writer('fan_action',job,'core-test',91342,relayer,120) then raise exception 'writer denied'; end if;
  q:=public.record_prepared_fan_action_job(job,'core-test',h,'0x1234');
  perform public.release_chain_writer('fan_action',job,'core-test',91342,relayer);

  insert into public.fan_action_occurrences(source_namespace,canonical_source_key,app_user_id,source_occurred_at)
    values('supersede_fixture','2',owner_id,clock_timestamp()) returning id into occurrence;
  insert into public.fan_action_outbox(occurrence_row_id,binding_id,operation_kind,source_snapshot)
    values(occurrence,binding,'record_only',source) returning id into other_job;
  perform public.claim_fan_action_jobs('other-worker',1,120);
  if public.admit_chain_writer('fan_action',other_job,'other-worker',91342,relayer,120) then
    raise exception 'stored signature did not block the relayer'; end if;

  -- Signed bytes stay immutable outside the supersede path, even with the marker set by hand.
  perform pg_temp.expect_action_error(format('update public.fan_action_outbox set tx_hash=null,signed_transaction=null where id=%L',job),'FAN_ACTION_IMMUTABLE');
  perform set_config('kyaa.fan_action_supersede',job::text,true);
  perform pg_temp.expect_action_error(format('update public.fan_action_outbox set tx_hash=null,signed_transaction=null where id=%L',job),'FAN_ACTION_IMMUTABLE');
  perform set_config('kyaa.fan_action_supersede','',true);

  perform pg_temp.expect_action_error(format('select public.supersede_fan_action_transaction(%L,%L,%L,5,6)',job,'wrong-owner',h),'STALE_JOB_LEASE');
  perform pg_temp.expect_action_error(format('select public.supersede_fan_action_transaction(%L,%L,%L,5,6)',job,'core-test',h2),'FAN_ACTION_SUPERSEDE_MISMATCH');
  perform pg_temp.expect_action_error(format('select public.supersede_fan_action_transaction(%L,%L,%L,5,5)',job,'core-test',h),'FAN_ACTION_SUPERSEDE_NOT_PROVEN');
  perform pg_temp.expect_action_error(format('select public.supersede_fan_action_transaction(%L,%L,%L,5.5,6)',job,'core-test',h),'FAN_ACTION_SUPERSEDE_INVALID_NONCE');

  -- Proven: the relayer nonce passed the stored transaction's nonce.
  next_status:=public.supersede_fan_action_transaction(job,'core-test',h,5,6);
  if next_status<>'RETRYING' then raise exception 'first supersede returned %',next_status; end if;
  select * into q from public.fan_action_outbox where id=job;
  if q.status<>'RETRYING' or q.signed_transaction is not null or q.tx_hash is not null or q.attempts<>0
    or q.lease_owner is not null or q.last_error_code<>'SIGNED_TRANSACTION_SUPERSEDED' or q.payload is distinct from payload then
    raise exception 'supersede left unexpected row state %',to_jsonb(q); end if;
  if (select count(*) from public.fan_action_superseded_transactions where outbox_id=job and tx_hash=h and signed_transaction='0x1234'
    and tx_nonce=5 and chain_nonce=6 and reason='NONCE_CONSUMED')<>1 then raise exception 'archive row missing'; end if;
  perform pg_temp.expect_action_error(format('update public.fan_action_superseded_transactions set reason=%L where outbox_id=%L','ATTEMPTS_EXHAUSTED',job),'FAN_ACTION_IMMUTABLE');
  perform pg_temp.expect_action_error(format('delete from public.fan_action_superseded_transactions where outbox_id=%L',job),'FAN_ACTION_IMMUTABLE');

  -- The other writer is no longer blocked.
  update public.fan_action_outbox set next_attempt_at=clock_timestamp() where id=other_job;
  perform public.claim_fan_action_jobs('other-worker',1,120);
  if not public.admit_chain_writer('fan_action',other_job,'other-worker',91342,relayer,120) then
    raise exception 'superseded signature still blocks the relayer'; end if;
  perform public.release_chain_writer('fan_action',other_job,'other-worker',91342,relayer);

  -- Re-sign twice more; the third superseded signature closes the job as FAILED and unsigned.
  for r in 2..3 loop
    signed:='0x'||repeat(r::text,4);
    update public.fan_action_outbox set next_attempt_at=clock_timestamp() where id=job;
    if (select count(*) from public.claim_fan_action_jobs('core-test',1,120) c where c.id=job)<>1 then raise exception 'job not reclaimed in r %',r; end if;
    if not public.admit_chain_writer('fan_action',job,'core-test',91342,relayer,120) then raise exception 'writer denied in r %',r; end if;
    q:=public.record_prepared_fan_action_job(job,'core-test','0x'||repeat(r::text,64),signed);
    if r=3 then
      update public.fan_action_outbox set attempts=max_attempts where id=job;
      next_status:=public.supersede_fan_action_transaction(job,'core-test','0x'||repeat(r::text,64),7,7);
    else
      next_status:=public.supersede_fan_action_transaction(job,'core-test','0x'||repeat(r::text,64),6,7);
    end if;
    perform public.release_chain_writer('fan_action',job,'core-test',91342,relayer);
    if next_status is distinct from (case when r=3 then 'FAILED' else 'RETRYING' end) then raise exception 'r % returned %',r,next_status; end if;
  end loop;
  select * into q from public.fan_action_outbox where id=job;
  if q.status<>'FAILED' or q.signed_transaction is not null or q.last_error_code<>'SIGNED_TRANSACTION_SUPERSEDED_LIMIT' then
    raise exception 'limit did not close the job %',to_jsonb(q); end if;
  if (select reason from public.fan_action_superseded_transactions where outbox_id=job order by id desc limit 1)<>'ATTEMPTS_EXHAUSTED' then
    raise exception 'exhausted reason not recorded'; end if;
  update public.fan_action_outbox set next_attempt_at=clock_timestamp() where id=other_job and status='RETRYING';
  if (select status from public.fan_action_outbox where id=other_job)='PROCESSING' then
    if not public.admit_chain_writer('fan_action',other_job,'other-worker',91342,relayer,120) then
      raise exception 'failed superseded job still blocks the relayer'; end if;
  end if;
end $$;
rollback;
