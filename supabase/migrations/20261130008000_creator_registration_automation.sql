begin;
-- This role has no login, table access, or general proof-writing capability.
do $$ begin if not exists(select 1 from pg_roles where rolname='creator_registration_worker') then create role creator_registration_worker nologin; end if; end $$;
grant usage on schema public to creator_registration_worker;
create table public.creator_registration_jobs(
 id uuid primary key default extensions.gen_random_uuid(),
 kind text not null check(kind in ('creator','campaign')),
 binding_id uuid not null references public.fan_action_bindings(id),
 creator_id uuid not null references public.celebrities(id),
 campaign_id uuid references public.fan_action_campaign_contexts(id),
 slug text not null check(slug ~ '^[a-z0-9][a-z0-9-]{0,249}$'),
 status text not null default 'queued' check(status in ('queued','preparing','submitted','confirmed','finalized','failed')),
 registrar text check(registrar ~ '^0x[0-9a-f]{40}$'),
 lease_owner text, lease_fence bigint not null default 0, lease_expires_at timestamptz,
 next_attempt_at timestamptz not null default clock_timestamp(), recovery_before_block numeric(78,0) check(recovery_before_block>=0), last_error_code text, failures integer not null default 0 check(failures>=0),
 created_at timestamptz not null default clock_timestamp(),
 check((kind='creator' and campaign_id is null) or (kind='campaign' and campaign_id is not null))
);
create unique index creator_registration_creator_unique on public.creator_registration_jobs(binding_id,creator_id) where kind='creator';
create unique index creator_registration_campaign_unique on public.creator_registration_jobs(binding_id,campaign_id) where kind='campaign';
create table public.creator_registration_attempts(
 id uuid primary key default extensions.gen_random_uuid(),
 job_id uuid not null references public.creator_registration_jobs(id),
 chain_id bigint not null check(chain_id=91342), registrar text not null check(registrar ~ '^0x[0-9a-f]{40}$'),
 nonce numeric(78,0) not null check(nonce>=0), envelope jsonb not null,
 signed_transaction text check(signed_transaction ~ '^0x([0-9a-f]{2})+$'),
 transaction_hash text check(transaction_hash ~ '^0x[0-9a-f]{64}$'),
 status text not null default 'reserved' check(status in ('reserved','prepared','submitted','observed','confirmed','finalized','reverted','orphaned')),
 receipt jsonb, receipt_history jsonb not null default '[]'::jsonb check(jsonb_typeof(receipt_history)='array'),
 created_at timestamptz not null default clock_timestamp(),
 unique(chain_id,registrar,nonce)
);
alter table public.creator_registration_jobs enable row level security;
alter table public.creator_registration_attempts enable row level security;
alter table public.creator_registration_jobs force row level security;
alter table public.creator_registration_attempts force row level security;
revoke all on public.creator_registration_jobs,public.creator_registration_attempts from public,anon,authenticated,service_role,creator_registration_worker;
-- Attempts are permanent evidence. Only their first signed bytes and receipt state can advance.
create function public.guard_creator_registration_attempt() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'REGISTRATION_ATTEMPT_IMMUTABLE'; end if;
 if new.receipt_history is distinct from old.receipt_history then raise exception 'REGISTRATION_RECEIPT_HISTORY_IMMUTABLE'; end if;
 if (new.id,new.job_id,new.chain_id,new.registrar,new.nonce,new.envelope,new.created_at) is distinct from (old.id,old.job_id,old.chain_id,old.registrar,old.nonce,old.envelope,old.created_at)
 or (old.transaction_hash is not null and new.transaction_hash is distinct from old.transaction_hash)
 or (old.signed_transaction is not null and new.signed_transaction is distinct from old.signed_transaction) then raise exception 'REGISTRATION_ATTEMPT_IMMUTABLE'; end if;
 if (new.status,new.receipt) is distinct from (old.status,old.receipt) then
  new.receipt_history:=old.receipt_history||jsonb_build_array(jsonb_build_object('status',old.status,'receipt',old.receipt,'recordedAt',clock_timestamp()));
 end if;
 return new;
end $$;
create trigger creator_registration_attempt_immutable before update or delete on public.creator_registration_attempts for each row execute function public.guard_creator_registration_attempt();

create function public.creator_registration_source(p_job_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('valid', c.status='published' and c.archived_at is null and case when j.kind='creator' then c.slug=j.slug else
 exists(select 1 from public.fan_action_campaign_contexts x left join public.live_events l on l.id=x.live_event_id left join public.kyaa_wave_participation_config w on w.event_key=x.wave_event_key
 where x.id=j.campaign_id and x.creator_id=j.creator_id and ((l.publication_status='published' and l.archived_at is null and l.slug=j.slug) or (w.creator_id=j.creator_id and w.campaign_id=j.campaign_id and w.campaign_slug=j.slug))) end,
 'identityValid',case when j.kind='creator' then c.slug=j.slug else exists(select 1 from public.fan_action_campaign_contexts x left join public.live_events l on l.id=x.live_event_id left join public.kyaa_wave_participation_config w on w.event_key=x.wave_event_key where x.id=j.campaign_id and x.creator_id=j.creator_id and (l.slug=j.slug or (w.creator_id=j.creator_id and w.campaign_id=j.campaign_id and w.campaign_slug=j.slug))) end,
 'creator',jsonb_build_object('id',c.id,'slug',c.slug,'status',c.status,'archived_at',c.archived_at),
 'campaign',(select to_jsonb(x) from public.fan_action_campaign_contexts x where x.id=j.campaign_id))
 from public.creator_registration_jobs j join public.celebrities c on c.id=j.creator_id where j.id=p_job_id
$$;
create function public.creator_registration_snapshot(p_job_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('job',to_jsonb(j)||jsonb_build_object('recovery_before_block',j.recovery_before_block::text),'binding',to_jsonb(b),'source',public.creator_registration_source(j.id),'attempt',
 (select to_jsonb(a) from public.creator_registration_attempts a where a.job_id=j.id order by a.created_at desc,a.id desc limit 1))
 from public.creator_registration_jobs j join public.fan_action_bindings b on b.id=j.binding_id where j.id=p_job_id
$$;
create function public.stamp_creator_first_insert() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='published' then new.ever_published_at:=coalesce(new.published_at,clock_timestamp());
 elsif new.ever_published_at is not null then raise exception 'first publication evidence requires publication'; end if;
 return new;
end $$;
create trigger creator_first_insert before insert on public.celebrities for each row execute function public.stamp_creator_first_insert();
create function public.enqueue_creator_first_publication() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='published' and (tg_op='INSERT' or (old.ever_published_at is null and old.status<>'published')) then
 insert into public.creator_registration_jobs(kind,binding_id,creator_id,slug)
 select 'creator',b.id,new.id,new.slug from public.fan_action_bindings b where b.binding_version>=2 and exists(select 1 from public.fan_action_producer_routes r where r.binding_id=b.id and r.enabled and r.action_code in (1,6,8,10))
 on conflict do nothing;
 end if;
 return new;
end $$;
create trigger creator_first_publication after insert or update on public.celebrities for each row execute function public.enqueue_creator_first_publication();

create function public.creator_registration_claim(p_owner text,p_registrar text,p_limit integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare j record; result jsonb:='[]';
begin
 if p_owner is null or length(p_owner) not between 1 and 120 or p_registrar is null or p_registrar !~ '^0x[0-9a-f]{40}$' or p_limit is null or p_limit not between 1 and 10 then raise exception 'REGISTRATION_INVALID_CLAIM'; end if;
 for j in select q.id from public.creator_registration_jobs q where q.status<>'finalized' and q.next_attempt_at<=clock_timestamp() and (q.lease_expires_at is null or q.lease_expires_at<clock_timestamp())
 and (q.registrar is null or q.registrar=p_registrar)
 and (q.status<>'failed' or exists(select 1 from public.creator_registration_attempts a where a.job_id=q.id and a.status not in ('finalized','reverted')))
 order by q.next_attempt_at,q.created_at,q.id for update skip locked limit p_limit loop
 update public.creator_registration_jobs set registrar=coalesce(registrar,p_registrar),lease_owner=p_owner,lease_fence=lease_fence+1,lease_expires_at=clock_timestamp()+interval '2 minutes' where id=j.id;
 result:=result||jsonb_build_array(public.creator_registration_snapshot(j.id));
 end loop;
 return result;
end $$;

-- Encode exactly the two allowed registry calls, never caller-chosen calldata.
create function public.creator_registration_calldata(p_job_id uuid) returns text language sql stable security definer set search_path='' as $$
 select '0x'||case when kind='creator' then 'cc8ee537'||lpad(replace(creator_id::text,'-',''),64,'0')||lpad('40',64,'0')
 else 'a23af077'||lpad(replace(campaign_id::text,'-',''),64,'0')||lpad(replace(creator_id::text,'-',''),64,'0')||lpad('60',64,'0') end
 ||lpad(to_hex(octet_length(slug)),64,'0')||rpad(encode(convert_to(slug,'UTF8'),'hex'),((octet_length(slug)+31)/32)*64,'0')
 from public.creator_registration_jobs where id=p_job_id
$$;
create function public.creator_registration_transition(p_job_id uuid,p_owner text,p_fence bigint,p_operation text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.creator_registration_jobs%rowtype; a public.creator_registration_attempts%rowtype; b public.fan_action_bindings%rowtype; e jsonb; n numeric; signer text; block_number numeric; block_hash text; tx text;
begin
 select * into strict j from public.creator_registration_jobs where id=p_job_id for update;
 if p_owner is null or p_fence is null or j.lease_owner is distinct from p_owner or j.lease_fence<>p_fence or j.lease_expires_at<=clock_timestamp() then raise exception 'REGISTRATION_LEASE_LOST'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'REGISTRATION_INVALID_PAYLOAD'; end if;
 select * into strict b from public.fan_action_bindings where id=j.binding_id;
 select * into a from public.creator_registration_attempts where job_id=j.id order by created_at desc,id desc limit 1 for update;
 if p_operation in ('prepare','submit') and exists(select 1 from public.creator_registration_attempts x where x.chain_id=a.chain_id and x.registrar=a.registrar and x.nonce<a.nonce and x.status='orphaned') then raise exception 'REGISTRATION_NONCE_BLOCKED'; end if;
 if p_operation in ('prepare','confirm','finalize') and not coalesce((public.creator_registration_source(j.id)->>'identityValid')::boolean,false) then raise exception 'REGISTRATION_IDENTITY_CHANGED'; end if;
 if p_operation in ('reserve','recover') and not coalesce((public.creator_registration_source(j.id)->>'valid')::boolean,false) then raise exception 'REGISTRATION_SOURCE_CHANGED'; end if;
 if p_operation in ('reserve','recover') then
  if a.id is not null and a.status<>'reverted' then
   if a.nonce is distinct from (p_payload->>'nonce')::numeric or a.envelope is distinct from p_payload->'envelope' then raise exception 'REGISTRATION_ATTEMPT_CHANGED'; end if;
   return public.creator_registration_snapshot(j.id);
  end if;
  e:=p_payload->'envelope'; n:=(p_payload->>'nonce')::numeric; signer:=case when p_operation='recover' then p_payload->>'registrar' else j.registrar end;
  if n is null or n<0 or n<>trunc(n) or signer is null or signer !~ '^0x[0-9a-f]{40}$' or e is null
   or (e->>'chainId')::bigint is distinct from b.chain_id or b.chain_id<>91342
   or e->>'to' is distinct from '0x4e104e5dfb3d466a2aac9ed0cf7572578068529b'
   or e->>'data' is distinct from public.creator_registration_calldata(j.id)
   or e->>'value' is distinct from '0' or e->>'nonce' is distinct from n::text or e->>'gasLimit' is distinct from '150000'
   or not coalesce((e->>'maxFeePerGas') ~ '^[0-9]+$' and (e->>'maxFeePerGas')::numeric between 1 and 100000000,false)
   or not coalesce((e->>'maxPriorityFeePerGas') ~ '^[0-9]+$' and (e->>'maxPriorityFeePerGas')::numeric between 0 and (e->>'maxFeePerGas')::numeric,false)
  then raise exception 'REGISTRATION_INVALID_ENVELOPE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(b.chain_id::text||':'||signer,0));
  if j.lease_expires_at<=clock_timestamp() then raise exception 'REGISTRATION_LEASE_LOST'; end if;
  if exists(select 1 from public.creator_registration_attempts x where x.chain_id=b.chain_id and x.registrar=signer and x.status not in ('confirmed','finalized','reverted')) then raise exception 'REGISTRATION_NONCE_BLOCKED'; end if;
  insert into public.creator_registration_attempts(job_id,chain_id,registrar,nonce,envelope,status,transaction_hash)
  values(j.id,b.chain_id,signer,n,e,case when p_operation='recover' then 'observed' else 'reserved' end,case when p_operation='recover' then p_payload->>'transactionHash' end) returning * into a;
  if p_operation='recover' and a.transaction_hash is null then raise exception 'REGISTRATION_HASH_REQUIRED'; end if;
  update public.creator_registration_jobs set status='preparing',recovery_before_block=null where id=j.id;
 elsif p_operation='prepare' then
  if a.id is null or a.status not in ('reserved','prepared') or p_payload->>'signedTransaction' is null or p_payload->>'transactionHash' is null then raise exception 'REGISTRATION_INVALID_STATE'; end if;
  update public.creator_registration_attempts set signed_transaction=p_payload->>'signedTransaction',transaction_hash=p_payload->>'transactionHash',status='prepared' where id=a.id;
 elsif p_operation='submit' then
  if a.id is null or a.signed_transaction is null or a.status not in ('prepared','submitted','orphaned') then raise exception 'REGISTRATION_NOT_PREPARED'; end if;
  update public.creator_registration_attempts set status='submitted' where id=a.id;
  update public.creator_registration_jobs set status='submitted' where id=j.id;
 elsif p_operation in ('confirm','finalize','revert') then
  tx:=p_payload->>'transactionHash'; block_number:=(p_payload->>'blockNumber')::numeric; block_hash:=p_payload->>'blockHash';
  if a.id is null or tx is distinct from a.transaction_hash or block_number is null or block_number<=0 or block_number<>trunc(block_number) or block_hash is null or block_hash !~ '^0x[0-9a-f]{64}$' or a.status in ('reserved','reverted') or (a.status='finalized' and p_operation<>'finalize') then raise exception 'REGISTRATION_INVALID_PROOF'; end if;
  if p_operation='revert' then
   if p_payload->>'contextAbsent' is distinct from 'true' or a.status='finalized' then raise exception 'REGISTRATION_CONTEXT_STILL_PRESENT'; end if;
   delete from public.fan_action_confirmed_creators where binding_id=j.binding_id and creator_id=j.creator_id and transaction_hash=tx;
   update public.creator_registration_attempts set status='reverted',receipt=p_payload where id=a.id;
   update public.creator_registration_jobs set status='queued' where id=j.id;
  else
   if j.kind='creator' then
    insert into public.fan_action_confirmed_creators(binding_id,creator_id,transaction_hash,confirmed_block_number,confirmed_block_hash,confirmed_at)
    values(j.binding_id,j.creator_id,tx,block_number,block_hash,clock_timestamp()) on conflict(binding_id,creator_id) do update set transaction_hash=excluded.transaction_hash,confirmed_block_number=excluded.confirmed_block_number,confirmed_block_hash=excluded.confirmed_block_hash,confirmed_at=excluded.confirmed_at;
    if p_operation='finalize' then
     insert into public.fan_action_verified_creators(binding_id,creator_id,verified_block_number,verified_block_hash,verified_at) values(j.binding_id,j.creator_id,block_number,block_hash,clock_timestamp()) on conflict(binding_id,creator_id) do nothing;
    end if;
   elsif p_operation='finalize' then
    insert into public.fan_action_verified_campaigns(binding_id,campaign_id,creator_id,verified_block_number,verified_block_hash,verified_at) values(j.binding_id,j.campaign_id,j.creator_id,block_number,block_hash,clock_timestamp()) on conflict(binding_id,campaign_id) do nothing;
   end if;
   update public.creator_registration_attempts set status=case when p_operation='finalize' then 'finalized' else 'confirmed' end,receipt=p_payload where id=a.id;
   update public.creator_registration_jobs set status=case when p_operation='finalize' then 'finalized' else 'confirmed' end,last_error_code=null where id=j.id;
  end if;
 elsif p_operation='orphan' then
  if a.id is null or a.transaction_hash is distinct from p_payload->>'transactionHash' or a.receipt->>'blockHash' is distinct from p_payload->>'blockHash' or p_payload->>'blockHash' is null or a.status not in ('confirmed','orphaned') then raise exception 'REGISTRATION_PROOF_CHANGED'; end if;
  delete from public.fan_action_confirmed_creators where binding_id=j.binding_id and creator_id=j.creator_id and transaction_hash=a.transaction_hash and confirmed_block_hash=p_payload->>'blockHash';
  update public.creator_registration_attempts set status='orphaned' where id=a.id;
  update public.creator_registration_jobs set status='submitted' where id=j.id;
 elsif p_operation='defer' then
  if p_payload ? 'recoveryBeforeBlock' then
   if (a.id is not null and a.status<>'reverted') or p_payload->>'errorCode' is distinct from 'REGISTRATION_RECOVERY_PENDING'
    or not coalesce((p_payload->>'recoveryBeforeBlock') ~ '^[0-9]{1,78}$',false)
    or (j.recovery_before_block is not null and (p_payload->>'recoveryBeforeBlock')::numeric>j.recovery_before_block)
   then raise exception 'REGISTRATION_INVALID_RECOVERY_CURSOR'; end if;
  end if;
  if not coalesce((p_payload->>'delaySeconds') ~ '^[0-9]+$' and (p_payload->>'delaySeconds')::integer between 1 and 3600,false)
   or (p_payload->>'errorCode' is not null and p_payload->>'errorCode' !~ '^[A-Z0-9_]{1,80}$') then raise exception 'REGISTRATION_INVALID_DEFER'; end if;
  update public.creator_registration_jobs set next_attempt_at=clock_timestamp()+make_interval(secs=>(p_payload->>'delaySeconds')::integer),recovery_before_block=case when p_payload ? 'recoveryBeforeBlock' then (p_payload->>'recoveryBeforeBlock')::numeric else recovery_before_block end,last_error_code=p_payload->>'errorCode',failures=failures+case when p_payload->>'errorCode' in ('WAITING_RECEIPT','WAITING_FINALITY','SIGNER_NONCE_BLOCKED','REGISTRATION_RECOVERY_PENDING') then 0 else 1 end,status=case when p_payload->>'errorCode'='RETRY_EXHAUSTED' or (failures>=9 and coalesce(p_payload->>'errorCode','') not in ('WAITING_RECEIPT','WAITING_FINALITY','SIGNER_NONCE_BLOCKED','REGISTRATION_RECOVERY_PENDING')) then 'failed' else status end,lease_owner=null,lease_expires_at=null where id=j.id;
 else raise exception 'REGISTRATION_INVALID_OPERATION'; end if;
 return public.creator_registration_snapshot(j.id);
end $$;

-- Explicit campaign enqueue is DB-owner-only; the CLI cannot supply a call or signer.
create function public.enqueue_campaign_registration(p_binding_id uuid,p_campaign_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; owner_id uuid; source_slug text;
begin
 select x.creator_id,coalesce(l.slug,w.campaign_slug) into strict owner_id,source_slug from public.fan_action_campaign_contexts x
 left join public.live_events l on l.id=x.live_event_id left join public.kyaa_wave_participation_config w on w.event_key=x.wave_event_key
 join public.celebrities c on c.id=x.creator_id and c.status='published' and c.archived_at is null
 where x.id=p_campaign_id and ((l.publication_status='published' and l.archived_at is null) or (w.campaign_id=x.id and w.creator_id=x.creator_id));
 if not exists(select 1 from public.fan_action_verified_creators where binding_id=p_binding_id and creator_id=owner_id) then raise exception 'REGISTRATION_CREATOR_NOT_FINALIZED'; end if;
 insert into public.creator_registration_jobs(kind,binding_id,creator_id,campaign_id,slug) values('campaign',p_binding_id,owner_id,p_campaign_id,source_slug) on conflict do nothing returning id into target;
 if target is null then select id into strict target from public.creator_registration_jobs where binding_id=p_binding_id and campaign_id=p_campaign_id and kind='campaign'; end if;
 return public.creator_registration_snapshot(target);
end $$;
create function public.registration_job_status(p_job_id uuid) returns jsonb language sql stable security definer set search_path='' as $$ select public.creator_registration_snapshot(p_job_id) $$;

-- A disabled/outage worker cannot leave an unfinalized like proof active forever.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.fan_action_native_enabled(integer,uuid,uuid)'::regprocedure);
 if position('confirmed.creator_id=p_creator_id);' in definition)=0 then raise exception 'REGISTRATION_GATE_SHAPE_CHANGED'; end if;
 execute replace(definition,'confirmed.creator_id=p_creator_id);','confirmed.creator_id=p_creator_id and confirmed.confirmed_at > clock_timestamp()-interval ''10 minutes'');');
end $$;
create function public.creator_registration_admin_projection(p_celebrity uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('status',j.status,'likesEnabled',exists(select 1 from public.fan_action_producer_routes r where r.action_code=6 and r.enabled and r.binding_id=j.binding_id and
 (exists(select 1 from public.fan_action_verified_creators v where v.binding_id=j.binding_id and v.creator_id=j.creator_id) or exists(select 1 from public.fan_action_confirmed_creators v where v.binding_id=j.binding_id and v.creator_id=j.creator_id and v.confirmed_at>clock_timestamp()-interval '10 minutes'))),
 'attempts',(select count(*) from public.creator_registration_attempts a where a.job_id=j.id),
 'nextAttemptAt',case when j.status='finalized' then null else j.next_attempt_at end,
 'transactionHash',(select a.transaction_hash from public.creator_registration_attempts a where a.job_id=j.id order by a.created_at desc,a.id desc limit 1),
 'errorCode',j.last_error_code,'canRetry',j.status<>'finalized' and (j.lease_expires_at is null or j.lease_expires_at<clock_timestamp()))
 from public.creator_registration_jobs j where j.creator_id=p_celebrity and j.kind='creator'
 order by case when j.status='failed' then 0 when j.status<>'finalized' then 1 else 2 end,j.created_at desc limit 1
$$;
-- Preserve the existing CMS projection and its authorization without duplicating its body.
alter function public.read_admin_celebrity_cms(uuid,uuid) rename to read_admin_celebrity_cms_before_registration;
revoke all on function public.read_admin_celebrity_cms_before_registration(uuid,uuid) from public,anon,authenticated,service_role;
create function public.read_admin_celebrity_cms(p_actor uuid,p_celebrity uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb;
begin
 rows:=public.read_admin_celebrity_cms_before_registration(p_actor,p_celebrity);
 return coalesce((select jsonb_agg(item||jsonb_build_object('onchainRegistration',public.creator_registration_admin_projection((item->>'id')::uuid)) order by ord) from jsonb_array_elements(rows) with ordinality t(item,ord)),'[]'::jsonb);
end $$;
create function public.retry_admin_creator_registration(p_actor uuid,p_correlation uuid,p_celebrity uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 perform public.require_content_editor(p_actor,true);
 if p_correlation is null or p_celebrity is null then raise exception 'REGISTRATION_INVALID_RETRY'; end if;
 update public.creator_registration_jobs set next_attempt_at=clock_timestamp(),last_error_code=null,failures=0,status=case when status='failed' then 'queued' else status end
 where creator_id=p_celebrity and kind='creator' and status<>'finalized' and (lease_expires_at is null or lease_expires_at<clock_timestamp());
 get diagnostics changed=row_count;
 if changed=0 then raise exception 'REGISTRATION_NOT_RETRYABLE'; end if;
 insert into public.audit_logs(actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary,correlation_id)
 values(p_actor,'celebrity.registration.retry','celebrity',p_celebrity::text,jsonb_build_object('jobs',changed),p_correlation);
 return public.creator_registration_admin_projection(p_celebrity);
end $$;
revoke all on function public.guard_creator_registration_attempt(),public.creator_registration_source(uuid),public.creator_registration_snapshot(uuid),public.stamp_creator_first_insert(),public.enqueue_creator_first_publication(),public.creator_registration_calldata(uuid),public.creator_registration_claim(text,text,integer),public.creator_registration_transition(uuid,text,bigint,text,jsonb),public.enqueue_campaign_registration(uuid,uuid),public.registration_job_status(uuid),public.creator_registration_admin_projection(uuid),public.read_admin_celebrity_cms(uuid,uuid),public.retry_admin_creator_registration(uuid,uuid,uuid) from public,anon,authenticated,service_role,creator_registration_worker;
grant execute on function public.creator_registration_claim(text,text,integer),public.creator_registration_transition(uuid,text,bigint,text,jsonb) to creator_registration_worker;
grant execute on function public.read_admin_celebrity_cms(uuid,uuid),public.retry_admin_creator_registration(uuid,uuid,uuid) to service_role;
commit;
