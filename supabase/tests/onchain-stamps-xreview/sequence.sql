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

update public.fan_action_producer_routes set enabled=true,enabled_at=now();
select pg_temp.legacy_stamp('0c500000-0000-4000-8000-000000000001','0c510000-0000-4000-8000-000000000001','post','stages:'||n,timestamptz '2026-11-12') from generate_series(1,20) n;
-- 모든 쓰기 단계 앞에 붙는 점검(승인 래퍼가 -f preflight -f data 순서로 실행). 하나라도 어긋나면 예외로 멈추고 쓰기는 없다.
do $$
begin
  if current_database()<>'byus' then raise exception 'PREFLIGHT_DB'; end if;
  if to_regprocedure('public.run_community_stamp_recovery(text,integer)') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='community_stamps' and column_name='onchain_hold_reason') then
    raise exception 'PREFLIGHT_MIGRATION_20261231120000_MISSING'; end if;
  -- 20261231120000 keeps the legacy issuer on a database without the Fan Action lane; production must be on the native one.
  if position('community_stamp_enqueue_native' in pg_get_functiondef(
      'public.dukjil_issue_stamp_base(uuid,uuid,public.community_stamp_kind,text,integer)'::regprocedure))=0 then
    raise exception 'PREFLIGHT_DUKJIL_ISSUER_NOT_NATIVE'; end if;
  if not coalesce((select legacy_credential_issuance_retired from public.mint_dispatch_policy where singleton),false) then
    raise exception 'PREFLIGHT_LEGACY_NOT_RETIRED'; end if;
  if (select transmission_paused from public.mint_dispatch_policy where singleton) then raise exception 'PREFLIGHT_TRANSMISSION_PAUSED'; end if;
  if (select count(*) from public.fan_action_producer_routes r join public.fan_action_bindings b on b.id=r.binding_id
      where r.action_code in (10,12) and r.enabled and b.binding_version=2)<>2 then raise exception 'PREFLIGHT_ROUTES_10_12_NOT_READY'; end if;
  -- 실패한 dukjil 발행이 있으면(옛 worker가 받은 경우 등) 복구를 진행하지 않는다
  if exists(select 1 from public.fan_action_outbox q where q.status='FAILED' and q.source_snapshot->>'canonicalSourceKey' like 'dukjil:%') then
    raise exception 'PREFLIGHT_DUKJIL_OUTBOX_FAILED'; end if;
end $$;

-- manifest 고정. 2026-11-16 00:00:00+09는 migration 적용 시각 이후의 고정 시각(예: 적용 완료 + 1분)으로 채운다. 같은 값으로 다시 돌리면 같은 hash(멱등).
-- 결과 JSON(manifestHash·itemCount·counts)을 영수증에 남기고 hash를 다음 단계에 쓴다.
select public.build_community_stamp_recovery_manifest(timestamptz '2026-11-11 00:00:00+09', timestamptz '2026-11-16 00:00:00+09', 500);

select manifest_hash from public.community_stamp_recovery_manifests limit 1 \gset
-- 모든 쓰기 단계 앞에 붙는 점검(승인 래퍼가 -f preflight -f data 순서로 실행). 하나라도 어긋나면 예외로 멈추고 쓰기는 없다.
do $$
begin
  if current_database()<>'byus' then raise exception 'PREFLIGHT_DB'; end if;
  if to_regprocedure('public.run_community_stamp_recovery(text,integer)') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='community_stamps' and column_name='onchain_hold_reason') then
    raise exception 'PREFLIGHT_MIGRATION_20261231120000_MISSING'; end if;
  -- 20261231120000 keeps the legacy issuer on a database without the Fan Action lane; production must be on the native one.
  if position('community_stamp_enqueue_native' in pg_get_functiondef(
      'public.dukjil_issue_stamp_base(uuid,uuid,public.community_stamp_kind,text,integer)'::regprocedure))=0 then
    raise exception 'PREFLIGHT_DUKJIL_ISSUER_NOT_NATIVE'; end if;
  if not coalesce((select legacy_credential_issuance_retired from public.mint_dispatch_policy where singleton),false) then
    raise exception 'PREFLIGHT_LEGACY_NOT_RETIRED'; end if;
  if (select transmission_paused from public.mint_dispatch_policy where singleton) then raise exception 'PREFLIGHT_TRANSMISSION_PAUSED'; end if;
  if (select count(*) from public.fan_action_producer_routes r join public.fan_action_bindings b on b.id=r.binding_id
      where r.action_code in (10,12) and r.enabled and b.binding_version=2)<>2 then raise exception 'PREFLIGHT_ROUTES_10_12_NOT_READY'; end if;
  -- 실패한 dukjil 발행이 있으면(옛 worker가 받은 경우 등) 복구를 진행하지 않는다
  if exists(select 1 from public.fan_action_outbox q where q.status='FAILED' and q.source_snapshot->>'canonicalSourceKey' like 'dukjil:%') then
    raise exception 'PREFLIGHT_DUKJIL_OUTBOX_FAILED'; end if;
end $$;

-- 첫 10건(D0 500건 안에 포함). MANIFEST_HASH를 01 결과로 채운다.
select public.run_community_stamp_recovery(:'manifest_hash', 10);

-- 모든 쓰기 단계 앞에 붙는 점검(승인 래퍼가 -f preflight -f data 순서로 실행). 하나라도 어긋나면 예외로 멈추고 쓰기는 없다.
do $$
begin
  if current_database()<>'byus' then raise exception 'PREFLIGHT_DB'; end if;
  if to_regprocedure('public.run_community_stamp_recovery(text,integer)') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='community_stamps' and column_name='onchain_hold_reason') then
    raise exception 'PREFLIGHT_MIGRATION_20261231120000_MISSING'; end if;
  -- 20261231120000 keeps the legacy issuer on a database without the Fan Action lane; production must be on the native one.
  if position('community_stamp_enqueue_native' in pg_get_functiondef(
      'public.dukjil_issue_stamp_base(uuid,uuid,public.community_stamp_kind,text,integer)'::regprocedure))=0 then
    raise exception 'PREFLIGHT_DUKJIL_ISSUER_NOT_NATIVE'; end if;
  if not coalesce((select legacy_credential_issuance_retired from public.mint_dispatch_policy where singleton),false) then
    raise exception 'PREFLIGHT_LEGACY_NOT_RETIRED'; end if;
  if (select transmission_paused from public.mint_dispatch_policy where singleton) then raise exception 'PREFLIGHT_TRANSMISSION_PAUSED'; end if;
  if (select count(*) from public.fan_action_producer_routes r join public.fan_action_bindings b on b.id=r.binding_id
      where r.action_code in (10,12) and r.enabled and b.binding_version=2)<>2 then raise exception 'PREFLIGHT_ROUTES_10_12_NOT_READY'; end if;
  -- 실패한 dukjil 발행이 있으면(옛 worker가 받은 경우 등) 복구를 진행하지 않는다
  if exists(select 1 from public.fan_action_outbox q where q.status='FAILED' and q.source_snapshot->>'canonicalSourceKey' like 'dukjil:%') then
    raise exception 'PREFLIGHT_DUKJIL_OUTBOX_FAILED'; end if;
end $$;

-- UTC 하루 1회(한국 09:00 이후). 하루 최대 500건은 함수가 지킨다(같은 날 다시 돌려도 더 넣지 않음).
select public.run_community_stamp_recovery(:'manifest_hash', 500);

select public.run_community_stamp_recovery(:'manifest_hash',500);
select pg_temp.assert((select count(*)=20 from public.community_stamp_recovery_items where outbox_id is not null),'stage sequence links exactly 20');
rollback;
