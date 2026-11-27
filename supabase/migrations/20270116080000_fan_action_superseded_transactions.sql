-- A stored fan-action signature whose nonce was already used by another transaction from the
-- same relayer can never be included. Before this, such a row kept retrying the rejected bytes
-- and, as an unresolved signed transaction, blocked every other writer on that relayer.
-- The worker now proves the nonce was consumed (or the retry budget is exhausted while the RPC
-- does not know the transaction), archives the bytes here, and re-signs from the frozen payload.
-- The Hub records each actionId at most once, so a re-signed transaction cannot double-record.
create table public.fan_action_superseded_transactions (
  id bigint generated always as identity primary key,
  outbox_id uuid not null references public.fan_action_outbox(id),
  tx_hash text not null check(tx_hash ~ '^0x[0-9a-f]{64}$'),
  signed_transaction text not null check(signed_transaction ~ '^0x[0-9a-f]+$'),
  tx_nonce numeric not null check(tx_nonce>=0 and tx_nonce=trunc(tx_nonce)),
  chain_nonce numeric not null check(chain_nonce>=0 and chain_nonce=trunc(chain_nonce)),
  reason text not null check(reason in ('NONCE_CONSUMED','ATTEMPTS_EXHAUSTED')),
  attempts integer not null,
  last_error_code text,
  last_error_message text,
  recorded_at timestamptz not null default clock_timestamp()
);
create index fan_action_superseded_transactions_outbox on public.fan_action_superseded_transactions(outbox_id);
create trigger fan_action_superseded_transactions_immutable before update or delete on public.fan_action_superseded_transactions
for each row execute function public.reject_fan_action_identity_mutation();
alter table public.fan_action_superseded_transactions enable row level security;
revoke all on table public.fan_action_superseded_transactions from public,anon,authenticated,service_role;

-- Same rules as before, plus one exit: supersede_fan_action_transaction may clear the signed
-- bytes of the single row it has just archived.
create or replace function public.reject_fan_action_identity_mutation() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'FAN_ACTION_IMMUTABLE'; end if;
  if tg_table_name='fan_action_outbox' then
    if (to_jsonb(new)-array['status','attempts','next_attempt_at','lease_owner','lease_expires_at',
      'tx_hash','signed_transaction','last_error_code','last_error_message','payload','action_id','occurrence_id','request_hash'])
      is distinct from (to_jsonb(old)-array['status','attempts','next_attempt_at','lease_owner','lease_expires_at',
      'tx_hash','signed_transaction','last_error_code','last_error_message','payload','action_id','occurrence_id','request_hash'])
      or (old.payload is not null and (new.payload is distinct from old.payload or new.action_id is distinct from old.action_id
        or new.occurrence_id is distinct from old.occurrence_id or new.request_hash is distinct from old.request_hash))
      or (old.signed_transaction is not null and (new.signed_transaction is distinct from old.signed_transaction or new.tx_hash is distinct from old.tx_hash)
        and not (new.signed_transaction is null and new.tx_hash is null
          and current_setting('kyaa.fan_action_supersede',true) is not distinct from old.id::text
          and exists(select 1 from public.fan_action_superseded_transactions s where s.outbox_id=old.id
            and s.tx_hash=old.tx_hash and s.signed_transaction=old.signed_transaction))) then
      raise exception 'FAN_ACTION_IMMUTABLE';
    end if;
  elsif to_jsonb(new) is distinct from to_jsonb(old) then raise exception 'FAN_ACTION_IMMUTABLE'; end if;
  return new;
end $$;
revoke all on function public.reject_fan_action_identity_mutation() from public,anon,authenticated,service_role;

-- Returns the row's next status: RETRYING (re-sign with a fresh nonce) or FAILED after three
-- superseded signatures for the same action. Either way the row stops blocking the relayer.
create function public.supersede_fan_action_transaction(p_job_id uuid,p_worker_id text,p_tx_hash text,p_tx_nonce numeric,p_chain_nonce numeric)
returns text language plpgsql security definer set search_path='' as $$
declare q public.fan_action_outbox; v_reason text; v_count integer; v_status text;
begin
  select * into q from public.fan_action_outbox where id=p_job_id and status='PROCESSING'
    and lease_owner=p_worker_id and lease_expires_at>clock_timestamp() for update;
  if not found then raise exception 'STALE_JOB_LEASE'; end if;
  if q.signed_transaction is null or q.tx_hash is distinct from lower(p_tx_hash) then raise exception 'FAN_ACTION_SUPERSEDE_MISMATCH'; end if;
  if q.payload ? 'workerSubmission' then raise exception 'FAN_ACTION_SUPERSEDE_EMBEDDED_SUBMISSION'; end if;
  if p_tx_nonce is null or p_chain_nonce is null or p_tx_nonce<0 or p_chain_nonce<0
    or p_tx_nonce<>trunc(p_tx_nonce) or p_chain_nonce<>trunc(p_chain_nonce) then raise exception 'FAN_ACTION_SUPERSEDE_INVALID_NONCE'; end if;
  if exists(select 1 from public.fan_action_chain_receipts where outbox_id=q.id) then raise exception 'FAN_ACTION_SUPERSEDE_HAS_RECEIPT'; end if;
  v_reason:=case when p_chain_nonce>p_tx_nonce then 'NONCE_CONSUMED' when q.attempts>=q.max_attempts then 'ATTEMPTS_EXHAUSTED' end;
  if v_reason is null then raise exception 'FAN_ACTION_SUPERSEDE_NOT_PROVEN'; end if;
  insert into public.fan_action_superseded_transactions(outbox_id,tx_hash,signed_transaction,tx_nonce,chain_nonce,reason,attempts,last_error_code,last_error_message)
    values(q.id,q.tx_hash,q.signed_transaction,p_tx_nonce,p_chain_nonce,v_reason,q.attempts,q.last_error_code,q.last_error_message);
  select count(*) into v_count from public.fan_action_superseded_transactions where outbox_id=q.id;
  v_status:=case when v_count>=3 then 'FAILED' else 'RETRYING' end;
  perform set_config('kyaa.fan_action_supersede',q.id::text,true);
  update public.fan_action_outbox set tx_hash=null,signed_transaction=null,status=v_status,
    attempts=case when v_status='RETRYING' then 0 else attempts end,
    next_attempt_at=clock_timestamp()+interval '5 seconds',lease_owner=null,lease_expires_at=null,
    last_error_code=case when v_status='RETRYING' then 'SIGNED_TRANSACTION_SUPERSEDED' else 'SIGNED_TRANSACTION_SUPERSEDED_LIMIT' end,
    last_error_message=left(format('%s: nonce %s, relayer nonce %s, attempts %s',v_reason,p_tx_nonce,p_chain_nonce,q.attempts),500)
    where id=q.id;
  perform set_config('kyaa.fan_action_supersede','',true);
  return v_status;
end $$;
revoke all on function public.supersede_fan_action_transaction(uuid,text,text,numeric,numeric) from public,anon,authenticated,service_role;
grant execute on function public.supersede_fan_action_transaction(uuid,text,text,numeric,numeric) to service_role;
