-- Only disposable local replay; synthetic fixtures roll back.
do $$begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required';end if;end $$;
begin;
\ir wave_stage_upgrade_before.sql
create function pg_temp.expect_participation_error(statement text,expected text)returns void language plpgsql as $$
begin begin execute statement;exception when others then if position(expected in sqlerrm)>0 then return;else raise;end if;end;raise exception 'Expected %',expected;end $$;
do $$
declare creator_id uuid;owner_id uuid:=md5('wave-stage-fixture:1')::uuid;other_owner uuid:=md5('wave-stage-fixture:2')::uuid; message_id uuid;second_id uuid;
 s public.participation_sources;q public.participation_batches;recovered public.participation_batches;h text:='0x'||repeat('1',64);bh text:='0x'||repeat('2',64);bh2 text:='0x'||repeat('3',64);relayer_address text:='0x'||repeat('1',40);contract text:='0x'||repeat('2',40);before_rewards bigint;before_jobs bigint;n integer;payload jsonb;receipt jsonb;old_participant text;before_backfill bigint;quiz_id uuid;attempt_id uuid;pass_id uuid;passport_id uuid;reaction_id uuid;reservation_id uuid;legacy_id uuid;other_live uuid;batch_a uuid;batch_b uuid;batch_unsigned uuid;
begin
 select id into strict creator_id from public.celebrities where slug='changha';
 select count(*) into before_rewards from public.fan_ticket_ledger;
 select count(*) into before_jobs from public.blockchain_jobs;
 assert not has_table_privilege('anon','public.participation_sources','SELECT');
 assert not has_table_privilege('authenticated','public.participation_subjects','SELECT');
 assert not has_table_privilege('service_role','public.participation_sources','UPDATE');
 assert not has_function_privilege('anon','public.backfill_participation_sources(boolean)','EXECUTE');
 assert not has_function_privilege('authenticated','public.claim_participation_batches(text,integer,integer)','EXECUTE');
 assert has_function_privilege('service_role','public.claim_participation_batches(text,integer,integer)','EXECUTE');
 insert into public.fan_lounge_messages(app_user_id,celebrity_id,body,idempotency_key,created_at)values(owner_id,creator_id,'Fixture receipt',extensions.gen_random_uuid(),'2026-01-02T14:59:59.999999Z')returning id into message_id;
 select * into strict s from public.participation_sources where source_id=message_id;
 assert s.kind=4 and s.revision=1 and s.acked_revision=0 and s.desired_active;
 assert s.occurred_at_micros=1767365999999999 and s.origin=1;
 assert s.source<>'0x'||replace(message_id::text,'-','') and octet_length(s.salt)=32;
 assert s.creator='0x'||rpad(encode(convert_to('changha','UTF8'),'hex'),64,'0');
 perform public.sync_participation_source('fan_lounge_messages',message_id);
 assert(select count(*)=1 from public.participation_sources where source_id=message_id);
 perform pg_temp.expect_participation_error(format('update public.participation_sources set app_user_id=%L where id=%L',other_owner,s.id),'PARTICIPATION_IMMUTABLE');
 perform pg_temp.expect_participation_error(format('update public.participation_config set cutover_at=now()+interval ''1 day'''),'PARTICIPATION_IMMUTABLE');
 select count(*)into n from public.claim_participation_batches('fixture',1,120);assert n=0,'disabled by default';
 select count(*)into before_backfill from public.participation_sources;perform public.backfill_participation_sources(true);assert(select count(*)=before_backfill from public.participation_sources);
 update public.participation_config set enabled=true,contract_address=contract,relayer=relayer_address;
 select * into strict q from public.claim_participation_batches('fixture',1,120);
 payload:=jsonb_build_object('version',1,'chainId',91342,'contractAddress',contract,'items',q.items);
 q:=public.prepare_participation_batch(q.id,'fixture',payload);
 assert public.admit_chain_writer('participation',q.id,'fixture',91342,relayer_address);
 q:=public.record_prepared_participation_batch(q.id,'fixture',h,'0x1234');
 perform pg_temp.expect_participation_error(format('select public.prepare_participation_batch(%L,''fixture'',%L)',q.id,(payload||'{"version":2}')::text),'PARTICIPATION_PAYLOAD_MISMATCH');
 -- A removal while the first revision is in flight is never acknowledged as that revision.
 update public.fan_lounge_messages set removed_at=clock_timestamp()where id=message_id;
 assert(select revision=2 and not desired_active from public.participation_sources where id=s.id);
 receipt:=jsonb_build_object('txHash',h,'blockHash',bh,'blockNumber','100');
 assert not public.complete_participation_batch(q.id,'stale',receipt);
 assert public.complete_participation_batch(q.id,'fixture',receipt);
 assert(select acked_revision=1 and revision=2 from public.participation_sources where id=s.id);
 perform public.release_chain_writer('participation',q.id,'fixture',91342,relayer_address);
 select * into strict recovered from public.claim_participation_batches('fixture',1,120);
 assert recovered.items->0->>'revision'='2' and recovered.items->0->>'active'='false';
 -- A persisted FAILED transaction remains a nonce blocker across all old lanes.
 update public.participation_batches set status='FAILED',lease_owner=null,lease_expires_at=null where id=recovered.id;
 update public.participation_batches set status='FAILED'where id=q.id;
 insert into public.blockchain_jobs(entity_type,entity_id,operation_key,payload,status,lease_owner,lease_expires_at)
 values('passport',extensions.gen_random_uuid(),'participation:nonce:fixture','{}','PROCESSING','legacy-fixture',clock_timestamp()+interval '2 minutes')returning id into second_id;
 assert not public.admit_chain_writer('legacy',second_id,'legacy-fixture',91342,relayer_address);
 assert(select status='RETRYING' and last_error_code='CHAIN_WRITER_BUSY'from public.blockchain_jobs where id=second_id);
 update public.participation_batches set status='COMPLETED'where id=q.id;
 assert public.set_participation_finality(q.id,bh,'orphaned');
 assert(select status='RETRYING' and signed_transaction='0x1234'from public.participation_batches where id=q.id);
 assert public.replace_participation_receipt(q.id,bh,jsonb_build_object('txHash',h,'blockHash',bh2,'blockNumber','101'));
 assert(select count(*)>=2 from public.participation_receipt_history where batch_id=q.id);
 assert not public.set_participation_finality(q.id,bh,'finalized');
 -- Source and subject identities survive suspension and restoration unchanged.
 old_participant:=s.participant;
 update public.fan_lounge_messages set removed_at=null where id=message_id;
 update public.app_users set status='disabled'where id=owner_id;
 assert(select not desired_active from public.participation_sources where id=s.id);
 update public.app_users set status='active'where id=owner_id;
 assert(select desired_active and revision=5 and participant=old_participant and source=s.source from public.participation_sources where id=s.id);
 insert into public.fan_lounge_messages(app_user_id,celebrity_id,body,idempotency_key)values(owner_id,creator_id,'Second fixture',extensions.gen_random_uuid())returning id into second_id;
 assert(select participant=old_participant and source<>s.source from public.participation_sources where source_id=second_id);
 assert(select count(*)=before_rewards from public.fan_ticket_ledger),'no ticket rewards changed';
 assert(select count(*)=before_jobs+1 from public.blockchain_jobs),'only explicit legacy fixture job added';
 -- Capture each of the other source kinds without changing its original credential job.
 insert into public.celebrity_quizzes(celebrity_id,version,status)values(creator_id,1,'draft')returning id into quiz_id;
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)values(owner_id,91342,'0x'||repeat('9',40),'privy','embedded');
 insert into public.quiz_attempts(app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)values(owner_id,creator_id,quiz_id,1,extensions.gen_random_uuid(),'passed',3,clock_timestamp())returning id into attempt_id;
 insert into public.quiz_passes(app_user_id,celebrity_id,winning_attempt_id)values(owner_id,creator_id,attempt_id)returning id into pass_id;
 passport_id:=extensions.gen_random_uuid();
 insert into public.blockchain_jobs(entity_type,entity_id,operation_key,payload)values('passport',passport_id,'byus:passport:v1:'||owner_id||':changha',jsonb_build_object('recipient','0x'||repeat('9',40),'celebritySlug','changha','passportId',h))returning id into legacy_id;
 insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)values(passport_id,owner_id,creator_id,pass_id,legacy_id);
 assert(select kind=2 and origin=0 and desired_active and participant=old_participant from public.participation_sources where source_id=passport_id);
 assert(select status='PENDING' and tx_hash is null from public.blockchain_jobs where id=legacy_id),'credential mint remains independent';
 insert into public.live_reservations(app_user_id,live_event_id,celebrity_id,passport_id,idempotency_key)values(owner_id,'fde5ff1b-ac41-4c20-902b-034cba972023',creator_id,passport_id,extensions.gen_random_uuid())returning id into reservation_id;
 assert(select kind=1 and desired_active and participant=old_participant from public.participation_sources where source_id=reservation_id);
 reaction_id:=extensions.gen_random_uuid();
 insert into public.blockchain_jobs(entity_type,entity_id,operation_key,payload)values('reaction',reaction_id,'byus:reaction:v1:'||reaction_id,jsonb_build_object('recipient','0x'||repeat('9',40),'celebritySlug','changha','issuanceId',h,'reactionType','FirstReaction'))returning id into legacy_id;
 insert into public.fan_reactions(id,app_user_id,celebrity_id,blockchain_job_id)values(reaction_id,owner_id,creator_id,legacy_id);
 assert(select kind=3 and desired_active and participant=old_participant from public.participation_sources where source_id=reaction_id);
 assert(select count(distinct kind)=4 from public.participation_sources where app_user_id=owner_id);
 -- Legacy recovery is explicit and the dry run writes nothing.
 set constraints wave_mission_evidence_fan_lounge_messages immediate;
 alter table public.fan_lounge_messages disable trigger participation_source_change;
 insert into public.fan_lounge_messages(app_user_id,celebrity_id,body,idempotency_key,created_at)values(owner_id,creator_id,'Legacy recovery fixture',extensions.gen_random_uuid(),'2026-01-01T00:00:00Z')returning id into second_id;
 alter table public.fan_lounge_messages enable trigger participation_source_change;
 set constraints wave_mission_evidence_fan_lounge_messages deferred;
 assert not exists(select 1 from public.participation_sources where source_id=second_id);
 perform public.backfill_participation_sources(true);
 assert not exists(select 1 from public.participation_sources where source_id=second_id);
 perform public.backfill_participation_sources(false);
 assert(select kind=4 and origin=1 and desired_active from public.participation_sources where source_id=second_id);
 -- A missed removal is recovered from the current source state with bounded work.
 set constraints wave_mission_evidence_fan_lounge_messages immediate;
 alter table public.fan_lounge_messages disable trigger participation_source_change;
 update public.fan_lounge_messages set removed_at=clock_timestamp()where id=second_id;
 alter table public.fan_lounge_messages enable trigger participation_source_change;
 set constraints wave_mission_evidence_fan_lounge_messages deferred;
 assert(select desired_active from public.participation_sources where source_id=second_id);
 assert public.reconcile_participation_sources(1)=1;
 assert(select not desired_active and revision=2 from public.participation_sources where source_id=second_id);
 -- Stored identities whose source no longer exists are also revoked.
 insert into public.participation_sources(source_namespace,source_id,app_user_id,celebrity_id,source_created_at,source,creator,participant,occurred_at_micros,kind,origin,desired_active)
 values('deleted_fixture',extensions.gen_random_uuid(),owner_id,creator_id,s.source_created_at,'0x'||repeat('8',64),s.creator,s.participant,s.occurred_at_micros,4,1,true)returning id into second_id;
 assert public.reconcile_participation_sources(100)=1;
 assert(select not desired_active and revision=2 from public.participation_sources where id=second_id);
 -- Two orphaned signed batches can replay frozen bytes without a nonce deadlock.
 insert into public.participation_batches(chain_id,contract_address,relayer,items,payload,status,tx_hash,signed_transaction,receipt,inclusion_status,block_number,block_hash)
 values(91342,contract,relayer_address,q.items,q.payload,'COMPLETED',h,'0x1234',receipt,'included',100,bh)returning id into batch_a;
 insert into public.participation_batches(chain_id,contract_address,relayer,items,payload,status,tx_hash,signed_transaction,receipt,inclusion_status,block_number,block_hash)
 values(91342,contract,relayer_address,q.items,q.payload,'COMPLETED',bh,'0x5678',jsonb_build_object('txHash',bh,'blockHash',bh,'blockNumber','100'),'included',100,bh)returning id into batch_b;
 assert public.set_participation_finality(batch_a,bh,'orphaned');
 assert public.set_participation_finality(batch_b,bh,'orphaned');
 select count(*)into n from public.claim_participation_batches('reorg-fixture',20,120);
 assert n>=2;
 assert public.admit_chain_writer('participation',batch_a,'reorg-fixture',91342,relayer_address);
 perform public.release_chain_writer('participation',batch_a,'reorg-fixture',91342,relayer_address);
 assert public.admit_chain_writer('participation',batch_b,'reorg-fixture',91342,relayer_address);
 perform public.release_chain_writer('participation',batch_b,'reorg-fixture',91342,relayer_address);
 insert into public.participation_batches(chain_id,contract_address,relayer,items,status,lease_owner,lease_expires_at)
 values(91342,contract,relayer_address,q.items,'PROCESSING','unsigned-fixture',clock_timestamp()+interval '2 minutes')returning id into batch_unsigned;
 assert not public.admit_chain_writer('participation',batch_unsigned,'unsigned-fixture',91342,relayer_address),'unsigned jobs remain blocked by unresolved frozen submissions';
 assert public.set_participation_finality(batch_a,bh,'orphaned');
 assert(select status='PROCESSING' and lease_owner='reorg-fixture'from public.participation_batches where id=batch_a),'monitor must preserve a live processing lease';
 perform pg_temp.expect_participation_error(format('select public.record_prepared_participation_batch(%L,''stale'',%L,''0x9999'')',batch_a,h),'STALE_JOB_LEASE');


end $$;
rollback;

begin;
\ir wave_stage_upgrade_before.sql
do $$
declare creator_id uuid; q public.participation_batches; n integer; h text:='0x'||repeat('4',64); bh text:='0x'||repeat('5',64);
begin
 select id into strict creator_id from public.celebrities where slug='changha';
 insert into public.fan_lounge_messages(app_user_id,celebrity_id,body,idempotency_key)
 select md5('wave-stage-fixture:1')::uuid,creator_id,'Throughput fixture '||i,extensions.gen_random_uuid() from generate_series(1,25)i;
 update public.participation_config set enabled=true,contract_address='0x'||repeat('2',40),relayer='0x'||repeat('1',40);
 select * into strict q from public.claim_participation_batches('throughput',1,120);
 assert jsonb_array_length(q.items)=20,'one batch must include twenty pending source records';
 q:=public.prepare_participation_batch(q.id,'throughput',jsonb_build_object('version',1,'chainId',91342,'contractAddress',q.contract_address,'items',q.items));
 assert public.admit_chain_writer('participation',q.id,'throughput',91342,q.relayer);
 q:=public.record_prepared_participation_batch(q.id,'throughput',h,'0x1234');
 assert public.complete_participation_batch(q.id,'throughput',jsonb_build_object('txHash',h,'blockHash',bh,'blockNumber','100'));
 perform public.release_chain_writer('participation',q.id,'throughput',91342,q.relayer);
 assert exists(select 1 from public.list_participation_receipts(20)where id=q.id);
 assert public.set_participation_finality(q.id,bh,'finalized');
 assert not exists(select 1 from public.list_participation_receipts(20)where id=q.id),'finalized receipts must leave maintenance rotation';
 select jsonb_array_length(items)into strict n from public.claim_participation_batches('throughput',1,120);
 assert n=5,'remaining sources must be claimed without duplicating in-flight records';
end $$;
rollback;
