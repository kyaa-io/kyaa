begin;
do $$
declare s jsonb; p jsonb; d jsonb; before_value jsonb; before_dashboard jsonb; mutation jsonb;
begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required'; end if;
  if has_table_privilege('anon','public.onchain_verified_snapshot','SELECT')
    or has_table_privilege('authenticated','public.onchain_verified_snapshot','SELECT')
    or has_table_privilege('service_role','public.onchain_verified_snapshot','UPDATE')
    or has_function_privilege('anon','public.replace_onchain_verified_snapshot(jsonb,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.replace_onchain_verified_snapshot(jsonb,jsonb)','EXECUTE')
    or not has_function_privilege('service_role','public.replace_onchain_verified_snapshot(jsonb,jsonb)','EXECUTE') then
    raise exception 'verified snapshot privilege mismatch';
  end if;
  delete from public.onchain_verified_snapshot; delete from public.onchain_dashboard_snapshot;
  s:=jsonb_build_object('version',2,'network','GIWA Sepolia','chainId',91342,'hubAddress','0x'||repeat('1',40),
    'environmentId','0x'||repeat('1',64),'schemaUid','0x'||repeat('2',64),'fromBlock','1','blockNumber','100','blockHash','0x'||repeat('3',64),
    'blockTimestamp',clock_timestamp()-interval '2 minutes','generatedAt',clock_timestamp()-interval '1 minute',
    'deployments','[]'::jsonb,'business','{}'::jsonb,'raw','{}'::jsonb,'excludedQaWallets','[]'::jsonb,
    'excludedQaActions',0,'historicalActions',0,'actions','[]'::jsonb,'transactions','[]'::jsonb);
  p:=jsonb_build_object('configFingerprint',repeat('a',64),'snapshot',s);
  d:=jsonb_build_object('version',1,'configFingerprint',repeat('a',64),'network',s->'network','chainId',s->'chainId',
    'verifiedAt',s->'generatedAt','blockNumber',s->'blockNumber','blockHash',s->'blockHash','blockTimestamp',s->'blockTimestamp',
    'deployments',s->'deployments','metrics',s->'business','proof','null'::jsonb);
  if not public.replace_onchain_verified_snapshot(p,d) then raise exception 'initial publication failed'; end if;
  if (select dashboard_payload from public.onchain_verified_snapshot)<>d or (select payload from public.onchain_dashboard_snapshot)<>d then raise exception 'projection not atomic'; end if;
  before_value:=p; before_dashboard:=d;
  if public.replace_onchain_verified_snapshot(jsonb_set(p,'{snapshot,blockNumber}','"99"'),jsonb_set(d,'{blockNumber}','"99"')) then raise exception 'older block accepted'; end if;
  if public.replace_onchain_verified_snapshot(jsonb_set(p,'{snapshot,blockHash}',to_jsonb('0x'||repeat('4',64))),jsonb_set(d,'{blockHash}',to_jsonb('0x'||repeat('4',64)))) then raise exception 'same height reorg accepted'; end if;
  mutation:=jsonb_set(p,'{snapshot,generatedAt}',to_jsonb(clock_timestamp()-interval '90 seconds'));
  if public.replace_onchain_verified_snapshot(mutation,jsonb_set(d,'{verifiedAt}',mutation#>'{snapshot,generatedAt}')) then raise exception 'older time accepted'; end if;
  if (select public_payload from public.onchain_verified_snapshot)<>before_value or (select dashboard_payload from public.onchain_verified_snapshot)<>before_dashboard then raise exception 'rejected publication mutated state'; end if;
  foreach mutation in array array[p-'snapshot',p||'{"private":"secret"}'::jsonb,jsonb_set(p,'{snapshot,generatedAt}',to_jsonb(clock_timestamp()+interval '1 hour')),
    jsonb_set(p,'{snapshot,generatedAt}',to_jsonb(clock_timestamp()-interval '1 hour')),jsonb_set(p,'{snapshot,blockNumber}','"101"')] loop
    begin
      perform public.replace_onchain_verified_snapshot(mutation,d);
      raise exception 'invalid publication accepted';
    exception when others then if sqlerrm='invalid publication accepted' then raise; end if; end;
  end loop;
  -- The legacy projection rejects version2 after the full-row upsert: the whole publication must roll back.
  begin
    perform public.replace_onchain_verified_snapshot(jsonb_set(p,'{snapshot,blockNumber}','"101"'),jsonb_set(jsonb_set(d,'{blockNumber}','"101"'),'{version}','2'));
    raise exception 'invalid legacy projection accepted';
  exception when others then if sqlerrm='invalid legacy projection accepted' then raise; end if; end;
  if (select public_payload from public.onchain_verified_snapshot)<>before_value or (select payload from public.onchain_dashboard_snapshot)<>before_dashboard then raise exception 'failed publication was not atomic'; end if;
  perform public.replace_onchain_dashboard_snapshot(d);
  if (select payload from public.onchain_dashboard_snapshot)<>d then raise exception 'old RPC compatibility lost'; end if;
  mutation:=jsonb_set(jsonb_set(p,'{snapshot,blockNumber}','"101"'),'{snapshot,business}','null');
  mutation:=jsonb_set(mutation,'{snapshot,businessUnavailableReason}','"cross_hub_source_collision"');
  if not public.replace_onchain_verified_snapshot(mutation,null) then raise exception 'raw collision ledger rejected'; end if;
  if (select dashboard_payload from public.onchain_verified_snapshot) is not null or exists(select 1 from public.onchain_dashboard_snapshot) then raise exception 'collision retained misleading metrics'; end if;
  if public.replace_onchain_verified_snapshot(p,d) then raise exception 'stale projection overwrote collision'; end if;
  if (select dashboard_payload from public.onchain_verified_snapshot) is not null then raise exception 'stale writer changed projection'; end if;
  p:=jsonb_set(p,'{snapshot,blockNumber}','"102"');d:=jsonb_set(d,'{blockNumber}','"102"');
  if not public.replace_onchain_verified_snapshot(p,d) then raise exception 'new verified publication rejected'; end if;
end $$;
commit;
