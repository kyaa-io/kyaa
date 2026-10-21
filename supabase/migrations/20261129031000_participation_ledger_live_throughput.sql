create or replace function public.claim_participation_batches(p_worker_id text,p_batch_size integer,p_lease_seconds integer) returns setof public.participation_batches language plpgsql security definer set search_path='' as $$
declare cfg public.participation_config;q public.participation_batches;ids uuid[];frozen jsonb;
begin
 if nullif(btrim(p_worker_id),'') is null or p_batch_size is null or p_batch_size not between 1 and 20 or p_lease_seconds is null or p_lease_seconds not between 30 and 900 then raise exception 'PARTICIPATION_INVALID_LEASE';end if;
 select * into strict cfg from public.participation_config;
 if not cfg.enabled then return;end if;
 -- Serialize creation only; workers still claim existing batches with SKIP LOCKED.
 perform pg_advisory_xact_lock(hashtextextended('participation-batch',0));
 -- Twenty fresh actor/day writes fit the dedicated participation gas cap.
 select array_agg(id) into ids from(select s.id from public.participation_sources s where s.revision>s.acked_revision and not exists(
 select 1 from public.participation_batch_items i join public.participation_batches b on b.id=i.batch_id where i.source_row_id=s.id and(b.status<>'COMPLETED' or b.inclusion_status='orphaned')) order by s.id for update skip locked limit 20)s;
 if cardinality(ids)>0 then
 select jsonb_agg(jsonb_build_object('source',source,'creator',creator,'participant',participant,'occurredAtMicros',occurred_at_micros::text,'revision',revision::text,'kind',kind,'origin',origin,'active',desired_active) order by id) into frozen from public.participation_sources where id=any(ids);
 insert into public.participation_batches(chain_id,contract_address,relayer,items)values(cfg.chain_id,cfg.contract_address,cfg.relayer,frozen)returning * into q;
 insert into public.participation_batch_items select q.id,id,revision,desired_active from public.participation_sources where id=any(ids);
 end if;
 return query with c as(select id from public.participation_batches where((status in('PENDING','RETRYING') and next_attempt_at<=clock_timestamp()) or(status='PROCESSING' and lease_expires_at<=clock_timestamp())) and(attempts<max_attempts or signed_transaction is not null) order by(signed_transaction is not null)desc,created_at,id for update skip locked limit p_batch_size)
 update public.participation_batches b set status='PROCESSING',attempts=b.attempts+1,lease_owner=p_worker_id,lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds)from c where b.id=c.id returning b.*;
end $$;

create or replace function public.list_participation_receipts(p_limit integer default 100)returns setof public.participation_batches language sql security definer set search_path='' as $$
 select * from public.participation_batches where receipt is not null and inclusion_status <> 'finalized' order by verified_at,id limit greatest(1,least(coalesce(p_limit,100),500));
$$;
