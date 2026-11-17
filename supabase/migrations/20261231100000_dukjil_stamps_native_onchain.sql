set local lock_timeout = '5s';
-- ONCHAIN-STAMPS-IMPL-1117: dukjil stamps leave the retired legacy queue and go to the native Fan Action lane.
-- Since 11/11 dukjil_issue_stamp(_base) wrote every new stamp to blockchain_jobs, which nothing claims after the 10/30 legacy
-- retirement (about 2,049 stamps). This migration:
--   1. routes new dukjil stamps to enqueue_fan_action_source: daily_checkin -> 10, first_comment -> 8, the dukjil policy kinds -> 12;
--      the canonical key is 'dukjil:<kind>:<source key>:<user>' (dukjil keys such as '<creator>:<day>' or a live event id repeat
--      across kinds), the occurrence time is the stamp's issued_at and the stamp id keeps its operation and issuance keys;
--   2. keeps the action and the stamp when the chain cannot take it yet (user decision A, 11/17): the stamp is saved with
--      onchain_hold_reason (CREATOR_NOT_VERIFIED, ROUTE_DISABLED, UNSUPPORTED_KIND, ENQUEUE_FAILED) and no chain lane; a
--      finalized creator registration releases that creator's held stamps, release_held_community_stamps releases the rest;
--   3. adds a recovery manifest for the legacy backlog: build_community_stamp_recovery_manifest fixes the list (cutoff, items,
--      counts, sha256), run_community_stamp_recovery enqueues manifest items H2 through the same native path at most
--      daily_cap (500) per UTC day, linking the legacy job through fan_action_credentials.legacy_job_id. The legacy job and the
--      stamp row are not rewritten. The Hub's importHistorical lane is not used: it needs a Merkle batch registered by the
--      Hub admin, which is a 48 hour timelock (scripts/deploy-action-hub-giwa.mjs TIMELOCK_DELAY_SECONDS).
-- Not changed: return values, points, stamp counts and duplicate rules of every dukjil RPC; share/first_clip code 12 issuance;
-- the legacy retirement (legacy jobs stay unclaimed, and a recovered job is excluded from claim even if retirement is undone).
-- Installed definitions are patched by exact anchors; any drift aborts the whole migration.
-- A database without the Fan Action lane (no binding, route or outbox row, no legacy retirement column, no code 12 block in
-- enqueue_fan_action_source: the DEV database on 11/17) gets the new columns, tables and functions but keeps its issuer,
-- enqueue and claim definitions, with a DUKJIL_NATIVE_LANE_ABSENT notice. Any one of those signs present (production, a clean
-- migration chain) makes every anchor mandatory, so a missing anchor still aborts with DRIFT.
-- Rollback: supabase/rollback/20261231100000_dukjil_stamps_native_onchain.sql

-- 1. Hold state on the stamp row ------------------------------------------------------------------------------------------
alter table public.community_stamps
  add column onchain_hold_reason text check (onchain_hold_reason in
    ('PENDING_ENQUEUE','CREATOR_NOT_VERIFIED','ROUTE_DISABLED','UNSUPPORTED_KIND','ENQUEUE_FAILED')),
  add column onchain_held_at timestamptz,
  add column onchain_hold_detail text check (length(onchain_hold_detail) <= 300);
alter table public.community_stamps drop constraint community_stamps_exactly_one_chain_lane;
alter table public.community_stamps add constraint community_stamps_exactly_one_chain_lane
  check (num_nonnulls(blockchain_job_id, fan_action_outbox_id) = 1
    or (blockchain_job_id is null and fan_action_outbox_id is null and onchain_hold_reason is not null)) not valid;
alter table public.community_stamps add constraint community_stamps_hold_without_lane
  check (onchain_hold_reason is null or (blockchain_job_id is null and fan_action_outbox_id is null and onchain_held_at is not null)) not valid;
create index community_stamps_onchain_hold_idx on public.community_stamps(celebrity_id, issued_at, id)
  where onchain_hold_reason is not null;

-- A held stamp may receive its outbox once; an assigned outbox stays immutable.
create function public.reject_community_stamp_lane_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.fan_action_outbox_id is distinct from new.fan_action_outbox_id
    and not (old.fan_action_outbox_id is null and old.blockchain_job_id is null and old.onchain_hold_reason is not null
      and new.onchain_hold_reason is null) then
    raise exception 'credential fan action link is immutable once assigned';
  end if;
  return new;
end $$;
drop trigger community_stamps_fan_action_link_immutable on public.community_stamps;
create trigger community_stamps_fan_action_link_immutable before update of fan_action_outbox_id on public.community_stamps
  for each row execute function public.reject_community_stamp_lane_mutation();

do $$
declare signature regprocedure := 'public.assert_community_stamp_blockchain_job_link()'::regprocedure; definition text;
  anchor text := $a$  if new.fan_action_outbox_id is not null then
$a$;
begin
  definition := pg_get_functiondef(signature);
  if length(definition) - length(replace(definition, anchor, '')) <> length(anchor) then
    raise exception 'DUKJIL_NATIVE_STAMP_LINK_PATCH_DRIFT'; end if;
  execute replace(definition, anchor, $p$  if new.fan_action_outbox_id is null and new.blockchain_job_id is null then
    if new.onchain_hold_reason is null or new.mint_status <> 'queued' or new.tx_hash is not null or new.token_id is not null then
      raise exception 'community stamp chain lane is missing'; end if;
    return new;
  end if;
$p$ || anchor);
end $$;

-- 2. Routing helpers ------------------------------------------------------------------------------------------------------
create function public.community_stamp_onchain_code(p_kind public.community_stamp_kind, p_celebrity uuid) returns integer
language sql immutable set search_path = '' as $$
  select case when p_celebrity is null then null
    when p_kind = 'daily_checkin' then 10
    when p_kind = 'first_comment' then 8
    when p_kind::text = any(array['post','comment','reaction','live_reserve','live_attend','survey','mission','event_checkin',
      'event_review','cheer','proof','quiz','steady_checkin','subscription','share']) then 12 end
$$;

-- null = the chain lane can take this stamp now. Same route, canary and finalized-registration rules as the native producers.
create function public.community_stamp_onchain_hold_reason(p_user uuid, p_celebrity uuid, p_kind public.community_stamp_kind)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_code integer := public.community_stamp_onchain_code(p_kind, p_celebrity); v_binding uuid; v_enabled boolean; v_version integer;
begin
  if v_code is null then return 'UNSUPPORTED_KIND'; end if;
  select route.binding_id, route.enabled, binding.binding_version into v_binding, v_enabled, v_version
    from public.fan_action_producer_routes route join public.fan_action_bindings binding on binding.id = route.binding_id
    where route.action_code = v_code;
  if v_binding is null or not v_enabled or v_version <> 2
    or (exists(select 1 from public.fan_action_canary_scope scope where scope.action_code = v_code)
      and not exists(select 1 from public.fan_action_canary_scope scope where scope.action_code = v_code and scope.app_user_id = p_user)) then
    return 'ROUTE_DISABLED'; end if;
  if not exists(select 1 from public.fan_action_verified_creators verified
      where verified.binding_id = v_binding and verified.creator_id = p_celebrity) then
    return 'CREATOR_NOT_VERIFIED'; end if;
  return null;
end $$;

-- The source evidence of a dukjil occurrence is the stamp row itself (validated on insert by assert_community_stamp_source).
-- A new or held stamp has no chain lane; a backlog stamp has a still-unsubmitted legacy job that the retirement keeps unclaimed.
create function public.assert_dukjil_stamp_occurrence(
  p_namespace text, p_source_key text, p_app_user_id uuid, p_creator_id uuid, p_campaign_id uuid,
  p_occurred_at timestamptz, p_action_code integer, p_credentials jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare s public.community_stamps; j public.blockchain_jobs; c jsonb := p_credentials -> 0; v_entity uuid; v_wallet text;
begin
  if p_namespace is distinct from 'community_stamps' or p_campaign_id is not null or p_creator_id is null
    or jsonb_typeof(p_credentials) is distinct from 'array' or jsonb_array_length(p_credentials) <> 1
    or c ->> 'entityType' is distinct from 'community_stamp' or c ->> 'kind' is distinct from '1' then
    raise exception 'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL'; end if;
  begin v_entity := (c ->> 'entityId')::uuid; exception when others then raise exception 'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL'; end;
  select * into s from public.community_stamps stamp where stamp.id = v_entity;
  select lower(wallet.address) into v_wallet from public.user_wallets wallet where wallet.app_user_id = p_app_user_id
    and wallet.chain_id = 91342 and wallet.provider = 'privy' and wallet.wallet_type = 'embedded';
  if s.id is null or s.app_user_id is distinct from p_app_user_id or s.celebrity_id is distinct from p_creator_id
    or s.policy_version is null or s.fan_action_outbox_id is not null
    or p_source_key is distinct from 'dukjil:' || s.kind::text || ':' || s.source_key || ':' || s.app_user_id::text
    or p_occurred_at is distinct from s.issued_at
    or public.community_stamp_onchain_code(s.kind, s.celebrity_id) is distinct from p_action_code
    or c -> 'legacyPayload' ->> 'stampKind' is distinct from s.kind::text
    or c -> 'legacyPayload' ->> 'celebritySlug' is distinct from (select slug from public.celebrities where id = s.celebrity_id)
    or lower(c -> 'legacyPayload' ->> 'recipient') is distinct from v_wallet
    or c ->> 'operationKey' is distinct from 'byus:community-stamp:v1:' || s.id::text
    or c ->> 'issuanceKey' is distinct from '0x' || encode(extensions.digest(c ->> 'operationKey', 'sha256'), 'hex')
    or c -> 'legacyPayload' ->> 'issuanceId' is distinct from c ->> 'issuanceKey' then
    raise exception 'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL'; end if;
  if s.blockchain_job_id is null then
    if s.onchain_hold_reason is null then raise exception 'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL'; end if;
  else
    select * into j from public.blockchain_jobs job where job.id = s.blockchain_job_id for update;
    if j.id is null or j.entity_type <> 'community_stamp' or j.entity_id <> s.id or j.status <> 'PENDING' or j.tx_hash is not null
      or j.payload ? 'workerSubmission' or j.payload is distinct from c -> 'legacyPayload'
      or not coalesce((select policy.legacy_credential_issuance_retired from public.mint_dispatch_policy policy where policy.singleton), false) then
      raise exception 'FAN_ACTION_LEGACY_SUBMISSION_UNRESOLVED'; end if;
  end if;
  if not exists(select 1 from public.fan_action_producer_routes route join public.fan_action_verified_creators verified
      on verified.binding_id = route.binding_id where route.action_code = p_action_code and verified.creator_id = p_creator_id) then
    raise exception 'FAN_ACTION_CONTEXT_NOT_VERIFIED'; end if;
end $$;

-- Shared trust boundary: dukjil keys are checked against their stamp row; share/first_clip keep their own proofs.
do $$
declare signature regprocedure := 'public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)'::regprocedure;
  definition text; anchors text[] := array[
    $a1$  if p_action_code=12 then
$a1$,
    $a2$      or not coalesce(p_credentials->0->'legacyPayload'->>'stampKind' in ('share','first_clip'),false)
$a2$,
    $a3$    perform public.assert_community_stamp_source(p_app_user_id,p_creator_id,
      (p_credentials->0->'legacyPayload'->>'stampKind')::public.community_stamp_kind,
      left(p_source_key,length(p_source_key)-37));
$a3$];
  replacements text[] := array[
    $r1$  if left(p_source_key,7)='dukjil:' then
    perform public.assert_dukjil_stamp_occurrence(p_namespace,p_source_key,p_app_user_id,p_creator_id,p_campaign_id,
      p_occurred_at,p_action_code,p_credentials);
  end if;
  if p_action_code=12 then
$r1$,
    $r2$      or not (coalesce(p_credentials->0->'legacyPayload'->>'stampKind' in ('share','first_clip'),false) or left(p_source_key,7)='dukjil:')
$r2$,
    $r3$    if left(p_source_key,7) is distinct from 'dukjil:' then
    perform public.assert_community_stamp_source(p_app_user_id,p_creator_id,
      (p_credentials->0->'legacyPayload'->>'stampKind')::public.community_stamp_kind,
      left(p_source_key,length(p_source_key)-37));
    end if;
$r3$];
  i integer;
begin
  if not (exists(select 1 from public.fan_action_bindings) or exists(select 1 from public.fan_action_producer_routes)
      or exists(select 1 from public.fan_action_outbox)
      or exists(select 1 from pg_catalog.pg_attribute where attrelid = 'public.mint_dispatch_policy'::regclass
        and attname = 'legacy_credential_issuance_retired' and not attisdropped)
      or position('p_action_code=12' in pg_get_functiondef(
        'public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)'::regprocedure)) > 0) then
    raise notice 'DUKJIL_NATIVE_LANE_ABSENT: %', 'enqueue_fan_action_source unchanged';
    return;
  end if;
  definition := pg_get_functiondef(signature);
  for i in 1..3 loop
    if length(definition) - length(replace(definition, anchors[i], '')) <> length(anchors[i]) then
      raise exception 'DUKJIL_NATIVE_ENQUEUE_PATCH_DRIFT: %', i; end if;
    definition := replace(definition, anchors[i], replacements[i]);
  end loop;
  execute definition;
end $$;

-- A legacy job linked to any fan action credential is never claimed by the legacy worker (also if retirement is undone).
do $$
declare signature regprocedure := 'public.claim_blockchain_jobs(text,integer,integer,text[])'::regprocedure; definition text;
  anchor text := $a$where c.legacy_job_id=blockchain_jobs.id and a.operation_kind='import_historical')$a$;
begin
  if not (exists(select 1 from public.fan_action_bindings) or exists(select 1 from public.fan_action_producer_routes)
      or exists(select 1 from public.fan_action_outbox)
      or exists(select 1 from pg_catalog.pg_attribute where attrelid = 'public.mint_dispatch_policy'::regclass
        and attname = 'legacy_credential_issuance_retired' and not attisdropped)
      or position('p_action_code=12' in pg_get_functiondef(
        'public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)'::regprocedure)) > 0) then
    raise notice 'DUKJIL_NATIVE_LANE_ABSENT: %', 'claim_blockchain_jobs unchanged';
    return;
  end if;
  definition := pg_get_functiondef(signature);
  if length(definition) - length(replace(definition, anchor, '')) <> length(anchor) then
    raise exception 'DUKJIL_NATIVE_CLAIM_PATCH_DRIFT'; end if;
  execute replace(definition, anchor, $p$where c.legacy_job_id=blockchain_jobs.id and a.operation_kind in ('import_historical','record_and_issue'))$p$);
end $$;

-- 3. Native enqueue for one stamp (new, held or backlog) ------------------------------------------------------------------
create function public.community_stamp_enqueue_native(p_stamp_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.community_stamps; v_payload jsonb; v_op text; v_outbox uuid; v_recipient text; v_slug text;
begin
  select * into strict s from public.community_stamps stamp where stamp.id = p_stamp_id for update;
  if s.fan_action_outbox_id is not null then return s.fan_action_outbox_id; end if;
  select credential.outbox_id into v_outbox from public.fan_action_credentials credential
    where credential.entity_type = 'community_stamp' and credential.entity_id = s.id limit 1;
  if v_outbox is not null then return v_outbox; end if;
  v_op := 'byus:community-stamp:v1:' || s.id::text;
  if s.blockchain_job_id is not null then
    select job.payload into strict v_payload from public.blockchain_jobs job where job.id = s.blockchain_job_id;
  else
    select wallet.address into v_recipient from public.user_wallets wallet where wallet.app_user_id = s.app_user_id
      and wallet.chain_id = 91342 and wallet.provider = 'privy' and wallet.wallet_type = 'embedded';
    select celebrity.slug into v_slug from public.celebrities celebrity where celebrity.id = s.celebrity_id;
    v_payload := jsonb_build_object('recipient', v_recipient, 'issuanceId', '0x' || encode(extensions.digest(v_op, 'sha256'), 'hex'),
      'stampKind', s.kind::text, 'celebritySlug', v_slug);
  end if;
  v_outbox := public.enqueue_fan_action_source('community_stamps',
    'dukjil:' || s.kind::text || ':' || s.source_key || ':' || s.app_user_id::text, s.app_user_id, s.celebrity_id, null,
    s.issued_at, public.community_stamp_onchain_code(s.kind, s.celebrity_id), jsonb_build_array(jsonb_build_object(
      'entityType', 'community_stamp', 'entityId', s.id, 'kind', 1,
      'issuanceKey', '0x' || encode(extensions.digest(v_op, 'sha256'), 'hex'), 'operationKey', v_op, 'legacyPayload', v_payload)));
  if s.blockchain_job_id is not null then
    update public.fan_action_credentials credential set legacy_job_id = s.blockchain_job_id
      where credential.outbox_id = v_outbox and credential.entity_type = 'community_stamp' and credential.entity_id = s.id
        and credential.legacy_job_id is null;
  else
    -- onchain_held_at stays only on stamps that really waited (a stamp enqueued in its own transaction never did).
    update public.community_stamps stamp set fan_action_outbox_id = v_outbox, onchain_hold_reason = null, onchain_hold_detail = null,
        onchain_held_at = case when s.onchain_hold_reason = 'PENDING_ENQUEUE' then null else s.onchain_held_at end
      where stamp.id = s.id;
    perform public.assert_fan_action_credential_link(v_outbox, 'community_stamp', s.id, s.app_user_id, s.mint_status, null, null);
  end if;
  return v_outbox;
end $$;

-- 4. Issuer: same lookups, keys, errors and return value; the chain lane changes ------------------------------------------
do $issuer$
begin
  if not (exists(select 1 from public.fan_action_bindings) or exists(select 1 from public.fan_action_producer_routes)
      or exists(select 1 from public.fan_action_outbox)
      or exists(select 1 from pg_catalog.pg_attribute where attrelid = 'public.mint_dispatch_policy'::regclass
        and attname = 'legacy_credential_issuance_retired' and not attisdropped)
      or position('p_action_code=12' in pg_get_functiondef(
        'public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)'::regprocedure)) > 0) then
    raise notice 'DUKJIL_NATIVE_LANE_ABSENT: %', 'dukjil_issue_stamp_base still writes the legacy queue';
    return;
  end if;
  execute $fn$
create or replace function public.dukjil_issue_stamp_base(
  p_user uuid, p_celebrity uuid, p_kind public.community_stamp_kind, p_source_key text, p_policy integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_recipient text; v_slug text; v_id uuid := extensions.gen_random_uuid(); v_existing uuid; v_reason text;
  v_msg text; v_state text;
begin
  if p_user is null or p_kind is null or p_source_key is null then
    raise exception 'COMMUNITY_STAMP_INVALID_REQUEST' using errcode = 'P0001'; end if;
  select id into v_existing from public.community_stamps
    where app_user_id = p_user and kind = p_kind and source_key = p_source_key;
  if v_existing is not null then return v_existing; end if;
  select wallet.address into v_recipient from public.user_wallets wallet
    where wallet.app_user_id = p_user and wallet.chain_id = 91342 and wallet.provider = 'privy'
      and wallet.wallet_type = 'embedded' for key share;
  if v_recipient is null then raise exception 'COMMUNITY_STAMP_WALLET_NOT_READY' using errcode = 'P0001'; end if;
  if p_celebrity is not null then
    select celebrity.slug into v_slug from public.celebrities celebrity
      where celebrity.id = p_celebrity and celebrity.status = 'published' and celebrity.archived_at is null for key share;
    if v_slug is null then raise exception 'COMMUNITY_STAMP_NOT_FOUND' using errcode = 'P0001'; end if;
  end if;
  v_reason := public.community_stamp_onchain_hold_reason(p_user, p_celebrity, p_kind);
  insert into public.community_stamps(id, app_user_id, celebrity_id, kind, source_key, policy_version,
      onchain_hold_reason, onchain_held_at)
    values (v_id, p_user, p_celebrity, p_kind, p_source_key, p_policy, coalesce(v_reason, 'PENDING_ENQUEUE'), pg_catalog.clock_timestamp());
  if v_reason is null then
    begin
      perform public.community_stamp_enqueue_native(v_id);
    exception when others then
      get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
      update public.community_stamps set onchain_hold_reason = 'ENQUEUE_FAILED',
          onchain_hold_detail = left(v_state || ' ' || v_msg, 300)
        where id = v_id;
    end;
  end if;
  return v_id;
exception when unique_violation then
  select id into v_existing from public.community_stamps
    where app_user_id = p_user and kind = p_kind
      and (source_key = p_source_key
        or (p_celebrity is null and celebrity_id is null)
        or (p_celebrity is not null and celebrity_id = p_celebrity and p_kind in ('first_comment','support')))
    order by issued_at limit 1;
  if v_existing is null then raise; end if;
  return v_existing;
end $$;
$fn$;
end $issuer$;

-- 5. Release of held stamps -----------------------------------------------------------------------------------------------
create function public.release_held_community_stamps(p_creator uuid default null, p_limit integer default 200)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid; v_celebrity uuid; v_kind public.community_stamp_kind; v_reason text; v_released integer := 0;
  v_msg text; v_state text;
begin
  if p_limit not between 1 and 2000 then raise exception 'COMMUNITY_STAMP_RELEASE_LIMIT'; end if;
  for v_id, v_user, v_celebrity, v_kind in
    select stamp.id, stamp.app_user_id, stamp.celebrity_id, stamp.kind from public.community_stamps stamp
      where stamp.onchain_hold_reason in ('CREATOR_NOT_VERIFIED','ROUTE_DISABLED','ENQUEUE_FAILED')
        and (p_creator is null or stamp.celebrity_id = p_creator)
      -- wait instead of skip locked: a sweep that started before a registration committed must not hide a row from the
      -- registration's own release (found by the concurrency suite). Both paths lock in the same order.
      order by stamp.issued_at, stamp.id limit p_limit for update
  loop
    v_reason := public.community_stamp_onchain_hold_reason(v_user, v_celebrity, v_kind);
    if v_reason is not null then
      update public.community_stamps set onchain_hold_reason = v_reason where id = v_id and onchain_hold_reason is distinct from v_reason;
      continue;
    end if;
    begin
      perform public.community_stamp_enqueue_native(v_id);
      v_released := v_released + 1;
    exception when others then
      get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
      update public.community_stamps set onchain_hold_reason = 'ENQUEUE_FAILED', onchain_hold_detail = left(v_state || ' ' || v_msg, 300)
        where id = v_id;
    end;
  end loop;
  return v_released;
end $$;

create function public.release_held_community_stamps_on_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.release_held_community_stamps(new.creator_id, 2000);
  return new;
end $$;
create trigger fan_action_verified_creators_release_held_stamps after insert on public.fan_action_verified_creators
  for each row execute function public.release_held_community_stamps_on_registration();

-- 6. Backlog recovery manifest --------------------------------------------------------------------------------------------
create table public.community_stamp_recovery_manifests (
  manifest_hash text primary key check (manifest_hash ~ '^[0-9a-f]{64}$'),
  cutoff_from timestamptz not null,
  cutoff_to timestamptz not null check (cutoff_to > cutoff_from),
  item_count integer not null check (item_count >= 0),
  counts jsonb not null,
  daily_cap integer not null default 500 check (daily_cap between 1 and 1000),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.community_stamp_recovery_items (
  manifest_hash text not null references public.community_stamp_recovery_manifests(manifest_hash),
  ordinal integer not null check (ordinal > 0),
  stamp_id uuid not null references public.community_stamps(id),
  legacy_job_id uuid not null references public.blockchain_jobs(id),
  stamp_kind text not null,
  action_code integer,
  issuance_key text not null check (issuance_key ~ '^0x[0-9a-f]{64}$'),
  classification text not null check (classification in ('H1','H2','Q')),
  reason text,
  outbox_id uuid references public.fan_action_outbox(id),
  enqueued_at timestamptz,
  enqueued_day date,
  last_skip_reason text,
  primary key (manifest_hash, stamp_id),
  unique (manifest_hash, ordinal),
  check ((outbox_id is null) = (enqueued_at is null) and (enqueued_at is null) = (enqueued_day is null)),
  check (outbox_id is null or classification = 'H2')
);
create index community_stamp_recovery_items_day_idx on public.community_stamp_recovery_items(enqueued_day) where enqueued_day is not null;
alter table public.community_stamp_recovery_manifests enable row level security;
alter table public.community_stamp_recovery_items enable row level security;
revoke all on public.community_stamp_recovery_manifests, public.community_stamp_recovery_items from public, anon, authenticated, service_role;

-- Fixes the list. Same cutoff and same database state give the same hash; building again returns the existing manifest.
-- H2 = legacy job still PENDING with no transaction or signature, wallet unchanged, kind routable; H1 = the legacy lane already
-- has a transaction (kept out, never minted again); Q = anything else. On-chain issuance checks run in the operator script
-- (tokenByIssuanceId on the old and new Stamp) and quarantine an item through quarantine_community_stamp_recovery_item.
create function public.build_community_stamp_recovery_manifest(p_from timestamptz, p_to timestamptz, p_daily_cap integer default 500)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_counts jsonb; v_total integer;
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to > pg_catalog.clock_timestamp() then
    raise exception 'COMMUNITY_STAMP_RECOVERY_CUTOFF'; end if;
  drop table if exists pg_temp.recovery_candidates;
  create temporary table recovery_candidates on commit drop as
  select row_number() over (order by s.issued_at, s.id)::integer as ordinal, s.id as stamp_id, j.id as legacy_job_id,
    s.kind::text as stamp_kind, public.community_stamp_onchain_code(s.kind, s.celebrity_id) as action_code,
    lower(j.payload ->> 'issuanceId') as issuance_key,
    case
      when exists(select 1 from public.fan_action_credentials c where c.entity_type = 'community_stamp' and c.entity_id = s.id) then 'Q'
      when j.status = 'COMPLETED' or j.tx_hash is not null or j.payload ? 'workerSubmission' then 'H1'
      when j.status <> 'PENDING' or s.policy_version is null
        or public.community_stamp_onchain_code(s.kind, s.celebrity_id) is null
        or lower(j.payload ->> 'recipient') is distinct from lower(w.address)
        or j.payload ->> 'issuanceId' is distinct from '0x' || encode(extensions.digest(j.operation_key, 'sha256'), 'hex')
        or j.operation_key is distinct from 'byus:community-stamp:v1:' || s.id::text then 'Q'
      else 'H2' end as classification,
    case
      when exists(select 1 from public.fan_action_credentials c where c.entity_type = 'community_stamp' and c.entity_id = s.id) then 'ALREADY_LINKED'
      when j.status = 'COMPLETED' or j.tx_hash is not null or j.payload ? 'workerSubmission' then 'LEGACY_SUBMITTED'
      when j.status <> 'PENDING' then 'LEGACY_STATUS_' || j.status::text
      when s.policy_version is null then 'NOT_DUKJIL'
      when public.community_stamp_onchain_code(s.kind, s.celebrity_id) is null then 'UNSUPPORTED_KIND'
      when lower(j.payload ->> 'recipient') is distinct from lower(w.address) then 'WALLET_CHANGED'
      when j.operation_key is distinct from 'byus:community-stamp:v1:' || s.id::text
        or j.payload ->> 'issuanceId' is distinct from '0x' || encode(extensions.digest(j.operation_key, 'sha256'), 'hex') then 'KEY_MISMATCH'
    end as reason
  from public.community_stamps s
  join public.blockchain_jobs j on j.id = s.blockchain_job_id and j.entity_type = 'community_stamp'
  left join public.user_wallets w on w.app_user_id = s.app_user_id and w.chain_id = 91342 and w.provider = 'privy' and w.wallet_type = 'embedded'
  where s.issued_at >= p_from and s.issued_at < p_to and j.status <> 'COMPLETED';
  select coalesce(sum(n), 0)::integer, coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_total, v_counts from (
    select classification || ':' || stamp_kind as k, count(*) as n from recovery_candidates group by 1) g;
  v_hash := encode(extensions.digest(
    to_char(p_from at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || to_char(p_to at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|'
    || coalesce((select string_agg(concat_ws('|', ordinal, stamp_id, legacy_job_id, stamp_kind, action_code, issuance_key, classification, reason), E'\n'
      order by ordinal) from recovery_candidates), ''), 'sha256'), 'hex');
  if not exists(select 1 from public.community_stamp_recovery_manifests where manifest_hash = v_hash) then
    insert into public.community_stamp_recovery_manifests(manifest_hash, cutoff_from, cutoff_to, item_count, counts, daily_cap)
      values (v_hash, p_from, p_to, v_total, v_counts, p_daily_cap);
    insert into public.community_stamp_recovery_items(manifest_hash, ordinal, stamp_id, legacy_job_id, stamp_kind, action_code,
        issuance_key, classification, reason)
      select v_hash, ordinal, stamp_id, legacy_job_id, stamp_kind, action_code, issuance_key, classification, reason from recovery_candidates;
  end if;
  return jsonb_build_object('manifestHash', v_hash, 'itemCount', v_total, 'counts', v_counts,
    'cutoffFrom', p_from, 'cutoffTo', p_to, 'dailyCap', (select daily_cap from public.community_stamp_recovery_manifests where manifest_hash = v_hash));
end $$;

create function public.quarantine_community_stamp_recovery_item(p_manifest_hash text, p_stamp_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if nullif(btrim(p_reason), '') is null then raise exception 'COMMUNITY_STAMP_RECOVERY_REASON'; end if;
  update public.community_stamp_recovery_items set classification = 'Q', reason = left(p_reason, 200)
    where manifest_hash = p_manifest_hash and stamp_id = p_stamp_id and outbox_id is null;
  if not found then raise exception 'COMMUNITY_STAMP_RECOVERY_ITEM_NOT_OPEN'; end if;
end $$;

-- Enqueues manifest H2 items in order. At most daily_cap items per UTC day across every manifest (decision 11/17: 500,
-- the other 500 of the shared 1,000 dispatch budget stay for new actions). Items whose creator is not registered yet stay
-- open (last_skip_reason) and do not use the day's allowance. Concurrent runs serialize on one advisory lock; a rerun
-- returns the already-created outbox, so each stamp is enqueued once.
create function public.run_community_stamp_recovery(p_manifest_hash text, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.community_stamp_recovery_manifests; v_day date := (pg_catalog.now() at time zone 'UTC')::date;
  v_used integer; v_allow integer; v_done integer := 0; v_skipped integer := 0; v_failed integer := 0;
  item record; v_reason text; v_outbox uuid; v_msg text; v_state text;
begin
  if p_limit not between 1 and 1000 then raise exception 'COMMUNITY_STAMP_RECOVERY_LIMIT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('community-stamp-recovery', 0));
  select * into strict m from public.community_stamp_recovery_manifests where manifest_hash = p_manifest_hash;
  if not coalesce((select legacy_credential_issuance_retired from public.mint_dispatch_policy where singleton), false) then
    raise exception 'COMMUNITY_STAMP_RECOVERY_LEGACY_NOT_RETIRED'; end if;
  select count(*) into v_used from public.community_stamp_recovery_items where enqueued_day = v_day;
  v_allow := greatest(0, least(p_limit, m.daily_cap - v_used));
  for item in select i.stamp_id, s.app_user_id, s.celebrity_id, s.kind from public.community_stamp_recovery_items i
      join public.community_stamps s on s.id = i.stamp_id
      where i.manifest_hash = p_manifest_hash and i.classification = 'H2' and i.outbox_id is null order by i.ordinal
  loop
    exit when v_done >= v_allow;
    v_reason := public.community_stamp_onchain_hold_reason(item.app_user_id, item.celebrity_id, item.kind);
    if v_reason is not null then
      update public.community_stamp_recovery_items set last_skip_reason = v_reason where manifest_hash = p_manifest_hash and stamp_id = item.stamp_id;
      v_skipped := v_skipped + 1; continue;
    end if;
    begin
      v_outbox := public.community_stamp_enqueue_native(item.stamp_id);
      update public.community_stamp_recovery_items set outbox_id = v_outbox, enqueued_at = pg_catalog.clock_timestamp(),
          enqueued_day = v_day, last_skip_reason = null
        where manifest_hash = p_manifest_hash and stamp_id = item.stamp_id;
      v_done := v_done + 1;
    exception when others then
      get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
      update public.community_stamp_recovery_items set last_skip_reason = left(v_state || ' ' || v_msg, 200)
        where manifest_hash = p_manifest_hash and stamp_id = item.stamp_id;
      v_failed := v_failed + 1;
    end;
  end loop;
  return jsonb_build_object('manifestHash', p_manifest_hash, 'utcDay', v_day, 'enqueued', v_done, 'skippedCreatorOrRoute', v_skipped,
    'failed', v_failed, 'usedToday', v_used + v_done, 'dailyCap', m.daily_cap,
    'remainingH2', (select count(*) from public.community_stamp_recovery_items where manifest_hash = p_manifest_hash
      and classification = 'H2' and outbox_id is null));
end $$;

-- Read-only progress for the operator: recovered items with their native outbox state.
create function public.community_stamp_recovery_status(p_manifest_hash text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('manifestHash', p_manifest_hash,
    'items', (select count(*) from public.community_stamp_recovery_items where manifest_hash = p_manifest_hash),
    'byClassification', (select coalesce(jsonb_object_agg(classification, n), '{}'::jsonb) from (select classification, count(*) n
      from public.community_stamp_recovery_items where manifest_hash = p_manifest_hash group by 1) g),
    'byOutboxStatus', (select coalesce(jsonb_object_agg(coalesce(q.status::text, 'NOT_ENQUEUED'), n), '{}'::jsonb) from (
      select q.status, count(*) n from public.community_stamp_recovery_items i left join public.fan_action_outbox q on q.id = i.outbox_id
      where i.manifest_hash = p_manifest_hash and i.classification = 'H2' group by 1) q),
    'byDay', (select coalesce(jsonb_object_agg(enqueued_day::text, n), '{}'::jsonb) from (select enqueued_day, count(*) n
      from public.community_stamp_recovery_items where manifest_hash = p_manifest_hash and enqueued_day is not null group by 1) d),
    'held', (select coalesce(jsonb_object_agg(onchain_hold_reason, n), '{}'::jsonb) from (select onchain_hold_reason, count(*) n
      from public.community_stamps where onchain_hold_reason is not null group by 1) h))
$$;

revoke all on function public.reject_community_stamp_lane_mutation(),
  public.community_stamp_onchain_code(public.community_stamp_kind, uuid),
  public.community_stamp_onchain_hold_reason(uuid, uuid, public.community_stamp_kind),
  public.assert_dukjil_stamp_occurrence(text, text, uuid, uuid, uuid, timestamptz, integer, jsonb),
  public.community_stamp_enqueue_native(uuid),
  public.release_held_community_stamps(uuid, integer),
  public.release_held_community_stamps_on_registration(),
  public.build_community_stamp_recovery_manifest(timestamptz, timestamptz, integer),
  public.quarantine_community_stamp_recovery_item(text, uuid, text),
  public.run_community_stamp_recovery(text, integer),
  public.community_stamp_recovery_status(text)
from public, anon, authenticated, service_role;

-- 7. Every role that runs the issuer chain can call the new callees (owners differ on AWS; see 20261210100000).
do $$
declare v_owner text; v_callee regprocedure;
begin
  select pg_get_userbyid(p.proowner) into strict v_owner from pg_proc p
    where p.oid = 'public.dukjil_issue_stamp_base(uuid,uuid,public.community_stamp_kind,text,integer)'::regprocedure;
  foreach v_callee in array array[
    'public.community_stamp_onchain_hold_reason(uuid,uuid,public.community_stamp_kind)'::regprocedure,
    'public.community_stamp_enqueue_native(uuid)'::regprocedure,
    'public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)'::regprocedure,
    'public.assert_dukjil_stamp_occurrence(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)'::regprocedure,
    'public.assert_fan_action_credential_link(uuid,text,uuid,uuid,public.credential_mint_status,text,numeric)'::regprocedure,
    'public.community_stamp_onchain_code(public.community_stamp_kind,uuid)'::regprocedure]
  loop
    if not has_function_privilege(v_owner, v_callee, 'EXECUTE') then
      raise exception 'DUKJIL_NATIVE_CALLEE_PRIVILEGE: % cannot execute %', v_owner, v_callee; end if;
  end loop;
end $$;
