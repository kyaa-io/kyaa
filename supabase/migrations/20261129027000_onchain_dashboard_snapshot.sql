-- Only a safe projection is retained; the full verified chain ledger stays in its existing reader.
create table public.onchain_dashboard_snapshot (
  id boolean primary key default true check (id),
  payload jsonb not null,
  block_number numeric(78,0) not null check (block_number >= 0),
  block_hash text not null check (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
  verified_at timestamptz not null
);
alter table public.onchain_dashboard_snapshot enable row level security;
revoke all on public.onchain_dashboard_snapshot from public, anon, authenticated;
grant select, insert, update on public.onchain_dashboard_snapshot to service_role;

create function public.replace_onchain_dashboard_snapshot(p_payload jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed boolean;
begin
  if p_payload->>'version' <> '1' or p_payload->>'configFingerprint' !~ '^[a-f0-9]{64}$'
    or p_payload->>'blockNumber' !~ '^(0|[1-9][0-9]*)$'
    or p_payload->>'blockHash' !~ '^0x[0-9a-fA-F]{64}$'
    or p_payload->'metrics' is null or p_payload->'metrics' = 'null'::jsonb
    or (p_payload->>'verifiedAt')::timestamptz > clock_timestamp()
    or (p_payload->>'verifiedAt')::timestamptz < clock_timestamp() - interval '15 minutes'
    or (p_payload->>'blockTimestamp')::timestamptz > (p_payload->>'verifiedAt')::timestamptz
    or not (p_payload ?& array['version','configFingerprint','network','chainId','verifiedAt','blockNumber','blockHash','blockTimestamp','deployments','metrics','proof'])
    or p_payload - array['version','configFingerprint','network','chainId','verifiedAt','blockNumber','blockHash','blockTimestamp','deployments','metrics','proof'] <> '{}'::jsonb then
    raise exception 'Invalid dashboard snapshot';
  end if;
  insert into public.onchain_dashboard_snapshot as stored (id, payload, block_number, block_hash, verified_at)
  values (true, p_payload, (p_payload->>'blockNumber')::numeric, lower(p_payload->>'blockHash'), (p_payload->>'verifiedAt')::timestamptz)
  on conflict (id) do update set payload = excluded.payload, block_number = excluded.block_number,
    block_hash = excluded.block_hash, verified_at = excluded.verified_at
  where excluded.block_number > stored.block_number
    or (excluded.block_number = stored.block_number and excluded.block_hash = stored.block_hash and excluded.verified_at > stored.verified_at)
  returning true into changed;
  return coalesce(changed, false);
end;
$$;
revoke all on function public.replace_onchain_dashboard_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.replace_onchain_dashboard_snapshot(jsonb) to service_role;
