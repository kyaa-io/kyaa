-- Public reads use one complete verified publication, never a request-time chain scan.
create table public.onchain_verified_snapshot (
  id boolean primary key default true check (id),
  public_payload jsonb not null,
  dashboard_payload jsonb,
  block_number numeric(78,0) not null check (block_number >= 0),
  block_hash text not null,
  verified_at timestamptz not null
);
alter table public.onchain_verified_snapshot enable row level security;
revoke all on public.onchain_verified_snapshot from public, anon, authenticated, service_role;
grant select on public.onchain_verified_snapshot to service_role;

create function public.replace_onchain_verified_snapshot(p_public_payload jsonb, p_dashboard_payload jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare s jsonb := p_public_payload->'snapshot'; changed boolean;
begin
  if (jsonb_typeof(p_public_payload)='object'
    and p_public_payload ?& array['configFingerprint','snapshot']
    and p_public_payload-array['configFingerprint','snapshot']='{}'::jsonb
    and p_public_payload->>'configFingerprint' ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(s)='object' and s->>'version'='2' and s->>'chainId'='91342'
    and s ?& array['version','network','chainId','hubAddress','environmentId','schemaUid','fromBlock','blockNumber','blockHash',
      'blockTimestamp','generatedAt','deployments','business','raw','excludedQaWallets','excludedQaActions','historicalActions','actions','transactions']
    and s-array['version','network','chainId','hubAddress','environmentId','schemaUid','fromBlock','blockNumber','blockHash',
      'blockTimestamp','generatedAt','deployments','business','businessUnavailableReason','raw','excludedQaWallets','excludedQaActions','historicalActions','actions','transactions']='{}'::jsonb
    and s->>'blockNumber' ~ '^(0|[1-9][0-9]{0,77})$' and s->>'fromBlock' ~ '^(0|[1-9][0-9]{0,77})$'
    and s->>'blockHash' ~ '^0x[0-9a-fA-F]{64}$'
    and jsonb_typeof(s->'actions')='array' and jsonb_typeof(s->'transactions')='array'
    and jsonb_typeof(s->'deployments')='array' and jsonb_typeof(s->'raw')='object'
    and s->>'generatedAt' is not null and s->>'blockTimestamp' is not null) is not true then
    raise exception 'VERIFIED_SNAPSHOT_INVALID';
  end if;
  if (s->>'blockNumber')::numeric < (s->>'fromBlock')::numeric
    or (s->>'generatedAt')::timestamptz > clock_timestamp()
    or (s->>'generatedAt')::timestamptz < clock_timestamp()-interval '15 minutes'
    or (s->>'blockTimestamp')::timestamptz > (s->>'generatedAt')::timestamptz then
    raise exception 'VERIFIED_SNAPSHOT_INVALID';
  end if;
  if s->'business'='null'::jsonb then
    if p_dashboard_payload is not null or s->>'businessUnavailableReason' is distinct from 'cross_hub_source_collision' then
      raise exception 'VERIFIED_SNAPSHOT_PROJECTION_INVALID';
    end if;
  elsif (jsonb_typeof(s->'business')='object' and not (s ? 'businessUnavailableReason')
    and jsonb_typeof(p_dashboard_payload)='object'
    and p_dashboard_payload->>'configFingerprint'=p_public_payload->>'configFingerprint'
    and p_dashboard_payload->'metrics'=s->'business'
    and p_dashboard_payload->'deployments'=s->'deployments'
    and p_dashboard_payload->>'verifiedAt'=s->>'generatedAt'
    and p_dashboard_payload->>'blockNumber'=s->>'blockNumber'
    and lower(p_dashboard_payload->>'blockHash')=lower(s->>'blockHash')
    and p_dashboard_payload->>'blockTimestamp'=s->>'blockTimestamp'
    and p_dashboard_payload->>'network'=s->>'network'
    and p_dashboard_payload->>'chainId'=s->>'chainId') is not true then
    raise exception 'VERIFIED_SNAPSHOT_PROJECTION_INVALID';
  end if;

  insert into public.onchain_verified_snapshot as stored(id,public_payload,dashboard_payload,block_number,block_hash,verified_at)
  values(true,p_public_payload,p_dashboard_payload,(s->>'blockNumber')::numeric,lower(s->>'blockHash'),(s->>'generatedAt')::timestamptz)
  on conflict(id) do update set public_payload=excluded.public_payload,dashboard_payload=excluded.dashboard_payload,
    block_number=excluded.block_number,block_hash=excluded.block_hash,verified_at=excluded.verified_at
  where excluded.block_number>stored.block_number
    or (excluded.block_number=stored.block_number and excluded.block_hash=stored.block_hash and excluded.verified_at>=stored.verified_at)
  returning true into changed;
  if not coalesce(changed,false) then return false; end if;
  if p_dashboard_payload is null then
    delete from public.onchain_dashboard_snapshot where block_number <= (s->>'blockNumber')::numeric;
  else
    perform public.replace_onchain_dashboard_snapshot(p_dashboard_payload);
  end if;
  return true;
end $$;
revoke all on function public.replace_onchain_verified_snapshot(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.replace_onchain_verified_snapshot(jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
