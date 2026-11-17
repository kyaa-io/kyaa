-- 모든 쓰기 단계 앞에 붙는 점검(승인 래퍼가 -f preflight -f data 순서로 실행). 하나라도 어긋나면 예외로 멈추고 쓰기는 없다.
do $$
begin
  if current_database()<>'byus' then raise exception 'PREFLIGHT_DB'; end if;
  if to_regprocedure('public.run_community_stamp_recovery(text,integer)') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='community_stamps' and column_name='onchain_hold_reason') then
    raise exception 'PREFLIGHT_MIGRATION_20261231100000_MISSING'; end if;
  -- 20261231100000 keeps the legacy issuer on a database without the Fan Action lane; production must be on the native one.
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
