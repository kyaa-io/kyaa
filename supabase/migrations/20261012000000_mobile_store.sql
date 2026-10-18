-- Sandbox-only mobile Store purchase intents and verified, replay-safe awards.
-- Product policy rows are deliberately unseeded; tests provide isolated fixtures.

create table public.mobile_store_product_policies (
  id uuid primary key default extensions.gen_random_uuid(),
  store text not null check (store in ('apple','google')),
  environment text not null check (environment='sandbox'),
  product_id text not null check (product_id=btrim(product_id) and length(product_id) between 1 and 200),
  policy_version text not null check (policy_version=btrim(policy_version) and length(policy_version) between 1 and 80),
  currency text not null check (currency='KRW'),
  ticket_quantity bigint not null check (ticket_quantity>0),
  support_rate_bps integer not null check (support_rate_bps between 0 and 10000),
  reward_policy_version integer not null references public.reward_policy_versions(version) on delete restrict,
  effective_at timestamptz not null,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (retired_at is null or retired_at>effective_at),
  unique(store,environment,product_id,policy_version)
);
create unique index mobile_store_product_policies_one_active
  on public.mobile_store_product_policies(store,environment,product_id)
  where retired_at is null;

-- Sandbox Store entry points are closed until an operator explicitly enrolls
-- an internal test account. The migration deliberately seeds no accounts.
create table public.mobile_store_sandbox_testers (
  app_user_id uuid primary key references public.app_users(id) on delete cascade,
  enabled boolean not null default false,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table public.mobile_store_purchase_intents (
  id uuid primary key default extensions.gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  product_policy_id uuid not null references public.mobile_store_product_policies(id) on delete restrict,
  store text not null check (store in ('apple','google')),
  environment text not null check (environment='sandbox'),
  product_id text not null,
  currency text not null check (currency='KRW'),
  policy_version text not null check (policy_version=btrim(policy_version) and length(policy_version) between 1 and 80),
  ticket_quantity bigint not null check (ticket_quantity>0),
  support_rate_bps integer not null check (support_rate_bps between 0 and 10000),
  reward_policy_version integer not null references public.reward_policy_versions(version) on delete restrict,
  request_key uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  completed_at timestamptz,
  unique(app_user_id,request_key)
);

-- This mapping is the erasable Store/customer identifier. The purchase intent
-- and transaction ledgers retain only pseudonymous accounting facts.
create table public.mobile_store_intent_profiles (
  intent_id uuid primary key references public.mobile_store_purchase_intents(id) on delete restrict,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  store text not null check (store in ('apple','google')),
  profile_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(store,profile_id),
  unique(intent_id,app_user_id,store)
);

-- Paid tickets stay out of fan_ticket_ledger. Existing physical-benefit RPCs
-- debit only fan_ticket_ledger, so Store-funded tickets cannot enter those draws.
create table public.mobile_store_paid_ticket_ledger (
  id uuid primary key default extensions.gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  transaction_id uuid not null,
  entry_kind text not null check (entry_kind in ('credit','debit')),
  amount bigint not null check ((entry_kind='credit' and amount>0) or (entry_kind='debit' and amount<0)),
  cumulative_refunded_krw bigint check (cumulative_refunded_krw is null or cumulative_refunded_krw>0),
  owner_sequence bigint not null check (owner_sequence>0),
  resulting_balance bigint not null check (resulting_balance>=0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(app_user_id,celebrity_id,owner_sequence)
);
create unique index mobile_store_paid_ticket_one_credit on public.mobile_store_paid_ticket_ledger(transaction_id) where entry_kind='credit';
create unique index mobile_store_paid_ticket_one_refund_step on public.mobile_store_paid_ticket_ledger(transaction_id,cumulative_refunded_krw) where entry_kind='debit';

create function public.mobile_store_post_paid_ticket_entry(p_app_user_id uuid,p_celebrity_id uuid,p_transaction_id uuid,
  p_entry_kind text,p_amount bigint,p_cumulative_refunded_krw bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.mobile_store_paid_ticket_ledger%rowtype;v_balance bigint;v_sequence bigint;inserted public.mobile_store_paid_ticket_ledger%rowtype;
begin
  if p_app_user_id is null or p_celebrity_id is null or p_transaction_id is null or p_entry_kind not in ('credit','debit')
    or p_amount is null or p_amount=0 or (p_entry_kind='credit' and (p_amount<0 or p_cumulative_refunded_krw is not null))
    or (p_entry_kind='debit' and (p_amount>0 or p_cumulative_refunded_krw is null or p_cumulative_refunded_krw<=0))
  then raise exception 'MOBILE_STORE_PAID_TICKET_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile-store-paid:'||p_app_user_id::text||':'||p_celebrity_id::text,0));
  select * into existing from public.mobile_store_paid_ticket_ledger where transaction_id=p_transaction_id and entry_kind=p_entry_kind
    and cumulative_refunded_krw is not distinct from p_cumulative_refunded_krw;
  if found then
    if existing.app_user_id<>p_app_user_id or existing.celebrity_id<>p_celebrity_id or existing.amount<>p_amount then
      raise exception 'MOBILE_STORE_PAID_TICKET_CONFLICT' using errcode='23514'; end if;
    return jsonb_build_object('entryId',existing.id,'balance',existing.resulting_balance,'replayed',true);
  end if;
  select resulting_balance,owner_sequence+1 into v_balance,v_sequence from public.mobile_store_paid_ticket_ledger
    where app_user_id=p_app_user_id and celebrity_id=p_celebrity_id order by owner_sequence desc limit 1;
  v_balance:=coalesce(v_balance,0)+p_amount;v_sequence:=coalesce(v_sequence,1);
  if v_balance<0 then raise exception 'MOBILE_STORE_PAID_TICKET_NEGATIVE_BALANCE' using errcode='23514'; end if;
  insert into public.mobile_store_paid_ticket_ledger(app_user_id,celebrity_id,transaction_id,entry_kind,amount,cumulative_refunded_krw,owner_sequence,resulting_balance)
    values(p_app_user_id,p_celebrity_id,p_transaction_id,p_entry_kind,p_amount,p_cumulative_refunded_krw,v_sequence,v_balance) returning * into inserted;
  return jsonb_build_object('entryId',inserted.id,'balance',inserted.resulting_balance,'replayed',false);
end $$;

create table public.mobile_store_transactions (
  id uuid primary key default extensions.gen_random_uuid(),
  store text not null check (store in ('apple','google')),
  environment text not null check (environment in ('sandbox','production')),
  external_transaction_id text not null check (external_transaction_id=btrim(external_transaction_id) and length(external_transaction_id) between 1 and 300),
  intent_id uuid references public.mobile_store_purchase_intents(id) on delete restrict,
  app_user_id uuid references public.app_users(id) on delete restrict,
  celebrity_id uuid references public.celebrities(id) on delete restrict,
  product_id text not null,
  currency text,
  amount_krw bigint check (amount_krw is null or amount_krw>0),
  refunded_krw bigint not null default 0 check (refunded_krw>=0),
  ticket_quantity bigint check (ticket_quantity is null or ticket_quantity>0),
  ticket_reversed bigint not null default 0 check (ticket_reversed>=0),
  support_rate_bps integer check (support_rate_bps is null or support_rate_bps between 0 and 10000),
  support_krw bigint not null default 0 check (support_krw>=0),
  reward_policy_version integer references public.reward_policy_versions(version) on delete restrict,
  state text not null check (state in ('pending','granted','revoked')),
  pending_reason text check (pending_reason in ('store_pending','missing_intent','account_mismatch','product_mismatch','currency_mismatch','amount_unknown','account_unavailable','insufficient_balance','manual_review','production_rejected')),
  ticket_ledger_id uuid unique references public.mobile_store_paid_ticket_ledger(id) on delete restrict,
  verification_fingerprint text not null check (verification_fingerprint ~ '^[a-f0-9]{64}$'),
  store_event_at timestamptz,
  verified_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check ((state='pending')=(pending_reason is not null)),
  check (refunded_krw<=coalesce(amount_krw,refunded_krw)),
  check (ticket_quantity is null or ticket_reversed<=ticket_quantity),
  unique(store,environment,external_transaction_id)
);
create index mobile_store_transactions_owner on public.mobile_store_transactions(app_user_id,created_at desc,id desc);

create table public.mobile_store_support_ledger (
  id uuid primary key default extensions.gen_random_uuid(),
  transaction_id uuid not null references public.mobile_store_transactions(id) on delete restrict,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  amount_delta_krw bigint not null check (amount_delta_krw<>0),
  resulting_support_krw bigint not null check (resulting_support_krw>=0),
  cumulative_refunded_krw bigint not null check (cumulative_refunded_krw>=0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(transaction_id,cumulative_refunded_krw)
);

create table public.mobile_store_support_settlement_evidence (
  id uuid primary key default extensions.gen_random_uuid(),
  transaction_id uuid not null references public.mobile_store_transactions(id)on delete restrict,
  support_krw bigint not null check(support_krw>=0),
  evidence_at timestamptz not null,
  evidence_reference text not null check(evidence_reference=btrim(evidence_reference)and length(evidence_reference)between 1 and 500),
  actor_app_user_id uuid not null references public.app_users(id)on delete restrict,
  actor_admin_allowlist_id uuid not null references public.admin_allowlist(id)on delete restrict,
  correlation_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(transaction_id,support_krw,evidence_at)
);
create index mobile_store_support_settlement_latest on public.mobile_store_support_settlement_evidence(transaction_id,created_at desc,id desc);

create function public.reject_mobile_store_immutable_mutation() returns trigger
language plpgsql set search_path='' as $$ begin raise exception 'MOBILE_STORE_RECORD_IMMUTABLE'; end $$;
create function public.guard_mobile_store_product_policy_mutation() returns trigger
language plpgsql set search_path='' as $$ begin
  if tg_op='UPDATE' and old.retired_at is null and new.retired_at is not null
    and (to_jsonb(new)-'retired_at')=(to_jsonb(old)-'retired_at') then return new; end if;
  raise exception 'MOBILE_STORE_RECORD_IMMUTABLE';
end $$;
create trigger mobile_store_product_policies_immutable before update or delete on public.mobile_store_product_policies for each row execute function public.guard_mobile_store_product_policy_mutation();
create trigger mobile_store_product_policies_reject_truncate before truncate on public.mobile_store_product_policies for each statement execute function public.reject_mobile_store_immutable_mutation();
create trigger mobile_store_support_ledger_immutable before update or delete on public.mobile_store_support_ledger for each row execute function public.reject_mobile_store_immutable_mutation();
create trigger mobile_store_support_ledger_reject_truncate before truncate on public.mobile_store_support_ledger for each statement execute function public.reject_mobile_store_immutable_mutation();
create trigger mobile_store_support_settlement_immutable before update or delete on public.mobile_store_support_settlement_evidence for each row execute function public.reject_mobile_store_immutable_mutation();
create trigger mobile_store_support_settlement_reject_truncate before truncate on public.mobile_store_support_settlement_evidence for each statement execute function public.reject_mobile_store_immutable_mutation();
create trigger mobile_store_paid_ticket_ledger_immutable before update or delete on public.mobile_store_paid_ticket_ledger for each row execute function public.reject_mobile_store_immutable_mutation();
create trigger mobile_store_paid_ticket_ledger_reject_truncate before truncate on public.mobile_store_paid_ticket_ledger for each statement execute function public.reject_mobile_store_immutable_mutation();

create function public.mobile_store_list_products(p_app_user_id uuid,p_store text,p_celebrity_slug text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_celebrity uuid;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if not exists(select 1 from public.mobile_store_sandbox_testers where app_user_id=p_app_user_id and enabled) then
    raise exception 'MOBILE_STORE_TESTER_REQUIRED' using errcode='42501'; end if;
  if p_store not in ('apple','google') then raise exception 'MOBILE_STORE_INVALID'; end if;
  select id into v_celebrity from public.celebrities where slug=p_celebrity_slug and status='published' and archived_at is null;
  if v_celebrity is null then raise exception 'MOBILE_STORE_FAVORITE_UNAVAILABLE'; end if;
  return jsonb_build_object('products',coalesce((select jsonb_agg(jsonb_build_object(
    'productId',p.product_id,'currency',p.currency,'ticketQuantity',p.ticket_quantity,
    'supportRateBps',p.support_rate_bps,'policyVersion',p.policy_version) order by p.product_id)
    from public.mobile_store_product_policies p where p.store=p_store and p.environment='sandbox'
      and p.effective_at<=pg_catalog.clock_timestamp() and p.retired_at is null),'[]'::jsonb));
end $$;

create function public.mobile_store_create_intent(p_app_user_id uuid,p_store text,p_product_id text,
  p_celebrity_slug text,p_policy_version text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_policy public.mobile_store_product_policies%rowtype;v_celebrity uuid;v_intent public.mobile_store_purchase_intents%rowtype;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if not exists(select 1 from public.mobile_store_sandbox_testers where app_user_id=p_app_user_id and enabled) then
    raise exception 'MOBILE_STORE_TESTER_REQUIRED' using errcode='42501'; end if;
  select id into v_celebrity from public.celebrities where slug=p_celebrity_slug and status='published' and archived_at is null for key share;
  if v_celebrity is null then raise exception 'MOBILE_STORE_FAVORITE_UNAVAILABLE'; end if;
  select * into v_intent from public.mobile_store_purchase_intents where app_user_id=p_app_user_id and request_key=p_request_key;
  if found then
    if v_intent.store<>p_store or v_intent.product_id<>p_product_id or v_intent.policy_version<>p_policy_version
      or v_intent.celebrity_id<>v_celebrity then
      raise exception 'MOBILE_STORE_IDEMPOTENCY_CONFLICT' using errcode='23514'; end if;
    return jsonb_build_object('id',v_intent.id,'store',v_intent.store,'environment',v_intent.environment,
      'productId',v_intent.product_id,'currency',v_intent.currency,'appAccountToken',case when v_intent.store='apple' then v_intent.id else null end,
      'obfuscatedProfileId',case when v_intent.store='google' then v_intent.id else null end,'createdAt',v_intent.created_at,'replayed',true);
  end if;
  select * into v_policy from public.mobile_store_product_policies where store=p_store and environment='sandbox'
    and product_id=p_product_id and effective_at<=pg_catalog.clock_timestamp() and retired_at is null;
  if not found then raise exception 'MOBILE_STORE_PRODUCT_UNAVAILABLE'; end if;
  if v_policy.policy_version<>p_policy_version then raise exception 'MOBILE_STORE_POLICY_CHANGED' using errcode='40001'; end if;
  insert into public.mobile_store_purchase_intents(app_user_id,celebrity_id,product_policy_id,store,environment,
    product_id,currency,policy_version,ticket_quantity,support_rate_bps,reward_policy_version,request_key)
  values(p_app_user_id,v_celebrity,v_policy.id,v_policy.store,v_policy.environment,v_policy.product_id,v_policy.currency,
    v_policy.policy_version,v_policy.ticket_quantity,v_policy.support_rate_bps,v_policy.reward_policy_version,p_request_key)
  returning * into v_intent;
  insert into public.mobile_store_intent_profiles(intent_id,app_user_id,store,profile_id)
    values(v_intent.id,p_app_user_id,p_store,v_intent.id);
  return jsonb_build_object('id',v_intent.id,'store',v_intent.store,'environment',v_intent.environment,
    'productId',v_intent.product_id,'currency',v_intent.currency,'appAccountToken',case when v_intent.store='apple' then v_intent.id else null end,
    'obfuscatedProfileId',case when v_intent.store='google' then v_intent.id else null end,'createdAt',v_intent.created_at,'replayed',false);
end $$;

create function public.mobile_store_project_transaction(p_transaction public.mobile_store_transactions)
returns jsonb language sql stable set search_path='' as $$ select jsonb_build_object(
  'store',p_transaction.store,'environment',p_transaction.environment,'transactionId',p_transaction.external_transaction_id,
  'intentId',p_transaction.intent_id,
  'state',p_transaction.state,'pendingReason',p_transaction.pending_reason,'amountKrw',p_transaction.amount_krw,
  'refundedKrw',p_transaction.refunded_krw,'supportKrw',p_transaction.support_krw,
  'productId',i.product_id,'celebrityId',i.celebrity_id,'celebritySlug',c.slug,'ticketQuantity',i.ticket_quantity,
  'supportRateBps',i.support_rate_bps,'policyVersion',i.policy_version,'purchasedAt',p_transaction.store_event_at,'verifiedAt',p_transaction.verified_at,
  'settlementStatus',case when p_transaction.support_krw=0 and evidence.id is null then'not_applicable'when evidence.id is null then'pending'when evidence.support_krw=p_transaction.support_krw then'settled'else'refund_correction_required'end,
  'settlementEvidenceAt',evidence.evidence_at,
  'finishAllowed',p_transaction.store='apple' and p_transaction.ticket_ledger_id is not null and p_transaction.state='granted',
  'consumeAllowed',p_transaction.store='google' and p_transaction.ticket_ledger_id is not null and p_transaction.state='granted')
  from(values(1))x(n)left join public.mobile_store_purchase_intents i on i.id=p_transaction.intent_id left join public.celebrities c on c.id=i.celebrity_id
  left join lateral(select e.* from public.mobile_store_support_settlement_evidence e where e.transaction_id=p_transaction.id order by e.created_at desc,e.id desc limit 1)evidence on true $$;

create function public.mobile_store_apply_verified_transaction(
  p_store text,p_environment text,p_external_transaction_id text,p_profile_id uuid,p_product_id text,p_currency text,
  p_amount_krw bigint,p_refunded_krw bigint,p_store_state text,p_verification_fingerprint text,p_store_event_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_tx public.mobile_store_transactions%rowtype;v_intent public.mobile_store_purchase_intents%rowtype;
  v_desired_reverse bigint;v_reverse_delta bigint;v_desired_support bigint;v_support_delta bigint;v_ticket jsonb;v_reason text;
  v_profile_matches boolean:=true;
begin
  if p_store not in ('apple','google') or p_environment not in ('sandbox','production')
    or p_store_state not in ('pending','purchased','revoked') or p_refunded_krw is null or p_refunded_krw<0
    or p_external_transaction_id is null or btrim(p_external_transaction_id)='' or p_product_id is null or btrim(p_product_id)=''
    or p_verification_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'MOBILE_STORE_VERIFICATION_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile-store:'||p_store||':'||p_environment||':'||p_external_transaction_id,0));
  select * into v_tx from public.mobile_store_transactions where store=p_store and environment=p_environment and external_transaction_id=p_external_transaction_id for update;
  if not found then
    insert into public.mobile_store_transactions(store,environment,external_transaction_id,product_id,currency,amount_krw,
      refunded_krw,state,pending_reason,verification_fingerprint,store_event_at,verified_at)
    values(p_store,p_environment,p_external_transaction_id,p_product_id,p_currency,case when p_amount_krw>0 then p_amount_krw else null end,
      least(p_refunded_krw,case when p_amount_krw>0 then p_amount_krw else p_refunded_krw end),
      'pending','manual_review',p_verification_fingerprint,p_store_event_at,pg_catalog.clock_timestamp()) returning * into v_tx;
  elsif v_tx.product_id<>p_product_id or (v_tx.amount_krw is not null and p_amount_krw is not null and v_tx.amount_krw<>p_amount_krw)
    or (v_tx.currency is not null and p_currency is not null and v_tx.currency<>p_currency) then
    update public.mobile_store_transactions set state='pending',pending_reason='manual_review',updated_at=pg_catalog.clock_timestamp(),verified_at=pg_catalog.clock_timestamp()
      where id=v_tx.id returning * into v_tx;
    return public.mobile_store_project_transaction(v_tx);
  end if;
  if v_tx.intent_id is null and p_profile_id is not null then
    select i.* into v_intent from public.mobile_store_intent_profiles profile
      join public.mobile_store_purchase_intents i on i.id=profile.intent_id
      where profile.store=p_store and profile.profile_id=p_profile_id;
  elsif v_tx.intent_id is not null then
    select * into v_intent from public.mobile_store_purchase_intents where id=v_tx.intent_id;
    if p_profile_id is not null then
      select exists(select 1 from public.mobile_store_intent_profiles profile
        where profile.intent_id=v_tx.intent_id and profile.store=p_store and profile.profile_id=p_profile_id) into v_profile_matches;
    end if;
  end if;
  v_reason:=case
    when p_environment<>'sandbox' then 'production_rejected'
    when v_intent.id is null then 'missing_intent'
    when v_intent.store<>p_store or not v_profile_matches then 'account_mismatch'
    when v_intent.product_id<>p_product_id then 'product_mismatch'
    when p_currency is null then 'amount_unknown'
    when p_currency<>'KRW' or v_intent.currency<>p_currency then 'currency_mismatch'
    when p_amount_krw is null or p_amount_krw<=0 then 'amount_unknown'
    when p_store_state='pending' then 'store_pending'
    else null end;
  update public.mobile_store_transactions set intent_id=coalesce(intent_id,v_intent.id),app_user_id=coalesce(app_user_id,v_intent.app_user_id),
    celebrity_id=coalesce(celebrity_id,v_intent.celebrity_id),currency=coalesce(currency,p_currency),amount_krw=coalesce(amount_krw,p_amount_krw),
    refunded_krw=greatest(refunded_krw,least(p_refunded_krw,coalesce(p_amount_krw,amount_krw,p_refunded_krw))),
    ticket_quantity=coalesce(ticket_quantity,v_intent.ticket_quantity),support_rate_bps=coalesce(support_rate_bps,v_intent.support_rate_bps),
    reward_policy_version=coalesce(reward_policy_version,v_intent.reward_policy_version),verification_fingerprint=p_verification_fingerprint,
    store_event_at=greatest(store_event_at,p_store_event_at),verified_at=pg_catalog.clock_timestamp(),updated_at=pg_catalog.clock_timestamp(),
    state='pending',pending_reason=coalesce(v_reason,'manual_review')
    where id=v_tx.id returning * into v_tx;
  if v_reason is not null then return public.mobile_store_project_transaction(v_tx); end if;
  if not exists(select 1 from public.app_users where id=v_intent.app_user_id and status='active') then
    update public.mobile_store_transactions set state='pending',pending_reason='account_unavailable',updated_at=pg_catalog.clock_timestamp() where id=v_tx.id returning * into v_tx;
    return public.mobile_store_project_transaction(v_tx);
  end if;
  if p_store_state='revoked' and v_tx.ticket_ledger_id is null then
    update public.mobile_store_transactions set state='revoked',pending_reason=null,updated_at=pg_catalog.clock_timestamp() where id=v_tx.id returning * into v_tx;
    return public.mobile_store_project_transaction(v_tx);
  end if;
  if v_tx.ticket_ledger_id is null then
    v_ticket:=public.mobile_store_post_paid_ticket_entry(v_intent.app_user_id,v_intent.celebrity_id,v_tx.id,'credit',v_intent.ticket_quantity,null);
    update public.mobile_store_transactions set ticket_ledger_id=(v_ticket->>'entryId')::uuid,state='granted',pending_reason=null,
      updated_at=pg_catalog.clock_timestamp()
      where id=v_tx.id returning * into v_tx;
    update public.mobile_store_purchase_intents set completed_at=coalesce(completed_at,pg_catalog.clock_timestamp()) where id=v_intent.id;
  end if;
  v_desired_reverse:=least(v_tx.ticket_quantity,pg_catalog.floor((v_tx.ticket_quantity::numeric*v_tx.refunded_krw)/v_tx.amount_krw)::bigint);
  v_reverse_delta:=v_desired_reverse-v_tx.ticket_reversed;
  if v_reverse_delta>0 then
    begin
      perform public.mobile_store_post_paid_ticket_entry(v_intent.app_user_id,v_intent.celebrity_id,v_tx.id,'debit',-v_reverse_delta,v_tx.refunded_krw);
      update public.mobile_store_transactions set ticket_reversed=v_desired_reverse where id=v_tx.id returning * into v_tx;
    exception when check_violation or raise_exception then
      update public.mobile_store_transactions set state='pending',pending_reason='insufficient_balance',updated_at=pg_catalog.clock_timestamp() where id=v_tx.id returning * into v_tx;
      return public.mobile_store_project_transaction(v_tx);
    end;
  end if;
  v_desired_support:=pg_catalog.floor(((v_tx.amount_krw-v_tx.refunded_krw)::numeric*v_tx.support_rate_bps)/10000)::bigint;
  v_support_delta:=v_desired_support-v_tx.support_krw;
  if v_support_delta<>0 then
    insert into public.mobile_store_support_ledger(transaction_id,app_user_id,celebrity_id,amount_delta_krw,resulting_support_krw,cumulative_refunded_krw)
      values(v_tx.id,v_intent.app_user_id,v_intent.celebrity_id,v_support_delta,v_desired_support,v_tx.refunded_krw) on conflict do nothing;
    update public.mobile_store_transactions set support_krw=v_desired_support where id=v_tx.id returning * into v_tx;
  end if;
  update public.mobile_store_transactions set state=case when refunded_krw>=amount_krw or p_store_state='revoked' then 'revoked' else 'granted' end,
    pending_reason=null,updated_at=pg_catalog.clock_timestamp() where id=v_tx.id returning * into v_tx;
  return public.mobile_store_project_transaction(v_tx);
end $$;

create function public.mobile_store_apply_owned_verified_transaction(
  p_app_user_id uuid,p_store text,p_environment text,p_external_transaction_id text,p_profile_id uuid,p_product_id text,p_currency text,
  p_amount_krw bigint,p_refunded_krw bigint,p_store_state text,p_verification_fingerprint text,p_store_event_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_profile_id is null or not exists(select 1 from public.mobile_store_intent_profiles
    where app_user_id=p_app_user_id and store=p_store and profile_id=p_profile_id) then
    raise exception 'MOBILE_STORE_ACCOUNT_MISMATCH' using errcode='42501';
  end if;
  return public.mobile_store_apply_verified_transaction(p_store,p_environment,p_external_transaction_id,p_profile_id,p_product_id,p_currency,
    p_amount_krw,p_refunded_krw,p_store_state,p_verification_fingerprint,p_store_event_at);
end $$;

create function public.mobile_store_get_owned_transactions(p_app_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  return jsonb_build_object('transactions',coalesce((select jsonb_agg(public.mobile_store_project_transaction(t) order by t.created_at desc,t.id desc)
    from public.mobile_store_transactions t where t.app_user_id=p_app_user_id),'[]'::jsonb));
end $$;

create function public.mobile_store_get_owned_support(p_app_user_id uuid,p_celebrity_slug text,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=''as $$declare v_celebrity uuid;begin
  perform public.fan_web_lock_active_user(p_app_user_id);if p_limit not between 1 and 100 then raise exception'MOBILE_STORE_INVALID';end if;
  select id into v_celebrity from public.celebrities where slug=p_celebrity_slug and status='published'and archived_at is null;if v_celebrity is null then raise exception'MOBILE_STORE_FAVORITE_UNAVAILABLE';end if;
  return jsonb_build_object('celebrityId',v_celebrity,'totalSupportKrw',(select coalesce(sum(t.support_krw),0)from public.mobile_store_transactions t where t.app_user_id=p_app_user_id and t.celebrity_id=v_celebrity),
    'purchases',coalesce((select jsonb_agg(jsonb_build_object('transactionId',t.id,'storeTransactionId',t.external_transaction_id,'productId',i.product_id,'policyVersion',i.policy_version,'ticketQuantity',i.ticket_quantity,'supportRateBps',i.support_rate_bps,'amountKrw',t.amount_krw,'refundedKrw',t.refunded_krw,'supportKrw',t.support_krw,'state',t.state,'purchasedAt',t.store_event_at,'refundStatus',case when t.state='revoked'or(t.amount_krw is not null and t.refunded_krw>=t.amount_krw)then'fully_refunded'when t.refunded_krw>0 then'partially_refunded'else'none'end,'settlementStatus',case when t.support_krw=0 and evidence.id is null then'not_applicable'when evidence.id is null then'pending'when evidence.support_krw=t.support_krw then'settled'else'refund_correction_required'end,'settledSupportKrw',evidence.support_krw,'settlementEvidenceAt',evidence.evidence_at)order by t.created_at desc,t.id desc)from(select*from public.mobile_store_transactions where app_user_id=p_app_user_id and celebrity_id=v_celebrity order by created_at desc,id desc limit p_limit)t join public.mobile_store_purchase_intents i on i.id=t.intent_id left join lateral(select e.*from public.mobile_store_support_settlement_evidence e where e.transaction_id=t.id order by e.created_at desc,e.id desc limit 1)evidence on true),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'transactionId',l.transaction_id,'amountDeltaKrw',l.amount_delta_krw,'resultingTransactionSupportKrw',l.resulting_support_krw,'cumulativeRefundedKrw',l.cumulative_refunded_krw,'correctionType',case when l.amount_delta_krw<0 then'refund_adjustment'else'purchase'end,'settlementStatus',case when t.support_krw=0 and evidence.id is null then'not_applicable'when evidence.id is null then'pending'when evidence.support_krw=t.support_krw then'settled'else'refund_correction_required'end,'settlementEvidenceAt',evidence.evidence_at,'createdAt',l.created_at)order by l.created_at desc,l.id desc)from(select*from public.mobile_store_support_ledger where app_user_id=p_app_user_id and celebrity_id=v_celebrity order by created_at desc,id desc limit p_limit)l join public.mobile_store_transactions t on t.id=l.transaction_id left join lateral(select e.*from public.mobile_store_support_settlement_evidence e where e.transaction_id=t.id order by e.created_at desc,e.id desc limit 1)evidence on true),'[]'::jsonb));
end $$;

create function public.mobile_store_admin_mark_reviewed(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,
  p_correlation_id uuid,p_transaction_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare before_row jsonb;
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  select to_jsonb(t) into before_row from public.mobile_store_transactions t where id=p_transaction_id for update;
  if before_row is null then raise exception 'MOBILE_STORE_TRANSACTION_NOT_FOUND'; end if;
  update public.mobile_store_transactions set state='pending',pending_reason='manual_review',updated_at=pg_catalog.clock_timestamp() where id=p_transaction_id;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary,correlation_id)
    values(p_actor_app_user_id,p_actor_admin_allowlist_id,'mobile_store.reviewed','mobile_store_transaction',p_transaction_id::text,
      jsonb_build_object('before',before_row-'verification_fingerprint','after',jsonb_build_object('state','pending','pendingReason','manual_review'),'reason',left(p_reason,500)),p_correlation_id);
end $$;

create function public.mobile_store_admin_record_support_settlement(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_transaction_id uuid,p_support_krw bigint,p_evidence_at timestamptz,p_evidence_reference text,p_reason text)
returns jsonb language plpgsql security definer set search_path=''as $$declare tx public.mobile_store_transactions%rowtype;evidence public.mobile_store_support_settlement_evidence%rowtype;begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  if p_support_krw is null or p_support_krw<0 or p_evidence_at is null or length(btrim(coalesce(p_evidence_reference,'')))not between 1 and 500 or length(btrim(coalesce(p_reason,'')))not between 10 and 1000 then raise exception'MOBILE_STORE_SETTLEMENT_INVALID';end if;
  select*into tx from public.mobile_store_transactions where id=p_transaction_id for update;if not found then raise exception'MOBILE_STORE_TRANSACTION_NOT_FOUND';end if;
  if tx.intent_id is null or tx.app_user_id is null or tx.celebrity_id is null or tx.state='pending'or tx.support_krw<>p_support_krw then raise exception'MOBILE_STORE_SETTLEMENT_STATE_CONFLICT';end if;
  insert into public.mobile_store_support_settlement_evidence(transaction_id,support_krw,evidence_at,evidence_reference,actor_app_user_id,actor_admin_allowlist_id,correlation_id)
    values(tx.id,p_support_krw,p_evidence_at,btrim(p_evidence_reference),p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id)returning*into evidence;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary,correlation_id)
    values(p_actor_app_user_id,p_actor_admin_allowlist_id,'mobile_store.support_settlement.recorded','mobile_store_transaction',tx.id::text,jsonb_build_object('supportKrw',p_support_krw,'evidenceAt',p_evidence_at,'reason',btrim(p_reason)),p_correlation_id);
  return jsonb_build_object('transactionId',tx.id,'supportKrw',evidence.support_krw,'status','settled','evidenceAt',evidence.evidence_at,'createdAt',evidence.created_at);
exception when unique_violation then raise exception'MOBILE_STORE_SETTLEMENT_DUPLICATE';end$$;

alter table public.mobile_store_product_policies enable row level security;alter table public.mobile_store_product_policies force row level security;
alter table public.mobile_store_sandbox_testers enable row level security;alter table public.mobile_store_sandbox_testers force row level security;
alter table public.mobile_store_purchase_intents enable row level security;alter table public.mobile_store_purchase_intents force row level security;
alter table public.mobile_store_intent_profiles enable row level security;alter table public.mobile_store_intent_profiles force row level security;
alter table public.mobile_store_paid_ticket_ledger enable row level security;alter table public.mobile_store_paid_ticket_ledger force row level security;
alter table public.mobile_store_transactions enable row level security;alter table public.mobile_store_transactions force row level security;
alter table public.mobile_store_support_ledger enable row level security;alter table public.mobile_store_support_ledger force row level security;
alter table public.mobile_store_support_settlement_evidence enable row level security;alter table public.mobile_store_support_settlement_evidence force row level security;
revoke all on public.mobile_store_product_policies,public.mobile_store_sandbox_testers,public.mobile_store_purchase_intents,public.mobile_store_intent_profiles,public.mobile_store_paid_ticket_ledger,public.mobile_store_transactions,public.mobile_store_support_ledger,public.mobile_store_support_settlement_evidence from public,anon,authenticated,service_role;
revoke all on function public.reject_mobile_store_immutable_mutation(),public.guard_mobile_store_product_policy_mutation(),public.mobile_store_list_products(uuid,text,text),
  public.mobile_store_create_intent(uuid,text,text,text,text,uuid),public.mobile_store_project_transaction(public.mobile_store_transactions),
  public.mobile_store_post_paid_ticket_entry(uuid,uuid,uuid,text,bigint,bigint),
  public.mobile_store_apply_verified_transaction(text,text,text,uuid,text,text,bigint,bigint,text,text,timestamptz),
  public.mobile_store_apply_owned_verified_transaction(uuid,text,text,text,uuid,text,text,bigint,bigint,text,text,timestamptz),
  public.mobile_store_get_owned_transactions(uuid),public.mobile_store_get_owned_support(uuid,text,integer),public.mobile_store_admin_mark_reviewed(uuid,uuid,uuid,uuid,text),public.mobile_store_admin_record_support_settlement(uuid,uuid,uuid,uuid,bigint,timestamptz,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.mobile_store_list_products(uuid,text,text),public.mobile_store_create_intent(uuid,text,text,text,text,uuid),
  public.mobile_store_apply_verified_transaction(text,text,text,uuid,text,text,bigint,bigint,text,text,timestamptz),
  public.mobile_store_apply_owned_verified_transaction(uuid,text,text,text,uuid,text,text,bigint,bigint,text,text,timestamptz),
  public.mobile_store_get_owned_transactions(uuid),public.mobile_store_get_owned_support(uuid,text,integer),public.mobile_store_admin_mark_reviewed(uuid,uuid,uuid,uuid,text),public.mobile_store_admin_record_support_settlement(uuid,uuid,uuid,uuid,bigint,timestamptz,text,text) to service_role;

alter function public.scrub_account_deletion(uuid) rename to scrub_account_deletion_before_mobile_store;
create function public.scrub_account_deletion(p_app_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
  if not public.fan_web_account_erasing(p_app_user_id) then raise exception 'ACCOUNT_DELETION_UNAVAILABLE'; end if;
  delete from public.mobile_store_intent_profiles where app_user_id=p_app_user_id;
  delete from public.mobile_store_sandbox_testers where app_user_id=p_app_user_id;
  perform public.scrub_account_deletion_before_mobile_store(p_app_user_id);
end $$;
revoke all on function public.scrub_account_deletion_before_mobile_store(uuid),public.scrub_account_deletion(uuid) from public,anon,authenticated,service_role;
grant execute on function public.scrub_account_deletion(uuid) to service_role;
