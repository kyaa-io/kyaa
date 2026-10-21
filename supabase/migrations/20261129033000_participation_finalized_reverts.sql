-- A finalized reverted transaction consumed its nonce but acknowledged no participation.
create function public.fail_reverted_participation_batch(p_job_id uuid,p_worker_id text,p_receipt jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare q public.participation_batches;
begin
 select * into q from public.participation_batches where id=p_job_id and status='PROCESSING' and lease_owner=p_worker_id and lease_expires_at>clock_timestamp() for update;
 if not found then return false; end if;
 if q.signed_transaction is null or q.tx_hash is null or q.payload is null
  or p_receipt->>'txHash' is distinct from q.tx_hash
  or p_receipt->>'outcome' is distinct from 'reverted'
  or p_receipt->>'inclusionStatus' is distinct from 'finalized'
  or coalesce(p_receipt->>'blockHash','') !~ '^0x[0-9a-fA-F]{64}$'
  or coalesce(p_receipt->>'blockNumber','') !~ '^[0-9]{1,78}$'
  or coalesce(p_receipt->>'transactionIndex','') !~ '^[0-9]{1,10}$'
 then raise exception 'PARTICIPATION_RECEIPT_MISMATCH'; end if;
 update public.participation_batches set status='FAILED',lease_owner=null,lease_expires_at=null,
  receipt=p_receipt,inclusion_status='finalized',block_number=(p_receipt->>'blockNumber')::numeric,
  block_hash=p_receipt->>'blockHash',verified_at=clock_timestamp(),
  last_error_code='PARTICIPATION_REVERTED',last_error_message='Finalized participation transaction reverted; manual recovery required'
 where id=q.id;
 return true;
end $$;
revoke all on function public.fail_reverted_participation_batch(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.fail_reverted_participation_batch(uuid,text,jsonb) to service_role;

create or replace function public.admit_chain_writer(p_job_family text,p_job_id uuid,p_worker_id text,p_chain_id bigint,p_relayer text,p_lease_seconds integer default 120)
returns boolean language plpgsql security definer set search_path='' as $$
declare active_job boolean; acquired boolean; signed_current boolean;
begin
  if p_job_family is null or p_job_family not in ('legacy','fan_action','participation') or p_relayer !~ '^0x[0-9a-f]{40}$'
    or p_chain_id<>91342 or p_lease_seconds not between 30 and 900 then raise exception 'CHAIN_WRITER_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chain-writer:'||p_chain_id||':'||p_relayer,0));
  if p_job_family='participation' then
    select exists(select 1 from public.participation_batches where id=p_job_id and status='PROCESSING' and lease_owner=p_worker_id and lease_expires_at>clock_timestamp() and chain_id=p_chain_id and relayer=p_relayer) into active_job;
  elsif p_job_family='legacy' then
    select exists(select 1 from public.blockchain_jobs where id=p_job_id and status='PROCESSING' and lease_owner=p_worker_id
      and lease_expires_at>clock_timestamp()) into active_job;
  else
    select exists(select 1 from public.fan_action_outbox q join public.fan_action_bindings b on b.id=q.binding_id
      where q.id=p_job_id and q.status='PROCESSING' and q.lease_owner=p_worker_id and q.lease_expires_at>clock_timestamp()
        and b.chain_id=p_chain_id and (case when q.operation_kind='import_historical' then b.migrator_relayer else b.relayer end)=p_relayer) into active_job;
  end if;
  if not active_job then raise exception 'STALE_JOB_LEASE'; end if;
  signed_current:=case p_job_family
   when 'participation' then exists(select 1 from public.participation_batches where id=p_job_id and signed_transaction is not null)
   when 'fan_action' then exists(select 1 from public.fan_action_outbox where id=p_job_id and signed_transaction is not null)
   else exists(select 1 from public.blockchain_jobs where id=p_job_id and payload->'workerSubmission'->>'signedTransaction' is not null)end;
  -- Frozen signed bytes may be replayed while another durable nonce awaits recovery.
  -- A persisted transaction with unresolved inclusion can still consume its nonce.
  -- Even FAILED jobs remain blockers until explicit receipt recovery resolves them.
  if not signed_current and (exists(select 1 from public.participation_batches q where q.chain_id=p_chain_id and q.relayer=p_relayer and q.signed_transaction is not null and(q.status<>'COMPLETED' or q.inclusion_status='orphaned') and not coalesce(q.status='FAILED' and q.inclusion_status='finalized' and q.receipt->>'outcome'='reverted' and q.receipt->>'txHash'=q.tx_hash,false) and not(p_job_family='participation' and q.id=p_job_id))
    or exists(select 1 from public.fan_action_outbox q join public.fan_action_bindings b on b.id=q.binding_id
    where b.chain_id=p_chain_id and (case when q.operation_kind='import_historical' then b.migrator_relayer else b.relayer end)=p_relayer and q.signed_transaction is not null
      and q.status<>'COMPLETED' and not(p_job_family='fan_action' and q.id=p_job_id))
    or exists(select 1 from public.blockchain_jobs q where q.payload->'workerSubmission'->>'signedTransaction' is not null
      and q.status<>'COMPLETED' and not(p_job_family='legacy' and q.id=p_job_id))) then
    perform public.defer_chain_writer(p_job_family,p_job_id,p_worker_id); return false; end if;
  insert into public.chain_writer_leases as l(chain_id,relayer,job_family,job_id,worker_id,expires_at)
    values(p_chain_id,p_relayer,p_job_family,p_job_id,p_worker_id,clock_timestamp()+make_interval(secs=>p_lease_seconds))
    on conflict(chain_id,relayer) do update set job_family=excluded.job_family,job_id=excluded.job_id,
      worker_id=excluded.worker_id,expires_at=excluded.expires_at
    where l.expires_at<=clock_timestamp() or (l.job_family=p_job_family and l.job_id=p_job_id and l.worker_id=p_worker_id)
    returning true into acquired;
  if not coalesce(acquired,false) then perform public.defer_chain_writer(p_job_family,p_job_id,p_worker_id); end if;
  return coalesce(acquired,false);
end $$;

create or replace function public.set_participation_finality(p_job_id uuid,p_expected_block_hash text,p_status text)returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_status is null or p_status not in('included','safe','finalized','orphaned')then raise exception 'PARTICIPATION_INVALID_FINALITY';end if;
 update public.participation_batches set inclusion_status=p_status,verified_at=clock_timestamp(),status=case when p_status='orphaned' and status<>'PROCESSING' then 'RETRYING' else status end,next_attempt_at=case when p_status='orphaned' then clock_timestamp() else next_attempt_at end where id=p_job_id and block_hash=p_expected_block_hash and receipt is not null and not coalesce(status='FAILED' and inclusion_status='finalized' and receipt->>'outcome'='reverted',false);return found;
end $$;

create or replace function public.read_admin_wave_stage_participation(
 p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_scope text default 'all'
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare as_of timestamptz:=statement_timestamp();from_at timestamptz;to_at timestamptz;result jsonb;targets jsonb;snapshot public.participation_count_snapshot;
begin
 begin perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
 exception when others then raise exception 'FAN_WEB_FORBIDDEN';end;
 if p_scope is null or p_scope not in('all','event-day') then raise exception 'FAN_WEB_INVALID_INPUT';end if;
 from_at:=case when p_scope='event-day' then '2026-10-21T15:00:00Z'::timestamptz else null end;
 to_at:=case when p_scope='event-day' then least(as_of,'2026-10-22T15:00:00Z'::timestamptz) else as_of end;
 select jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'name',coalesce(nullif(btrim(loc.name),''),c.slug)) order by c.slug) into targets
 from(values ('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb'::uuid,'fde5ff1b-ac41-4c20-902b-034cba972023'::uuid,'changha'),
  ('c3930f7f-bd2b-4e58-8cec-b3c61f8463fe'::uuid,'45fcead7-24f3-46aa-98ce-84dfe8c8e75b'::uuid,'wena')) pinned(campaign,live,slug)
 join public.live_benefit_campaigns b on b.id=pinned.campaign and b.live_event_id=pinned.live
 join public.live_events l on l.id=pinned.live join public.celebrities c on c.id=l.celebrity_id and c.slug=pinned.slug
 left join public.celebrity_localizations loc on loc.celebrity_id=c.id and loc.locale='ko';
 if coalesce(jsonb_array_length(targets),0)<>2 then raise exception 'FAN_WEB_UNAVAILABLE';end if;
 select s.* into snapshot from public.participation_count_snapshot s join public.participation_config c on c.contract_address=s.contract_address;
 with creators as(select * from jsonb_to_recordset(targets) as t(id uuid,slug text,name text)),
 activity as(select a.* from public.wave_stage_participation_activity() a
  where (from_at is null or a.occurred_at>=from_at) and a.occurred_at<to_at),
 active_activity as(select * from activity where active),
 outstanding as(
  select a.celebrity_id,a.source_namespace,a.source_id,
   exists(select 1 from public.participation_batch_items i join public.participation_batches b on b.id=i.batch_id
    where i.source_row_id=s.id and b.status='FAILED') failed
  from activity a left join public.participation_sources s on s.source_namespace=a.source_namespace and s.source_id=a.source_id
  where (a.active or s.id is not null) and not exists(
   select 1 from public.participation_batch_items i join public.participation_batches b on b.id=i.batch_id
   where i.source_row_id=s.id and i.revision=s.revision and i.active=a.active and b.status='COMPLETED' and b.inclusion_status='finalized'
    and snapshot.finalized_block_number is not null and b.block_number<=snapshot.finalized_block_number)
 ) select jsonb_build_object('asOf',as_of,'scope',p_scope,'from',from_at,'to',to_at,'eventDate','2026-10-22',
 'creators',(select jsonb_agg(jsonb_build_object('slug',c.slug,'name',c.name,
  'reservations',(select count(*) from active_activity a where a.celebrity_id=c.id and a.kind=1),
  'passports',(select count(*) from active_activity a where a.celebrity_id=c.id and a.kind=2),
  'likes',(select count(*) from active_activity a where a.celebrity_id=c.id and a.kind=3),
  'comments',(select count(*) from active_activity a where a.celebrity_id=c.id and a.kind=4),
  'engagedFans',(select count(distinct app_user_id) from active_activity a where a.celebrity_id=c.id),
  'pending',(select count(*) from outstanding o where o.celebrity_id=c.id and not o.failed),
  'failed',(select count(*) from outstanding o where o.celebrity_id=c.id and o.failed)
 ) order by c.slug) from creators c),
 'onchain',case when snapshot.singleton is null then jsonb_build_object('state','unavailable') else
  jsonb_build_object('state','available','contractAddress',snapshot.contract_address,'blockNumber',snapshot.block_number::text,
   'blockHash',snapshot.block_hash,'observedAt',snapshot.observed_at,'finality',snapshot.finality,'finalizedBlockNumber',snapshot.finalized_block_number::text,
   'creators',(select jsonb_agg(value-'scope' order by value->>'slug') from jsonb_array_elements(snapshot.counts) where value->>'scope'=p_scope)) end
 ) into result;
 return result;
end $$;
