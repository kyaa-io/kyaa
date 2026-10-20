begin;
do $$
declare p jsonb; current_value jsonb; changed boolean;
begin
  if has_table_privilege('anon', 'public.onchain_dashboard_snapshot', 'SELECT')
    or has_table_privilege('authenticated', 'public.onchain_dashboard_snapshot', 'UPDATE')
    or has_function_privilege('anon', 'public.replace_onchain_dashboard_snapshot(jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.replace_onchain_dashboard_snapshot(jsonb)', 'EXECUTE') then
    raise exception 'dashboard snapshot exposed';
  end if;
  if not has_function_privilege('service_role', 'public.replace_onchain_dashboard_snapshot(jsonb)', 'EXECUTE') then
    raise exception 'service role cannot refresh';
  end if;
  delete from public.onchain_dashboard_snapshot;
  p := jsonb_build_object('version',1,'configFingerprint',repeat('a',64),'network','GIWA Sepolia','chainId',91342,
    'verifiedAt',clock_timestamp()-interval '1 minute','blockNumber','100','blockHash','0x'||repeat('1',64),
    'blockTimestamp',clock_timestamp()-interval '2 minutes','deployments','[]'::jsonb,'metrics','{}'::jsonb,'proof','null'::jsonb);
  if not public.replace_onchain_dashboard_snapshot(p) then raise exception 'initial insert failed'; end if;
  if public.replace_onchain_dashboard_snapshot(p || jsonb_build_object('blockNumber','99','verifiedAt',clock_timestamp())) then
    raise exception 'older block overwrote newer block'; end if;
  if public.replace_onchain_dashboard_snapshot(p || jsonb_build_object('blockHash','0x'||repeat('2',64),'verifiedAt',clock_timestamp())) then
    raise exception 'same-height conflicting block accepted'; end if;
  if not public.replace_onchain_dashboard_snapshot(p || jsonb_build_object('verifiedAt',clock_timestamp()-interval '30 seconds')) then
    raise exception 'same block reverification rejected'; end if;
  if public.replace_onchain_dashboard_snapshot(p) then raise exception 'older verification overwrote newer one'; end if;
  if not public.replace_onchain_dashboard_snapshot(p || jsonb_build_object('blockNumber','101')) then
    raise exception 'newer finalized block rejected'; end if;
  select payload into current_value from public.onchain_dashboard_snapshot;
  begin
    perform public.replace_onchain_dashboard_snapshot(p || jsonb_build_object('raw','[]'::jsonb));
    raise exception 'private payload accepted';
  exception when raise_exception then
    if sqlerrm = 'private payload accepted' then raise; end if;
  end;
  if (select payload from public.onchain_dashboard_snapshot) <> current_value then raise exception 'failure changed last success'; end if;
end $$;
rollback;
