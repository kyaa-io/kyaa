-- Prepare retirement gates without activating producers or changing existing jobs.
begin;
alter table public.mint_dispatch_policy
  add column legacy_credential_issuance_retired boolean not null default false,
  add column direct_stamp_dispatch_enabled boolean not null default false,
  add constraint direct_stamp_dispatch_requires_retirement check (not direct_stamp_dispatch_enabled or legacy_credential_issuance_retired);

CREATE OR REPLACE FUNCTION public.claim_blockchain_jobs(p_worker_id text, p_batch_size integer, p_lease_seconds integer, p_entity_types text[])
 RETURNS SETOF blockchain_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_worker_id is null or length(pg_catalog.btrim(p_worker_id))=0 then
    raise exception 'worker id is required'; end if;
  if p_batch_size<1 or p_batch_size>100 then
    raise exception 'batch size must be between 1 and 100'; end if;
  if p_lease_seconds<30 or p_lease_seconds>900 then
    raise exception 'lease seconds must be between 30 and 900'; end if;
  if p_entity_types is null or pg_catalog.cardinality(p_entity_types)=0
    or exists(select 1 from pg_catalog.unnest(p_entity_types) kind
      where kind not in ('passport','stamp','reaction','collectible','community_stamp')) then
    raise exception 'supported entity types are invalid';
  end if;
  return query with candidates as (
    select id from public.blockchain_jobs
    where ((status in ('PENDING','RETRYING') and next_attempt_at<=pg_catalog.now())
        or (status='PROCESSING' and lease_expires_at<=pg_catalog.now()))
      and (attempts<max_attempts or payload->'workerSubmission'->>'signedTransaction' is not null)
      and (payload->'workerSubmission'->>'signedTransaction' is not null or tx_hash is not null or not ((coalesce(entity_type='stamp' and payload_version=1 and payload->'bindingVersion'='2'::jsonb and payload->>'stampType' in ('Attendance','Membership'),false) and not (select direct_stamp_dispatch_enabled from public.mint_dispatch_policy where singleton)) or (entity_type in ('passport','stamp','reaction','community_stamp') and not coalesce(entity_type='stamp' and payload_version=1 and payload->'bindingVersion'='2'::jsonb and payload->>'stampType' in ('Attendance','Membership'),false) and (select legacy_credential_issuance_retired from public.mint_dispatch_policy where singleton))))
      and entity_type=any(p_entity_types)
      and not exists(select 1 from public.fan_action_credentials c join public.fan_action_outbox a on a.id=c.outbox_id
        where c.legacy_job_id=blockchain_jobs.id and a.operation_kind='import_historical')
    order by (payload->'workerSubmission'->>'signedTransaction' is not null) desc,next_attempt_at,created_at,id for update skip locked limit p_batch_size
  ) update public.blockchain_jobs jobs set
    status='PROCESSING',attempts=jobs.attempts+1,lease_owner=p_worker_id,
    lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>p_lease_seconds),
    last_error_code=null,last_error_message=null
  from candidates where jobs.id=candidates.id returning jobs.*;
end $function$
;

CREATE OR REPLACE FUNCTION public.admit_mint_dispatch(p_job_id uuid, p_worker_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_daily_job_limit integer;
  v_paused boolean;
  v_now timestamptz;
  v_budget_day date;
  v_reserved_count bigint;
  v_job_id uuid;
  v_retired boolean;
  v_direct_enabled boolean;
  v_direct boolean;
  v_legacy boolean;
begin
  select policy.daily_job_limit,policy.transmission_paused,policy.legacy_credential_issuance_retired,policy.direct_stamp_dispatch_enabled
    into v_daily_job_limit,v_paused,v_retired,v_direct_enabled
  from public.mint_dispatch_policy policy
  where policy.singleton
  for update;

  if not found then
    raise exception 'mint dispatch policy is missing' using errcode = 'P0001';
  end if;

  v_now := pg_catalog.clock_timestamp();
  v_budget_day := (v_now at time zone 'UTC')::date;

  select job.id
    into v_job_id
  from public.blockchain_jobs job
  where job.id = p_job_id
    and job.status = 'PROCESSING'
    and job.lease_owner = p_worker_id
    and job.lease_expires_at > v_now
  for update;

  if not found then
    raise exception 'job lease is not active for this worker' using errcode = 'P0001';
  end if;

  if v_paused then
    update public.blockchain_jobs set status='RETRYING',attempts=greatest(attempts-1,0),
      next_attempt_at=clock_timestamp()+interval '1 minute',lease_owner=null,lease_expires_at=null,
      last_error_code='MINT_TRANSMISSION_PAUSED',last_error_message='Mint transmission paused' where id=v_job_id;
    return false;
  end if;

  select coalesce(entity_type='stamp' and payload_version=1 and payload->'bindingVersion'='2'::jsonb and payload->>'stampType' in ('Attendance','Membership'),false),entity_type in ('passport','stamp','reaction','community_stamp')
    into v_direct,v_legacy from public.blockchain_jobs where id=v_job_id;
  if (v_direct and not v_direct_enabled) or (v_legacy and not v_direct and v_retired) then
    update public.blockchain_jobs set status='RETRYING',attempts=greatest(attempts-1,0),
      next_attempt_at=clock_timestamp()+interval '1 minute',lease_owner=null,lease_expires_at=null,
      last_error_code=case when v_direct then 'DIRECT_STAMP_DISPATCH_HELD' else 'LEGACY_CREDENTIAL_ISSUANCE_RETIRED' end,
      last_error_message=case when v_direct then 'Direct Stamp dispatch held' else 'Legacy credential issuance retired' end
      where id=v_job_id;
    return false;
  end if;

  if exists (
    select 1
    from public.mint_dispatch_budget_reservations reservation
    where reservation.budget_day = v_budget_day
      and reservation.job_id = v_job_id
  ) then
    return true;
  end if;

  select pg_catalog.count(*) + (select count(*) from public.fan_action_dispatch_reservations where budget_day=v_budget_day)
    into v_reserved_count
  from public.mint_dispatch_budget_reservations reservation
  where reservation.budget_day = v_budget_day;

  if v_reserved_count < v_daily_job_limit then
    insert into public.mint_dispatch_budget_reservations (budget_day, job_id, reserved_at)
    values (v_budget_day, v_job_id, v_now);
    return true;
  end if;

  update public.blockchain_jobs job
  set status = 'RETRYING',
      attempts = case when job.attempts > 0 then job.attempts - 1 else 0 end,
      next_attempt_at = ((v_budget_day + 1)::timestamp at time zone 'UTC'),
      last_error_code = 'MINT_DAILY_DISPATCH_LIMIT',
      last_error_message = 'Daily mint dispatch limit reached',
      lease_owner = null,
      lease_expires_at = null
  where job.id = v_job_id;

  return false;
end;
$function$
;
commit;
