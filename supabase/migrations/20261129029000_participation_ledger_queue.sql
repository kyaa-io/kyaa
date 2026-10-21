begin;
create table public.participation_config (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 chain_id bigint not null default 91342 check(chain_id=91342),
 contract_address text check(contract_address ~ '^0x[0-9a-f]{40}$'),
 relayer text check(relayer ~ '^0x[0-9a-f]{40}$'),
 cutover_at timestamptz not null default clock_timestamp(),
 check(not enabled or (contract_address is not null and relayer is not null))
);
insert into public.participation_config(singleton) values(true);
create table public.participation_subjects (
 celebrity_id uuid not null references public.celebrities(id), app_user_id uuid not null references public.app_users(id),
 participant text not null unique default ('0x'||encode(extensions.gen_random_bytes(32),'hex')),
 primary key(celebrity_id,app_user_id),check(participant ~ '^0x[0-9a-f]{64}$')
);
create table public.participation_sources (
 id uuid primary key default extensions.gen_random_uuid(), source_namespace text not null,
 source_id uuid not null,app_user_id uuid not null references public.app_users(id),
 celebrity_id uuid not null references public.celebrities(id),source_created_at timestamptz not null,
 salt bytea not null default extensions.gen_random_bytes(32) check(octet_length(salt)=32),
 source text not null unique check(source ~ '^0x[0-9a-f]{64}$'),
 creator text not null check(creator ~ '^0x[0-9a-f]{64}$'),participant text not null check(participant ~ '^0x[0-9a-f]{64}$'),
 occurred_at_micros numeric(20,0) not null check(occurred_at_micros between 1 and 18446744073709551615),
 kind smallint not null check(kind between 1 and 4),origin smallint not null check(origin in(0,1)),
 desired_active boolean not null,revision bigint not null default 1 check(revision>0),
 acked_revision bigint not null default 0 check(acked_revision>=0 and acked_revision<=revision),
 unique(source_namespace,source_id)
);
create table public.participation_batches (
 id uuid primary key default extensions.gen_random_uuid(),chain_id bigint not null check(chain_id=91342),
 contract_address text not null check(contract_address ~ '^0x[0-9a-f]{40}$'),relayer text not null check(relayer ~ '^0x[0-9a-f]{40}$'),
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 20),payload jsonb,
 status text not null default 'PENDING' check(status in('PENDING','PROCESSING','RETRYING','COMPLETED','FAILED')),
 attempts integer not null default 0,max_attempts integer not null default 10,
 next_attempt_at timestamptz not null default clock_timestamp(),lease_owner text,lease_expires_at timestamptz,
 tx_hash text check(tx_hash ~ '^0x[0-9a-f]{64}$'),signed_transaction text check(signed_transaction ~ '^0x[0-9a-f]+$'),
 receipt jsonb,inclusion_status text check(inclusion_status in('included','safe','finalized','orphaned')),
 block_number numeric(78,0) check(block_number>=0),block_hash text check(block_hash ~ '^0x[0-9a-f]{64}$'),verified_at timestamptz,
 last_error_code text,last_error_message text,created_at timestamptz not null default clock_timestamp(),
 check((status='PROCESSING')=(lease_owner is not null and lease_expires_at is not null)),
 check((tx_hash is null and signed_transaction is null) or(tx_hash is not null and signed_transaction is not null and payload is not null))
);
create table public.participation_batch_items (
 batch_id uuid not null references public.participation_batches(id),source_row_id uuid not null references public.participation_sources(id),
 revision bigint not null,active boolean not null,primary key(batch_id,source_row_id)
);
create table public.participation_receipt_history (
 id bigint generated always as identity primary key,batch_id uuid not null references public.participation_batches(id),
 previous_receipt jsonb not null,previous_inclusion_status text not null,recorded_at timestamptz not null default clock_timestamp()
);
-- The same pinned campaigns and live events as the stage presentation.
create view public.participation_current_sources as
with targets as (
 select c.id,c.slug,p.live from(values
 ('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb'::uuid,'fde5ff1b-ac41-4c20-902b-034cba972023'::uuid,'changha'),
 ('c3930f7f-bd2b-4e58-8cec-b3c61f8463fe'::uuid,'45fcead7-24f3-46aa-98ce-84dfe8c8e75b'::uuid,'wena')
 )p(campaign,live,slug) join public.live_benefit_campaigns b on b.id=p.campaign and b.live_event_id=p.live
 join public.live_events l on l.id=p.live join public.celebrities c on c.id=l.celebrity_id and c.slug=p.slug
), sources as (
 select 'live_reservations'::text source_namespace,r.id source_id,r.app_user_id,c.id celebrity_id,c.slug,r.reserved_at source_created_at,1::smallint kind,true valid
 from targets c join public.live_reservations r on r.live_event_id=c.live
 union all select 'fan_passports',p.id,p.app_user_id,c.id,c.slug,p.issued_at,2,p.business_status='issued' from targets c join public.fan_passports p on p.celebrity_id=c.id
 union all select 'fan_reactions',r.id,r.app_user_id,c.id,c.slug,r.completed_at,3,r.business_status='completed' from targets c join public.fan_reactions r on r.celebrity_id=c.id
 union all select 'fan_lounge_messages',m.id,m.app_user_id,c.id,c.slug,m.created_at,4,m.removed_at is null and length(btrim(m.body))>0 from targets c join public.fan_lounge_messages m on m.celebrity_id=c.id
)
select s.*,s.valid and u.status='active' desired_active from sources s join public.app_users u on u.id=s.app_user_id where s.source_created_at is not null;

create function public.sync_participation_source(p_namespace text,p_source_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v record;q public.participation_sources;who text;salt_value bytea:=extensions.gen_random_bytes(32);cutover timestamptz;owner_id uuid;
begin
 -- Serialize status transitions with every source capture before taking source locks.
 select app_user_id into owner_id from public.participation_current_sources where source_namespace=p_namespace and source_id=p_source_id;
 if owner_id is null then select app_user_id into owner_id from public.participation_sources where source_namespace=p_namespace and source_id=p_source_id;end if;
 perform 1 from public.app_users where id=owner_id for share;
 perform pg_advisory_xact_lock(hashtextextended('participation:'||p_namespace||':'||p_source_id,0));
 select * into q from public.participation_sources where source_namespace=p_namespace and source_id=p_source_id for update;
 select * into v from public.participation_current_sources where source_namespace=p_namespace and source_id=p_source_id;
 if not found then
  if q.id is not null and q.desired_active then update public.participation_sources set desired_active=false,revision=revision+1 where id=q.id;end if;
  return;
 end if;
 if q.id is not null then
  if q.app_user_id<>v.app_user_id or q.celebrity_id<>v.celebrity_id or q.source_created_at<>v.source_created_at or q.kind<>v.kind then raise exception 'PARTICIPATION_IDENTITY_CONFLICT';end if;
  if q.desired_active is distinct from v.desired_active then update public.participation_sources set desired_active=v.desired_active,revision=revision+1 where id=q.id;end if;
  return;
 end if;
 insert into public.participation_subjects(celebrity_id,app_user_id) values(v.celebrity_id,v.app_user_id) on conflict do nothing;
 select participant into strict who from public.participation_subjects where celebrity_id=v.celebrity_id and app_user_id=v.app_user_id;
 select cutover_at into strict cutover from public.participation_config;
 -- Fixed encoding: domain UTF8 + NUL + namespace UTF8 + NUL + UUID bytes + owner UUID + creator UUID + int64 epoch micros + private 32-byte salt.
 insert into public.participation_sources(source_namespace,source_id,app_user_id,celebrity_id,source_created_at,salt,source,creator,participant,occurred_at_micros,kind,origin,desired_active)
 values(v.source_namespace,v.source_id,v.app_user_id,v.celebrity_id,v.source_created_at,salt_value,
 '0x'||encode(extensions.digest(convert_to('BYUS_PARTICIPATION_V1','UTF8')||decode('00','hex')||convert_to(v.source_namespace,'UTF8')||decode('00','hex')||uuid_send(v.source_id)||uuid_send(v.app_user_id)||uuid_send(v.celebrity_id)||int8send((extract(epoch from v.source_created_at)*1000000)::bigint)||salt_value,'sha256'),'hex'),
 '0x'||rpad(encode(convert_to(v.slug,'UTF8'),'hex'),64,'0'),who,(extract(epoch from v.source_created_at)*1000000)::bigint,v.kind,case when v.source_created_at<cutover then 1 else 0 end,v.desired_active);
end $$;
create function public.capture_participation_source() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.sync_participation_source(tg_table_name,case when tg_op='DELETE' then old.id else new.id end);
 return null;
end $$;
do $$declare t text;begin foreach t in array array['live_reservations','fan_passports','fan_reactions','fan_lounge_messages']loop
 execute format('create trigger participation_source_change after insert or update or delete on public.%I for each row execute function public.capture_participation_source()',t);end loop;end $$;
create function public.capture_participation_user() returns trigger language plpgsql security definer set search_path='' as $$
declare r record;begin
 if new.status is distinct from old.status then
 for r in select source_namespace,source_id from public.participation_current_sources where app_user_id=new.id order by source_namespace,source_id loop
 perform public.sync_participation_source(r.source_namespace,r.source_id);end loop;
 end if;return null;
end $$;
create trigger participation_user_status after update of status on public.app_users for each row execute function public.capture_participation_user();
create function public.backfill_participation_sources(p_dry_run boolean default true) returns bigint language plpgsql security definer set search_path='' as $$
declare r record;n bigint:=0;begin
 if p_dry_run is null then raise exception 'PARTICIPATION_INVALID';end if;
 for r in select source_namespace,source_id from public.participation_current_sources order by source_namespace,source_id loop
 n:=n+1;if not p_dry_run then perform public.sync_participation_source(r.source_namespace,r.source_id);end if;end loop;return n;
end $$;

create function public.reconcile_participation_sources(p_limit integer default 100)returns integer language plpgsql security definer set search_path='' as $$
declare r record;n integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 500 then raise exception 'PARTICIPATION_INVALID';end if;
 for r in
 select coalesce(c.source_namespace,s.source_namespace) source_namespace,coalesce(c.source_id,s.source_id) source_id
 from public.participation_current_sources c full join public.participation_sources s using(source_namespace,source_id)
 cross join public.participation_config cfg
 where(s.id is not null and s.desired_active is distinct from coalesce(c.desired_active,false))
 or(s.id is null and c.source_created_at>=cfg.cutover_at)
 order by 1,2 limit p_limit
 loop perform public.sync_participation_source(r.source_namespace,r.source_id);n:=n+1;end loop;
 return n;
end $$;

create function public.reject_participation_mutation() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'PARTICIPATION_IMMUTABLE';end if;
 if tg_table_name='participation_sources' then
 if (to_jsonb(new)-array['desired_active','revision','acked_revision']) is distinct from(to_jsonb(old)-array['desired_active','revision','acked_revision'])
 or new.revision<old.revision or new.acked_revision<old.acked_revision
 or (new.desired_active is distinct from old.desired_active and new.revision<>old.revision+1) then raise exception 'PARTICIPATION_IMMUTABLE';end if;
 elsif tg_table_name='participation_batches' then
 if(to_jsonb(new)-array['payload','status','attempts','next_attempt_at','lease_owner','lease_expires_at','tx_hash','signed_transaction','receipt','inclusion_status','block_number','block_hash','verified_at','last_error_code','last_error_message']) is distinct from
 (to_jsonb(old)-array['payload','status','attempts','next_attempt_at','lease_owner','lease_expires_at','tx_hash','signed_transaction','receipt','inclusion_status','block_number','block_hash','verified_at','last_error_code','last_error_message'])
 or(old.payload is not null and new.payload is distinct from old.payload)
 or(old.signed_transaction is not null and(new.tx_hash is distinct from old.tx_hash or new.signed_transaction is distinct from old.signed_transaction)) then raise exception 'PARTICIPATION_IMMUTABLE';end if;
 if old.receipt is not null and(new.receipt is distinct from old.receipt or new.inclusion_status is distinct from old.inclusion_status) then insert into public.participation_receipt_history(batch_id,previous_receipt,previous_inclusion_status)values(old.id,old.receipt,old.inclusion_status);end if;
 elsif tg_table_name='participation_config' then
 if new.cutover_at is distinct from old.cutover_at then raise exception 'PARTICIPATION_IMMUTABLE';end if;
 else if new is distinct from old then raise exception 'PARTICIPATION_IMMUTABLE';end if;end if;
 return new;
end $$;
do $$declare t text;begin foreach t in array array['participation_config','participation_subjects','participation_sources','participation_batches','participation_batch_items','participation_receipt_history']loop
 execute format('create trigger participation_immutable before update or delete on public.%I for each row execute function public.reject_participation_mutation()',t);end loop;end $$;

create function public.claim_participation_batches(p_worker_id text,p_batch_size integer,p_lease_seconds integer) returns setof public.participation_batches language plpgsql security definer set search_path='' as $$
declare cfg public.participation_config;q public.participation_batches;ids uuid[];frozen jsonb;
begin
 if nullif(btrim(p_worker_id),'') is null or p_batch_size is null or p_batch_size not between 1 and 20 or p_lease_seconds is null or p_lease_seconds not between 30 and 900 then raise exception 'PARTICIPATION_INVALID_LEASE';end if;
 select * into strict cfg from public.participation_config;
 if not cfg.enabled then return;end if;
 -- Serialize creation only; workers still claim existing batches with SKIP LOCKED.
 perform pg_advisory_xact_lock(hashtextextended('participation-batch',0));
 -- Four fresh source writes fit the worker gas cap, including distinct actor/day counters.
 select array_agg(id) into ids from(select s.id from public.participation_sources s where s.revision>s.acked_revision and not exists(
 select 1 from public.participation_batch_items i join public.participation_batches b on b.id=i.batch_id where i.source_row_id=s.id and(b.status<>'COMPLETED' or b.inclusion_status='orphaned')) order by s.id for update skip locked limit 4)s;
 if cardinality(ids)>0 then
 select jsonb_agg(jsonb_build_object('source',source,'creator',creator,'participant',participant,'occurredAtMicros',occurred_at_micros::text,'revision',revision::text,'kind',kind,'origin',origin,'active',desired_active) order by id) into frozen from public.participation_sources where id=any(ids);
 insert into public.participation_batches(chain_id,contract_address,relayer,items)values(cfg.chain_id,cfg.contract_address,cfg.relayer,frozen)returning * into q;
 insert into public.participation_batch_items select q.id,id,revision,desired_active from public.participation_sources where id=any(ids);
 end if;
 return query with c as(select id from public.participation_batches where((status in('PENDING','RETRYING') and next_attempt_at<=clock_timestamp()) or(status='PROCESSING' and lease_expires_at<=clock_timestamp())) and(attempts<max_attempts or signed_transaction is not null) order by(signed_transaction is not null)desc,created_at,id for update skip locked limit p_batch_size)
 update public.participation_batches b set status='PROCESSING',attempts=b.attempts+1,lease_owner=p_worker_id,lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds)from c where b.id=c.id returning b.*;
end $$;
create function public.prepare_participation_batch(p_job_id uuid,p_worker_id text,p_payload jsonb)returns public.participation_batches language plpgsql security definer set search_path='' as $$
declare q public.participation_batches;begin
 select * into q from public.participation_batches where id=p_job_id and status='PROCESSING' and lease_owner=p_worker_id and lease_expires_at>clock_timestamp()for update;
 if not found then raise exception 'STALE_JOB_LEASE';end if;
 if p_payload is distinct from jsonb_build_object('version',1,'chainId',q.chain_id,'contractAddress',q.contract_address,'items',q.items) then raise exception 'PARTICIPATION_PAYLOAD_MISMATCH';end if;
 update public.participation_batches set payload=p_payload where id=q.id returning * into q;return q;
end $$;
create function public.admit_participation_dispatch(p_job_id uuid,p_worker_id text)returns boolean language plpgsql security definer set search_path='' as $$
declare q public.participation_batches;begin
 select * into q from public.participation_batches where id=p_job_id and status='PROCESSING' and lease_owner=p_worker_id and lease_expires_at>clock_timestamp();
 if not found then return false;end if;
 return exists(select 1 from public.chain_writer_leases where chain_id=q.chain_id and relayer=q.relayer and job_family='participation' and job_id=q.id and worker_id=p_worker_id and expires_at>clock_timestamp());
end $$;
create function public.record_prepared_participation_batch(p_job_id uuid,p_worker_id text,p_tx_hash text,p_signed_transaction text)returns public.participation_batches language plpgsql security definer set search_path='' as $$
declare q public.participation_batches;binding record;begin
 select chain_id,relayer into strict binding from public.participation_batches where id=p_job_id;
 perform pg_advisory_xact_lock(hashtextextended('chain-writer:'||binding.chain_id||':'||binding.relayer,0));
 select * into q from public.participation_batches where id=p_job_id and status='PROCESSING' and lease_owner=p_worker_id and lease_expires_at>clock_timestamp()for update;
 if not found then raise exception 'STALE_JOB_LEASE';end if;
 if q.payload is null or p_tx_hash is null or p_signed_transaction is null then raise exception 'PARTICIPATION_NOT_PREPARED';end if;
 if not public.admit_participation_dispatch(p_job_id,p_worker_id)then raise exception 'CHAIN_WRITER_LEASE_LOST';end if;
 update public.participation_batches set tx_hash=p_tx_hash,signed_transaction=p_signed_transaction where id=q.id returning * into q;return q;
end $$;
create function public.complete_participation_batch(p_job_id uuid,p_worker_id text,p_receipt jsonb)returns boolean language plpgsql security definer set search_path='' as $$
declare q public.participation_batches;begin
 select * into q from public.participation_batches where id=p_job_id and status='PROCESSING' and lease_owner=p_worker_id and lease_expires_at>clock_timestamp()for update;
 if not found then return false;end if;
 if q.signed_transaction is null or p_receipt->>'txHash' is distinct from q.tx_hash or p_receipt->>'blockHash' is null or p_receipt->>'blockNumber' is null then raise exception 'PARTICIPATION_RECEIPT_MISMATCH';end if;
 update public.participation_batches set status='COMPLETED',lease_owner=null,lease_expires_at=null,receipt=p_receipt,inclusion_status='included',block_number=(p_receipt->>'blockNumber')::numeric,block_hash=p_receipt->>'blockHash',verified_at=clock_timestamp()where id=q.id;
 update public.participation_sources s set acked_revision=greatest(s.acked_revision,i.revision)from public.participation_batch_items i where i.batch_id=q.id and i.source_row_id=s.id;
 return true;
end $$;
create function public.retry_participation_batch(p_job_id uuid,p_worker_id text,p_error_code text,p_error_message text,p_retry_seconds integer default 60)returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_retry_seconds is null or p_retry_seconds not between 0 and 86400 then raise exception 'PARTICIPATION_INVALID';end if;
 update public.participation_batches set status=case when attempts>=max_attempts and signed_transaction is null then 'FAILED' else 'RETRYING'end,lease_owner=null,lease_expires_at=null,next_attempt_at=clock_timestamp()+make_interval(secs=>p_retry_seconds),last_error_code=left(p_error_code,100),last_error_message=left(p_error_message,1000)
 where id=p_job_id and status='PROCESSING' and lease_owner=p_worker_id and lease_expires_at>clock_timestamp();return found;
end $$;
create function public.list_participation_receipts(p_limit integer default 100)returns setof public.participation_batches language sql security definer set search_path='' as $$
 select * from public.participation_batches where receipt is not null order by verified_at,id limit greatest(1,least(coalesce(p_limit,100),500));
$$;
create function public.set_participation_finality(p_job_id uuid,p_expected_block_hash text,p_status text)returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_status is null or p_status not in('included','safe','finalized','orphaned')then raise exception 'PARTICIPATION_INVALID_FINALITY';end if;
 update public.participation_batches set inclusion_status=p_status,verified_at=clock_timestamp(),status=case when p_status='orphaned' and status<>'PROCESSING' then 'RETRYING' else status end,next_attempt_at=case when p_status='orphaned' then clock_timestamp() else next_attempt_at end where id=p_job_id and block_hash=p_expected_block_hash and receipt is not null;return found;
end $$;
create function public.replace_participation_receipt(p_job_id uuid,p_expected_block_hash text,p_receipt jsonb)returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_receipt->>'blockHash' is null or p_receipt->>'blockNumber' is null then raise exception 'PARTICIPATION_RECEIPT_MISMATCH';end if;
 update public.participation_batches set receipt=p_receipt,block_hash=p_receipt->>'blockHash',block_number=(p_receipt->>'blockNumber')::numeric,inclusion_status='included',verified_at=clock_timestamp()where id=p_job_id and block_hash=p_expected_block_hash and inclusion_status='orphaned' and tx_hash=p_receipt->>'txHash';return found;
end $$;

alter table public.chain_writer_leases drop constraint chain_writer_leases_job_family_check;
alter table public.chain_writer_leases add constraint chain_writer_leases_job_family_check check(job_family in('legacy','fan_action','participation'));
create or replace function public.defer_chain_writer(p_job_family text,p_job_id uuid,p_worker_id text)
returns void language plpgsql set search_path='' as $$
begin
  if p_job_family='participation' then
    update public.participation_batches set status='RETRYING',attempts=greatest(attempts-1,0),next_attempt_at=clock_timestamp()+interval '5 seconds',lease_owner=null,lease_expires_at=null,last_error_code='CHAIN_WRITER_BUSY' where id=p_job_id and status='PROCESSING' and lease_owner=p_worker_id and lease_expires_at>clock_timestamp();
  elsif p_job_family='fan_action' then
    update public.fan_action_outbox set status='RETRYING',attempts=greatest(attempts-1,0),
      next_attempt_at=clock_timestamp()+interval '5 seconds',lease_owner=null,lease_expires_at=null,
      last_error_code='CHAIN_WRITER_BUSY',last_error_message='Another signing operation requires reconciliation'
      where id=p_job_id and status='PROCESSING' and lease_owner=p_worker_id and lease_expires_at>clock_timestamp();
  elsif p_job_family='legacy' then
    update public.blockchain_jobs set status='RETRYING',attempts=greatest(attempts-1,0),
      next_attempt_at=clock_timestamp()+interval '5 seconds',lease_owner=null,lease_expires_at=null,
      last_error_code='CHAIN_WRITER_BUSY',last_error_message='Another signing operation requires reconciliation'
      where id=p_job_id and status='PROCESSING' and lease_owner=p_worker_id and lease_expires_at>clock_timestamp();
  end if;
end $$;

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
  if not signed_current and (exists(select 1 from public.participation_batches q where q.chain_id=p_chain_id and q.relayer=p_relayer and q.signed_transaction is not null and(q.status<>'COMPLETED' or q.inclusion_status='orphaned') and not(p_job_family='participation' and q.id=p_job_id))
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

create or replace function public.record_prepared_fan_action_job(p_job_id uuid,p_worker_id text,p_tx_hash text,p_signed_transaction text)
returns public.fan_action_outbox language plpgsql security definer set search_path='' as $$
declare q public.fan_action_outbox;binding record;
begin
  select b.chain_id,case when j.operation_kind='import_historical' then b.migrator_relayer else b.relayer end relayer
    into strict binding from public.fan_action_outbox j join public.fan_action_bindings b on b.id=j.binding_id where j.id=p_job_id;
  perform pg_advisory_xact_lock(hashtextextended('chain-writer:'||binding.chain_id||':'||binding.relayer,0));
  select * into q from public.fan_action_outbox where id=p_job_id and status='PROCESSING'
    and lease_owner=p_worker_id and lease_expires_at>clock_timestamp() for update;
  if not found then raise exception 'STALE_JOB_LEASE'; end if;
  if q.signed_transaction is not null then
    if q.tx_hash is distinct from p_tx_hash or q.signed_transaction is distinct from p_signed_transaction then
      raise exception 'FAN_ACTION_SIGNED_CONFLICT'; end if;
    return q;
  end if;
  if q.payload is null or p_tx_hash is null or p_signed_transaction is null then raise exception 'FAN_ACTION_NOT_PREPARED'; end if;
  if not exists(select 1 from public.chain_writer_leases l join public.fan_action_bindings b
    on b.chain_id=l.chain_id and (case when q.operation_kind='import_historical' then b.migrator_relayer else b.relayer end)=l.relayer where b.id=q.binding_id
    and l.job_family='fan_action' and l.job_id=q.id and l.worker_id=p_worker_id and l.expires_at>clock_timestamp()) then
    raise exception 'CHAIN_WRITER_LEASE_LOST'; end if;
  update public.fan_action_outbox set tx_hash=p_tx_hash,signed_transaction=p_signed_transaction
    where id=p_job_id returning * into q;
  return q;
end $$;


create or replace function public.record_prepared_blockchain_job(
  p_job_id uuid,
  p_worker_id text,
  p_tx_hash text,
  p_signed_transaction text
)
returns public.blockchain_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.blockchain_jobs;
  binding public.chain_writer_leases;
begin
  if p_tx_hash is null or p_tx_hash !~ '^0x[0-9a-fA-F]{64}$' then
    raise exception 'transaction hash must be a 32-byte hex value';
  end if;
  if p_signed_transaction is null or p_signed_transaction !~ '^0x[0-9a-fA-F]+$'
     or length(p_signed_transaction) > 262144 then
    raise exception 'signed transaction must be bounded hex data';
  end if;

  select * into binding from public.chain_writer_leases where job_family='legacy' and job_id=p_job_id and worker_id=p_worker_id;
  if not found then raise exception 'CHAIN_WRITER_LEASE_LOST';end if;
  perform pg_advisory_xact_lock(hashtextextended('chain-writer:'||binding.chain_id||':'||binding.relayer,0));
  if not exists(select 1 from public.chain_writer_leases where chain_id=binding.chain_id and relayer=binding.relayer
    and job_family='legacy' and job_id=p_job_id and worker_id=p_worker_id and expires_at>clock_timestamp()) then
    raise exception 'CHAIN_WRITER_LEASE_LOST';end if;
  update public.blockchain_jobs
  set tx_hash = p_tx_hash,
      payload = jsonb_set(
        payload,
        '{workerSubmission}',
        jsonb_build_object(
          'txHash', p_tx_hash,
          'signedTransaction', p_signed_transaction
        ),
        true
      )
  where id = p_job_id
    and status = 'PROCESSING'
    and lease_owner = p_worker_id
    and lease_expires_at > clock_timestamp()
    and (tx_hash is null or tx_hash = p_tx_hash)
    and (payload->'workerSubmission'->>'signedTransaction' is null
      or payload->'workerSubmission'->>'signedTransaction'=p_signed_transaction)
  returning * into result;

  if result.id is null then
    raise exception 'job lease is not active for this worker or transaction hash conflicts';
  end if;
  return result;
end;
$$;


create function public.wave_stage_participation_activity() returns table(source_namespace text,source_id uuid,app_user_id uuid,celebrity_id uuid,slug text,occurred_at timestamptz,kind smallint,active boolean)
language sql stable security definer set search_path='' as $$
 select source_namespace,source_id,app_user_id,celebrity_id,slug,source_created_at,kind,desired_active from public.participation_current_sources;
$$;
do $$declare t text;f record;begin
 foreach t in array array['participation_config','participation_subjects','participation_sources','participation_batches','participation_batch_items','participation_receipt_history']loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);end loop;
 revoke all on public.participation_current_sources from public,anon,authenticated,service_role;
 for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and(proname like '%participation%' and proname in('sync_participation_source','capture_participation_source','capture_participation_user','backfill_participation_sources','reconcile_participation_sources','reject_participation_mutation','claim_participation_batches','prepare_participation_batch','admit_participation_dispatch','record_prepared_participation_batch','complete_participation_batch','retry_participation_batch','list_participation_receipts','set_participation_finality','replace_participation_receipt','wave_stage_participation_activity'))loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.proname not in('sync_participation_source','capture_participation_source','capture_participation_user','reject_participation_mutation')then execute format('grant execute on function %s to service_role',f.signature);end if;end loop;
end $$;
commit;
