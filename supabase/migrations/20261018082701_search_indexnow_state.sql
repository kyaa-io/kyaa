-- One durable acknowledged public projection; the lease fences overlapping cron runs.
create table public.search_indexnow_state (
  id integer primary key check (id = 1),
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  lease_token uuid,
  lease_until timestamptz,
  acknowledged_at timestamptz
);
alter table public.search_indexnow_state enable row level security;
revoke all on public.search_indexnow_state from public, anon, authenticated, service_role;
grant select, update on public.search_indexnow_state to service_role;
insert into public.search_indexnow_state (id) values (1);

create function public.claim_search_indexnow(p_token uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare prior jsonb;
begin
  if p_token is null then raise exception 'INVALID_LEASE_TOKEN'; end if;
  update public.search_indexnow_state set lease_token=p_token, lease_until=statement_timestamp()+interval '5 minutes'
    where id=1 and (lease_until is null or lease_until < statement_timestamp()) returning snapshot into prior;
  if not found then return jsonb_build_object('acquired',false); end if;
  return jsonb_build_object('acquired',true,'snapshot',prior);
end $$;

create function public.acknowledge_search_indexnow(p_token uuid,p_snapshot jsonb) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or p_snapshot='{}'::jsonb or octet_length(p_snapshot::text)>20000000 then
    raise exception 'INVALID_PUBLICATION_SNAPSHOT';
  end if;
  update public.search_indexnow_state set snapshot=p_snapshot, acknowledged_at=statement_timestamp()
    where id=1 and lease_token=p_token and lease_until>=statement_timestamp();
  return found;
end $$;

create function public.release_search_indexnow(p_token uuid) returns void
language sql security invoker set search_path = '' as $$
  update public.search_indexnow_state set lease_token=null,lease_until=null where id=1 and lease_token=p_token;
$$;
revoke all on function public.claim_search_indexnow(uuid),public.acknowledge_search_indexnow(uuid,jsonb),public.release_search_indexnow(uuid) from public,anon,authenticated;
grant execute on function public.claim_search_indexnow(uuid),public.acknowledge_search_indexnow(uuid,jsonb),public.release_search_indexnow(uuid) to service_role;
