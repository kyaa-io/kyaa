-- Synthetic fixtures only in a disposable local database.
do $$begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required';end if;end $$;
begin;
\ir wave_stage_upgrade_before.sql
create function pg_temp.expect_revert_error(statement text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if sqlerrm='PARTICIPATION_RECEIPT_MISMATCH' then return;else raise;end if;end;raise exception 'Expected receipt rejection';end $$;
do $$
declare c uuid;owner_id uuid:=md5('wave-stage-fixture:1')::uuid;m uuid;s public.participation_sources;q public.participation_batches;other uuid;legacy uuid;binding uuid;occurrence uuid;action_job uuid;result jsonb;
 signer text:='0x'||repeat('1',40);contract text:='0x'||repeat('2',40);h text:='0x'||repeat('1',64);bh text:='0x'||repeat('2',64);receipt jsonb;
begin
 assert not has_function_privilege('anon','public.fail_reverted_participation_batch(uuid,text,jsonb)','EXECUTE');
 assert not has_function_privilege('authenticated','public.fail_reverted_participation_batch(uuid,text,jsonb)','EXECUTE');
 assert has_function_privilege('service_role','public.fail_reverted_participation_batch(uuid,text,jsonb)','EXECUTE');
 select id into strict c from public.celebrities where slug='changha';
 insert into public.fan_lounge_messages(app_user_id,celebrity_id,body,idempotency_key,created_at) values(owner_id,c,'Revert fixture',extensions.gen_random_uuid(),now()-interval '1 minute') returning id into m;
 select * into strict s from public.participation_sources where source_id=m;
 update public.participation_config set enabled=true,contract_address=contract,relayer=signer;
 select * into strict q from public.claim_participation_batches('revert-test',1,120);
 q:=public.prepare_participation_batch(q.id,'revert-test',jsonb_build_object('version',1,'chainId',91342,'contractAddress',contract,'items',q.items));
 assert public.admit_chain_writer('participation',q.id,'revert-test',91342,signer);
 q:=public.record_prepared_participation_batch(q.id,'revert-test',h,'0x1234');
 perform public.release_chain_writer('participation',q.id,'revert-test',91342,signer);
 receipt:=jsonb_build_object('txHash',h,'blockHash',bh,'blockNumber','100','transactionIndex',0,'inclusionStatus','finalized','outcome','reverted');
 assert not public.fail_reverted_participation_batch(q.id,'stale',receipt);
 update public.participation_batches set lease_expires_at=clock_timestamp()-interval '1 second' where id=q.id;
 assert not public.fail_reverted_participation_batch(q.id,'revert-test',receipt),'expired lease cannot finalize';
 update public.participation_batches set lease_expires_at=clock_timestamp()+interval '2 minutes' where id=q.id;
 perform pg_temp.expect_revert_error(format('select public.fail_reverted_participation_batch(%L,%L,%L)',q.id,'revert-test',(receipt||'{"outcome":"success"}')::text));
 perform pg_temp.expect_revert_error(format('select public.fail_reverted_participation_batch(%L,%L,%L)',q.id,'revert-test',(receipt||'{"inclusionStatus":"included"}')::text));
 perform pg_temp.expect_revert_error(format('select public.fail_reverted_participation_batch(%L,%L,%L)',q.id,'revert-test',(receipt-'blockHash')::text));
 perform pg_temp.expect_revert_error(format('select public.fail_reverted_participation_batch(%L,%L,%L)',q.id,'revert-test',(receipt||jsonb_build_object('txHash',bh))::text));
 insert into public.participation_batches(chain_id,contract_address,relayer,items,status,lease_owner,lease_expires_at)
 values(91342,contract,signer,q.items,'PROCESSING','other',clock_timestamp()+interval '2 minutes')returning id into other;
 assert not public.admit_chain_writer('participation',other,'other',91342,signer),'unresolved signed transaction must block';
 assert public.fail_reverted_participation_batch(q.id,'revert-test',receipt);
 assert(select status='FAILED' and signed_transaction='0x1234' and payload=q.payload and b.receipt->>'outcome'='reverted' and inclusion_status='finalized' from public.participation_batches b where id=q.id);
 assert(select acked_revision=0 from public.participation_sources where id=s.id);
 assert not public.set_participation_finality(q.id,bh,'orphaned');
 assert not exists(select 1 from public.list_participation_receipts(20)where id=q.id);
 update public.participation_batches set status='PROCESSING',lease_owner='other',lease_expires_at=clock_timestamp()+interval '2 minutes'where id=other;
 assert public.admit_chain_writer('participation',other,'other',91342,signer);
 perform public.release_chain_writer('participation',other,'other',91342,signer);
 insert into public.blockchain_jobs(entity_type,entity_id,operation_key,payload,status,lease_owner,lease_expires_at)
 values('passport',extensions.gen_random_uuid(),'revert-fixture','{}','PROCESSING','legacy',clock_timestamp()+interval '2 minutes')returning id into legacy;
 assert public.admit_chain_writer('legacy',legacy,'legacy',91342,signer);
 perform public.release_chain_writer('legacy',legacy,'legacy',91342,signer);
 insert into public.fan_action_bindings(chain_id,environment_id,hub_proxy,relayer,schema_uid,schema_version,binding_version,asset_base_uri,assets)
 values(91342,h,contract,signer,h,1,1,'ipfs://fixture','{}')returning id into binding;
 insert into public.fan_action_occurrences(source_namespace,canonical_source_key,app_user_id,source_occurred_at)
 values('revert-fixture','one',owner_id,now())returning id into occurrence;
 insert into public.fan_action_outbox(occurrence_row_id,binding_id,operation_kind,source_snapshot,status,lease_owner,lease_expires_at)
 values(occurrence,binding,'record_only','{}','PROCESSING','action',clock_timestamp()+interval '2 minutes')returning id into action_job;
 assert public.admit_chain_writer('fan_action',action_job,'action',91342,signer);
 perform public.release_chain_writer('fan_action',action_job,'action',91342,signer);
 update public.fan_lounge_messages set removed_at=clock_timestamp()where id=m;
 assert(select revision=2 and acked_revision=0 from public.participation_sources where id=s.id);
 result:=public.read_admin_wave_stage_participation('92900000-0000-4000-8000-000000000001','92900000-0000-4000-8000-000000000002');
 assert(result->'creators'->0->>'failed')::int=1,'failed source stays failed across revisions';
 assert not exists(select 1 from public.claim_participation_batches('later',20,120)where id=q.id);
 assert(select count(*)=1 from public.participation_batch_items where source_row_id=s.id),'failed source must not be automatically reissued';
end $$;
rollback;
