-- ONCHAIN-STAMPS-IMPL-1117 (20261231120000): dukjil stamps on the native lane, held stamps, backlog recovery manifest.
-- Disposable clean-chain DB only; everything rolls back.
do $$ begin if inet_server_addr() is not null then raise exception 'Disposable Unix-socket database required'; end if; end $$;
begin;
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'DUKJIL_NATIVE_TEST: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
declare caught boolean := false;
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm) = 0 then raise exception 'unexpected error %, wanted %', sqlerrm, expected; end if;
    caught := true;
  end;
  if not caught then raise exception 'missing error %', expected; end if;
end $$;

update public.dukjil_policy_versions set status = 'active', effective_from = now() - interval '1 hour', activated_at = now()
  where version = (select max(version) from public.dukjil_policy_versions);
update public.mint_dispatch_policy set legacy_credential_issuance_retired = true;

insert into public.fan_action_bindings(id, chain_id, environment_id, hub_proxy, relayer, schema_uid, schema_version, binding_version, asset_base_uri, assets)
values ('0c5f0000-0000-4000-8000-000000000001', 91342, '0x' || repeat('1', 64), '0x' || repeat('2', 40), '0x' || repeat('3', 40),
  '0x' || repeat('4', 64), 1, 2, 'ipfs://bafydukjilnative', jsonb_build_object('1', '0x' || repeat('5', 40)));
insert into public.fan_action_producer_routes(action_code, binding_id, enabled, enabled_at, policy_version)
select code, '0c5f0000-0000-4000-8000-000000000001', code <> 12, case when code <> 12 then now() end, 1 from unnest(array[8, 10, 12]) code;

create function pg_temp.mkuser(n integer) returns uuid language plpgsql as $$
declare u uuid := ('0c500000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
begin
  insert into public.app_users(id, privy_user_id, verified_email, status) values (u, 'did:privy:ocs-' || n, 'ocs-' || n || '@byus.test', 'active');
  insert into public.user_wallets(app_user_id, chain_id, address, provider, wallet_type) values (u, 91342, '0x' || lpad(n::text, 40, 'c'), 'privy', 'embedded');
  return u;
end $$;
create function pg_temp.mkcel(n integer, verified boolean) returns uuid language plpgsql as $$
declare c uuid := ('0c510000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
begin
  insert into public.celebrities(id, slug, status, image_url, roles, primary_role) values (c, 'ocs-cel-' || n, 'draft', '/d.webp', '{artist}', 'idol');
  insert into public.celebrity_localizations(celebrity_id, locale, name, summary, image_alt) values (c, 'ko', '가' || n, '가', '가'), (c, 'en', 'A' || n, 'A', 'A');
  update public.celebrities set status = 'published', published_at = now() where id = c;
  if verified then
    insert into public.fan_action_verified_creators(binding_id, creator_id, verified_block_number, verified_block_hash, verified_at)
      values ('0c5f0000-0000-4000-8000-000000000001', c, 1, '0x' || repeat('6', 64), now());
  end if;
  return c;
end $$;
-- The pre-migration issuer, kept to build realistic backlog rows (legacy job + stamp, validated by the insert trigger).
create function pg_temp.legacy_stamp(u uuid, c uuid, k public.community_stamp_kind, key text, at timestamptz) returns uuid language plpgsql as $$
declare v_id uuid := extensions.gen_random_uuid(); v_job uuid := extensions.gen_random_uuid(); v_op text := 'byus:community-stamp:v1:' || v_id::text;
begin
  insert into public.blockchain_jobs(id, entity_type, entity_id, operation_key, payload_version, payload)
    values (v_job, 'community_stamp', v_id, v_op, 1, jsonb_build_object(
      'recipient', (select address from public.user_wallets where app_user_id = u), 'issuanceId', '0x' || encode(extensions.digest(v_op, 'sha256'), 'hex'),
      'stampKind', k::text, 'celebritySlug', (select slug from public.celebrities where id = c)));
  insert into public.community_stamps(id, app_user_id, celebrity_id, kind, source_key, blockchain_job_id, policy_version, issued_at)
    values (v_id, u, c, k, key, v_job, 2, at);
  return v_id;
end $$;

select pg_temp.mkuser(1), pg_temp.mkuser(2), pg_temp.mkuser(3), pg_temp.mkcel(1, true), pg_temp.mkcel(2, false), pg_temp.mkcel(3, false);
create temporary table legacy_before as select count(*) n from public.blockchain_jobs where entity_type = 'community_stamp';

-- 1. Route 12 disabled: the action still stores its stamp, nothing reaches the legacy queue.
do $$
declare u uuid := '0c500000-0000-4000-8000-000000000001'; c uuid := '0c510000-0000-4000-8000-000000000001'; s uuid;
begin
  s := public.dukjil_issue_stamp(u, c, 'quiz', 'quiz:' || c::text, 2);
  perform pg_temp.assert((select onchain_hold_reason = 'ROUTE_DISABLED' and onchain_held_at is not null and blockchain_job_id is null
    and fan_action_outbox_id is null and mint_status = 'queued' from public.community_stamps where id = s), 'route disabled holds the stamp');
  update public.fan_action_producer_routes set enabled = true, enabled_at = now() where action_code = 12;
  perform pg_temp.assert(public.release_held_community_stamps(null, 10) = 1, 'release enqueues the stamp once the route is on');
  perform pg_temp.assert((select onchain_hold_reason is null and onchain_held_at is not null and fan_action_outbox_id is not null
    from public.community_stamps where id = s), 'released stamp keeps when it waited and gets its outbox');
  perform pg_temp.assert(public.release_held_community_stamps(null, 10) = 0, 'release is idempotent');
end $$;

-- 2. Every dukjil kind with a verified creator: one outbox, the expected code, the dukjil key, the original time and keys.
do $$
declare u uuid := '0c500000-0000-4000-8000-000000000001'; c uuid := '0c510000-0000-4000-8000-000000000001'; k text; s uuid; s2 uuid;
  q public.fan_action_outbox; o public.fan_action_occurrences; st public.community_stamps; n integer;
begin
  foreach k in array array['post','comment','reaction','live_reserve','live_attend','survey','mission','event_checkin','event_review',
    'cheer','proof','steady_checkin','subscription','share','daily_checkin'] loop
    s := public.dukjil_issue_stamp(u, c, k::public.community_stamp_kind,
      case when k = 'daily_checkin' then 'daily-checkin:' || c::text || ':' || public.dukjil_kst_date()::text else c::text || ':' || current_date::text end, 2);
    select * into strict st from public.community_stamps where id = s;
    select * into strict q from public.fan_action_outbox where id = st.fan_action_outbox_id;
    select * into strict o from public.fan_action_occurrences where id = q.occurrence_row_id;
    perform pg_temp.assert(st.onchain_hold_reason is null and st.onchain_held_at is null and st.blockchain_job_id is null, k || ': native lane, never held');
    perform pg_temp.assert((q.source_snapshot ->> 'actionCode')::integer = case when k = 'daily_checkin' then 10 else 12 end, k || ': action code');
    perform pg_temp.assert(o.canonical_source_key = 'dukjil:' || k || ':' || st.source_key || ':' || u::text and o.source_namespace = 'community_stamps', k || ': key');
    perform pg_temp.assert(o.source_occurred_at = st.issued_at and (q.source_snapshot ->> 'sourceOccurredAt')::timestamptz = st.issued_at, k || ': time');
    perform pg_temp.assert(q.source_snapshot #>> '{credentials,0,metadata,operationKey}' = 'byus:community-stamp:v1:' || s::text
      and q.source_snapshot #>> '{credentials,0,issuanceKey}' = '0x' || encode(extensions.digest('byus:community-stamp:v1:' || s::text, 'sha256'), 'hex')
      and q.source_snapshot #>> '{credentials,0,metadata,legacyPayload,stampKind}' = k
      and q.source_snapshot ->> 'creatorId' = '0x' || lpad(replace(c::text, '-', ''), 64, '0')
      and q.source_snapshot ->> 'recipient' = '0x' || lpad('1', 40, 'c'), k || ': snapshot');
    s2 := public.dukjil_issue_stamp(u, c, k::public.community_stamp_kind, st.source_key, 2);
    perform pg_temp.assert(s2 = s and public.community_stamp_enqueue_native(s) = q.id, k || ': replay returns the same stamp and outbox');
  end loop;
  -- The same source key under two kinds (keyMode 'day') stays two occurrences.
  select count(distinct o2.id) into n from public.community_stamps s3 join public.fan_action_outbox q2 on q2.id = s3.fan_action_outbox_id
    join public.fan_action_occurrences o2 on o2.id = q2.occurrence_row_id where s3.app_user_id = u and s3.source_key = c::text || ':' || current_date::text;
  perform pg_temp.assert(n = 14, 'one occurrence per kind for one shared source key');
  -- Kinds the chain policy does not cover are stored and held, never sent to legacy.
  s := public.dukjil_issue_stamp(u, c, 'invite', 'invite:hold-check', 2);
  perform pg_temp.assert((select onchain_hold_reason from public.community_stamps where id = s) = 'UNSUPPORTED_KIND', 'invite with a creator is held');
  s := public.dukjil_issue_stamp(u, c, 'wave_mission', 'wave:hold-check', 2);
  perform pg_temp.assert((select onchain_hold_reason from public.community_stamps where id = s) = 'UNSUPPORTED_KIND', 'wave mission through dukjil is held');
end $$;

-- 3. Unregistered creator (decision A): stored and held; the finalized registration releases it on the same row.
do $$
declare u uuid := '0c500000-0000-4000-8000-000000000002'; c uuid := '0c510000-0000-4000-8000-000000000002'; s uuid; t uuid; q uuid;
begin
  s := public.dukjil_issue_stamp(u, c, 'post', 'post:unregistered', 2);
  t := public.dukjil_issue_stamp(u, c, 'daily_checkin', 'daily-checkin:' || c::text || ':' || public.dukjil_kst_date()::text, 2);
  perform pg_temp.assert((select count(*) from public.community_stamps where id in (s, t) and onchain_hold_reason = 'CREATOR_NOT_VERIFIED'
    and fan_action_outbox_id is null and blockchain_job_id is null) = 2, 'unregistered creator holds both stamps');
  perform pg_temp.assert(public.release_held_community_stamps(c, 10) = 0, 'release keeps waiting before registration');
  -- A confirmed (not finalized) registration is not enough for stamps.
  insert into public.fan_action_confirmed_creators(binding_id, creator_id, transaction_hash, confirmed_block_number, confirmed_block_hash)
    values ('0c5f0000-0000-4000-8000-000000000001', c, '0x' || repeat('a', 64), 1, '0x' || repeat('b', 64));
  perform pg_temp.assert(public.release_held_community_stamps(c, 10) = 0, 'confirmed-only registration does not release stamps');
  insert into public.fan_action_verified_creators(binding_id, creator_id, verified_block_number, verified_block_hash, verified_at)
    values ('0c5f0000-0000-4000-8000-000000000001', c, 2, '0x' || repeat('7', 64), now());
  select fan_action_outbox_id into q from public.community_stamps where id = s and onchain_hold_reason is null and onchain_held_at is not null;
  perform pg_temp.assert(q is not null and (select fan_action_outbox_id from public.community_stamps where id = t) is not null,
    'finalized registration releases the held stamps');
  perform pg_temp.assert((select (source_snapshot ->> 'sourceOccurredAt')::timestamptz from public.fan_action_outbox where id = q)
    = (select issued_at from public.community_stamps where id = s), 'released stamp keeps its original time');
end $$;

-- 4. Trust boundary: forged or replayed enqueues are refused; share/first_clip keep their own proof path.
do $$
declare u uuid := '0c500000-0000-4000-8000-000000000001'; c uuid := '0c510000-0000-4000-8000-000000000001'; s public.community_stamps;
  cred jsonb; op text;
begin
  select * into strict s from public.community_stamps where app_user_id = u and kind = 'post' and fan_action_outbox_id is not null;
  op := 'byus:community-stamp:v1:' || s.id::text;
  cred := jsonb_build_array(jsonb_build_object('entityType', 'community_stamp', 'entityId', s.id, 'kind', 1,
    'issuanceKey', '0x' || encode(extensions.digest(op, 'sha256'), 'hex'), 'operationKey', op,
    'legacyPayload', jsonb_build_object('recipient', '0x' || lpad('1', 40, 'c'), 'issuanceId', '0x' || encode(extensions.digest(op, 'sha256'), 'hex'),
      'stampKind', 'post', 'celebritySlug', 'ocs-cel-1')));
  -- already linked
  perform pg_temp.expect_error(format('select public.enqueue_fan_action_source(%L,%L,%L,%L,null,%L,12,%L)', 'community_stamps',
    'dukjil:post:' || s.source_key || ':x' || u::text, u, c, s.issued_at, cred), 'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL');
  -- a fresh held stamp with a wrong kind in the key, wrong time, wrong code, another user's wallet
  op := public.dukjil_issue_stamp('0c500000-0000-4000-8000-000000000003', '0c510000-0000-4000-8000-000000000003', 'post', 'post:forge', 2);
  select * into strict s from public.community_stamps x where x.id = op::uuid;
  perform pg_temp.assert(s.onchain_hold_reason = 'CREATOR_NOT_VERIFIED', 'forge fixture is held');
  op := 'byus:community-stamp:v1:' || s.id::text;
  cred := jsonb_build_array(jsonb_build_object('entityType', 'community_stamp', 'entityId', s.id, 'kind', 1,
    'issuanceKey', '0x' || encode(extensions.digest(op, 'sha256'), 'hex'), 'operationKey', op,
    'legacyPayload', jsonb_build_object('recipient', '0x' || lpad('3', 40, 'c'), 'issuanceId', '0x' || encode(extensions.digest(op, 'sha256'), 'hex'),
      'stampKind', 'post', 'celebritySlug', 'ocs-cel-3')));
  perform pg_temp.expect_error(format('select public.enqueue_fan_action_source(%L,%L,%L,%L,null,%L,12,%L)', 'community_stamps',
    'dukjil:post:' || s.source_key || ':' || s.app_user_id::text, s.app_user_id, s.celebrity_id, s.issued_at, cred), 'FAN_ACTION_CONTEXT_NOT_VERIFIED');
  perform pg_temp.expect_error(format('select public.enqueue_fan_action_source(%L,%L,%L,%L,null,%L,12,%L)', 'community_stamps',
    'dukjil:quiz:' || s.source_key || ':' || s.app_user_id::text, s.app_user_id, s.celebrity_id, s.issued_at, cred), 'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL');
  perform pg_temp.expect_error(format('select public.enqueue_fan_action_source(%L,%L,%L,%L,null,%L,12,%L)', 'community_stamps',
    'dukjil:post:' || s.source_key || ':' || s.app_user_id::text, s.app_user_id, s.celebrity_id, s.issued_at + interval '1 second', cred), 'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL');
  perform pg_temp.expect_error(format('select public.enqueue_fan_action_source(%L,%L,%L,%L,null,%L,10,%L)', 'community_stamps',
    'dukjil:post:' || s.source_key || ':' || s.app_user_id::text, s.app_user_id, s.celebrity_id, s.issued_at, cred), 'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL');
  perform pg_temp.expect_error(format('select public.enqueue_fan_action_source(%L,%L,%L,%L,null,%L,12,%L)', 'community_stamps',
    'dukjil:post:' || s.source_key || ':' || s.app_user_id::text, s.app_user_id, s.celebrity_id, s.issued_at,
    jsonb_set(cred, '{0,legacyPayload,recipient}', to_jsonb('0x' || lpad('1', 40, 'c')))), 'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL');
  -- a non-dukjil code 12 key still requires share/first_clip
  perform pg_temp.expect_error(format('select public.enqueue_fan_action_source(%L,%L,%L,%L,null,%L,12,%L)', 'community_stamps',
    'post:forge:' || s.app_user_id::text, s.app_user_id, s.celebrity_id, s.issued_at, cred), 'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL');
  -- the lane of a stamp that has its outbox is immutable
  perform pg_temp.expect_error(format('update public.community_stamps set fan_action_outbox_id = null where id = %L',
    (select id from public.community_stamps where app_user_id = u and kind = 'post' and fan_action_outbox_id is not null)), 'immutable');
  perform pg_temp.expect_error(format('insert into public.community_stamps(app_user_id, celebrity_id, kind, source_key, policy_version) values (%L,%L,%L,%L,2)',
    u, c, 'post', 'post:no-lane'), 'chain lane is missing');
end $$;
select pg_temp.assert((select count(*) from public.blockchain_jobs where entity_type = 'community_stamp') = (select n from legacy_before),
  'no dukjil stamp reached the retired legacy queue');

-- 5. Backlog recovery: manifest, H1/H2/Q, daily cap, rerun, creator wait, legacy claim exclusion, worker admission.
do $$
declare u1 uuid := '0c500000-0000-4000-8000-000000000001'; u3 uuid := '0c500000-0000-4000-8000-000000000003';
  c1 uuid := '0c510000-0000-4000-8000-000000000001'; c3 uuid := '0c510000-0000-4000-8000-000000000003';
  i integer; h1 uuid; r jsonb; m jsonb; m2 jsonb; hash text; v_ids uuid[]; q public.fan_action_outbox; legacy public.blockchain_jobs;
  kinds text[] := array['quiz','post','daily_checkin','steady_checkin','reaction','comment','cheer'];
begin
  for i in 1..7 loop
    -- a check-in key is validated against today's KST date, so the backlog check-in belongs to a fan without one today
    perform pg_temp.legacy_stamp(case when kinds[i] = 'daily_checkin' then pg_temp.mkuser(4) else u1 end, c1, kinds[i]::public.community_stamp_kind,
      case when kinds[i] = 'daily_checkin' then 'daily-checkin:' || c1::text || ':' || public.dukjil_kst_date()::text else 'backlog:' || i end,
      timestamptz '2026-11-12 10:00:00+09' + i * interval '1 minute');
  end loop;
  perform pg_temp.legacy_stamp(u3, c3, 'post', 'backlog:unregistered', timestamptz '2026-11-12 11:00:00+09');
  h1 := pg_temp.legacy_stamp(u1, c1, 'post', 'backlog:submitted', timestamptz '2026-11-12 12:00:00+09');
  update public.blockchain_jobs set tx_hash = '0x' || repeat('d', 64),
      payload = payload || jsonb_build_object('workerSubmission', jsonb_build_object('txHash', '0x' || repeat('d', 64), 'signedTransaction', '0x01'))
    where entity_id = h1;
  perform pg_temp.legacy_stamp(u1, c1, 'invite', 'backlog:invite', timestamptz '2026-11-12 12:30:00+09');

  m := public.build_community_stamp_recovery_manifest(timestamptz '2026-11-11 00:00:00+09', now(), 3);
  hash := m ->> 'manifestHash';
  perform pg_temp.assert((m ->> 'itemCount')::integer = 10 and (m -> 'counts' ->> 'H2:post') = '2' and (m -> 'counts' ->> 'H1:post') = '1'
    and (m -> 'counts' ->> 'Q:invite') = '1' and (m -> 'counts' ->> 'H2:daily_checkin') = '1', 'manifest classifies the backlog: ' || m::text);
  m2 := public.build_community_stamp_recovery_manifest(timestamptz '2026-11-11 00:00:00+09', (m ->> 'cutoffTo')::timestamptz, 3);
  perform pg_temp.assert(m2 ->> 'manifestHash' = hash and (select count(*) from public.community_stamp_recovery_items where manifest_hash = hash) = 10,
    'the same cutoff gives the same manifest once');
  perform pg_temp.assert((select reason from public.community_stamp_recovery_items where stamp_id = h1) = 'LEGACY_SUBMITTED', 'a signed legacy job is H1, never minted again');

  -- daily cap 3: the unregistered creator item waits and does not use the allowance
  update public.mint_dispatch_policy set legacy_credential_issuance_retired = false;
  perform pg_temp.expect_error(format('select public.run_community_stamp_recovery(%L, 10)', hash), 'LEGACY_NOT_RETIRED');
  update public.mint_dispatch_policy set legacy_credential_issuance_retired = true;
  r := public.run_community_stamp_recovery(hash, 10);
  perform pg_temp.assert((r ->> 'enqueued')::integer = 3 and (r ->> 'usedToday')::integer = 3 and (r ->> 'remainingH2')::integer = 5, 'day 1 stops at the cap: ' || r::text);
  r := public.run_community_stamp_recovery(hash, 10);
  perform pg_temp.assert((r ->> 'enqueued')::integer = 0 and (r ->> 'remainingH2')::integer = 5, 'a rerun on the same day adds nothing: ' || r::text);
  -- next UTC day (shift the recorded day back instead of the clock)
  update public.community_stamp_recovery_items set enqueued_day = enqueued_day - 1 where manifest_hash = hash and enqueued_day is not null;
  r := public.run_community_stamp_recovery(hash, 2);
  perform pg_temp.assert((r ->> 'enqueued')::integer = 2 and (r ->> 'usedToday')::integer = 2, 'p_limit below the cap: ' || r::text);
  r := public.run_community_stamp_recovery(hash, 10);
  perform pg_temp.assert((r ->> 'enqueued')::integer = 1 and (r ->> 'usedToday')::integer = 3, 'cap boundary 2 -> 3: ' || r::text);
  update public.community_stamp_recovery_items set enqueued_day = enqueued_day - 1 where manifest_hash = hash and enqueued_day is not null;
  r := public.run_community_stamp_recovery(hash, 10);
  perform pg_temp.assert((r ->> 'enqueued')::integer = 1 and (r ->> 'skippedCreatorOrRoute')::integer = 1 and (r ->> 'remainingH2')::integer = 1,
    'only the unregistered creator item remains: ' || r::text);
  insert into public.fan_action_verified_creators(binding_id, creator_id, verified_block_number, verified_block_hash, verified_at)
    values ('0c5f0000-0000-4000-8000-000000000001', c3, 3, '0x' || repeat('8', 64), now());
  r := public.run_community_stamp_recovery(hash, 10);
  perform pg_temp.assert((r ->> 'enqueued')::integer = 1 and (r ->> 'remainingH2')::integer = 0, 'registered creator item is recovered: ' || r::text);

  -- each recovered stamp: one outbox, original time and keys, legacy job linked and untouched
  perform pg_temp.assert((select count(*) from public.community_stamp_recovery_items i join public.fan_action_credentials c
      on c.entity_type = 'community_stamp' and c.entity_id = i.stamp_id and c.legacy_job_id = i.legacy_job_id and c.outbox_id = i.outbox_id
      join public.fan_action_outbox o on o.id = i.outbox_id join public.community_stamps s on s.id = i.stamp_id
      join public.blockchain_jobs j on j.id = i.legacy_job_id
      where i.manifest_hash = hash and (o.source_snapshot ->> 'sourceOccurredAt')::timestamptz = s.issued_at
        and o.source_snapshot #>> '{credentials,0,issuanceKey}' = lower(j.payload ->> 'issuanceId') and j.status = 'PENDING'
        and s.blockchain_job_id = j.id and s.fan_action_outbox_id is null) = 8, 'recovered items keep id, time, keys and legacy row');
  perform pg_temp.assert((select count(*) from public.fan_action_credentials c join public.community_stamp_recovery_items i on i.stamp_id = c.entity_id
    where i.manifest_hash = hash) = 8, 'exactly one credential per recovered stamp');
  perform pg_temp.assert((select (source_snapshot ->> 'actionCode')::integer from public.fan_action_outbox o join public.community_stamp_recovery_items i
    on i.outbox_id = o.id where i.stamp_kind = 'daily_checkin' and i.manifest_hash = hash) = 10, 'backlog check-in uses code 10');
  -- a rebuilt manifest marks recovered stamps as linked, so no second outbox can be made
  m2 := public.build_community_stamp_recovery_manifest(timestamptz '2026-11-11 00:00:00+09', now(), 500);
  perform pg_temp.assert((select count(*) from public.community_stamp_recovery_items where manifest_hash = m2 ->> 'manifestHash' and classification = 'H2') = 0,
    'rebuilt manifest has no H2 left: ' || m2::text);
  -- the legacy worker never claims a linked job, even with the retirement switched off
  begin
  update public.mint_dispatch_policy set legacy_credential_issuance_retired = false;
  select array_agg(id) into v_ids from public.claim_blockchain_jobs('ocs-legacy', 100, 60, array['community_stamp']);
  perform pg_temp.assert(not exists(select 1 from public.community_stamp_recovery_items i where i.manifest_hash = hash and i.outbox_id is not null and i.legacy_job_id = any(coalesce(v_ids, '{}')))
    and (select count(*) from public.community_stamp_recovery_items i where i.manifest_hash = hash and i.outbox_id is null and i.legacy_job_id = any(coalesce(v_ids, '{}'))) = 2,
    'linked legacy jobs are not claimed');
  raise exception 'ROLLBACK_CLAIM_PROBE';
  exception when others then if sqlerrm <> 'ROLLBACK_CLAIM_PROBE' then raise; end if;
  end;
  update public.mint_dispatch_policy set legacy_credential_issuance_retired = true;
end $$;

-- 6. Worker admission on the shared 1,000/day budget: 999 used -> admitted, 1,000 used -> deferred to the next UTC day.
do $$
declare v_day date := (clock_timestamp() at time zone 'UTC')::date; a uuid; b uuid; ok boolean;
begin
  delete from public.fan_action_dispatch_reservations where budget_day = v_day;
  delete from public.mint_dispatch_budget_reservations where budget_day = v_day;
  insert into public.mint_dispatch_budget_reservations(budget_day, job_id, reserved_at)
    select v_day, j.id, now() from public.blockchain_jobs j limit 1;
  perform 1 from public.claim_fan_action_jobs('ocs-native', 2, 60, array['record_and_issue']);
  select id into a from public.fan_action_outbox where lease_owner = 'ocs-native' order by id limit 1;
  select id into b from public.fan_action_outbox where lease_owner = 'ocs-native' and id <> a order by id limit 1;
  update public.mint_dispatch_policy set daily_job_limit = (select count(*) from public.mint_dispatch_budget_reservations where budget_day = v_day)
    + (select count(*) from public.fan_action_dispatch_reservations where budget_day = v_day) + 1;
  ok := public.admit_fan_action_dispatch(a, 'ocs-native');
  perform pg_temp.assert(ok, 'last free slot of the day is admitted');
  ok := public.admit_fan_action_dispatch(b, 'ocs-native');
  perform pg_temp.assert(not ok and (select status = 'RETRYING' and last_error_code = 'MINT_DAILY_DISPATCH_LIMIT'
    and next_attempt_at = ((v_day + 1)::timestamp at time zone 'UTC') from public.fan_action_outbox where id = b), 'over the limit waits for the next UTC day');
  ok := public.admit_fan_action_dispatch(a, 'ocs-native');
  perform pg_temp.assert(ok and (select count(*) from public.fan_action_dispatch_reservations where outbox_id = a) = 1, 'a re-admitted job is not counted twice');
end $$;

select public.community_stamp_recovery_status(manifest_hash) from public.community_stamp_recovery_manifests order by created_at limit 1;
-- Real rows for the worker parser test (apps/worker/test/dukjil-native-snapshots.test.ts): exported by the runner, then rolled back.
\if :{?export_snapshots}
\pset tuples_only on
\pset format unaligned
select jsonb_agg(source_snapshot order by id) from public.fan_action_outbox where source_snapshot ->> 'sourceNamespace' = 'community_stamps' and source_snapshot ->> 'canonicalSourceKey' like 'dukjil:%' \g :export_snapshots
\pset tuples_only off
\pset format aligned
\endif
rollback;
select 'DUKJIL_NATIVE_ONCHAIN_OK' as result;
