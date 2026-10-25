-- Verified live sessions extend coverage without rewriting the audited export.
create table public.live_privy_auth_owners (
  app_user_id uuid primary key references public.app_users(id) on delete cascade,
  privy_user_id text not null unique
);
create table public.live_privy_auth_accounts (
  provider_issuer text not null check(provider_issuer in ('https://accounts.google.com','https://appleid.apple.com')),
  provider_subject text not null check(length(provider_subject) between 1 and 256),
  app_user_id uuid not null references public.live_privy_auth_owners(app_user_id) on delete cascade,
  primary key(provider_issuer,provider_subject)
);
alter table public.live_privy_auth_owners enable row level security;
alter table public.live_privy_auth_accounts enable row level security;
revoke all on public.live_privy_auth_owners,public.live_privy_auth_accounts from public,anon,authenticated,service_role;
grant select on public.live_privy_auth_owners,public.live_privy_auth_accounts to service_role;

create function public.sync_privy_identity_with_provider_accounts(
  p_privy_user_id text,p_verified_email text,p_chain_id bigint,p_wallet_address text,p_provider_accounts jsonb
) returns table(app_user_id uuid,wallet_id uuid)
language plpgsql security definer set search_path='' as $$
declare account jsonb; owner_id uuid; synced_wallet_id uuid;
begin
  p_privy_user_id:=btrim(p_privy_user_id);
  if p_privy_user_id is null or p_privy_user_id !~ '^did:privy:[^[:space:]]+$'
    or p_provider_accounts is null or jsonb_typeof(p_provider_accounts)<>'array' then
    raise exception 'INVALID_VERIFIED_PROVIDER_ACCOUNTS';
  end if;
  if jsonb_array_length(p_provider_accounts)>100 then raise exception 'INVALID_VERIFIED_PROVIDER_ACCOUNTS'; end if;
  for account in select value from jsonb_array_elements(p_provider_accounts) loop
    if jsonb_typeof(account)<>'object' or jsonb_typeof(account->'issuer') is distinct from 'string'
      or jsonb_typeof(account->'subject') is distinct from 'string'
      or account->>'issuer' not in ('https://accounts.google.com','https://appleid.apple.com')
      or length(account->>'subject') not between 1 and 256 or btrim(account->>'subject')=''
      or (account-'issuer'-'subject')<>'{}'::jsonb then
      raise exception 'INVALID_VERIFIED_PROVIDER_ACCOUNTS';
    end if;
  end loop;
  -- Every competing owner takes provider locks in the same order before the DID/user locks.
  for account in select distinct value from jsonb_array_elements(p_provider_accounts) order by value loop
    perform pg_advisory_xact_lock(hashtextextended('live-privy-provider:'||(account->>'issuer')||':'||(account->>'subject'),0));
  end loop;
  select s.app_user_id,s.wallet_id into strict owner_id,synced_wallet_id
    from public.sync_privy_identity(p_privy_user_id,p_verified_email,p_chain_id,p_wallet_address) s;
  if exists(select 1 from public.live_privy_auth_owners o
    where (o.app_user_id=owner_id or o.privy_user_id=p_privy_user_id)
      and (o.app_user_id<>owner_id or o.privy_user_id<>p_privy_user_id)) then
    raise exception 'VERIFIED_PROVIDER_OWNER_CONFLICT';
  end if;
  insert into public.live_privy_auth_owners values(owner_id,p_privy_user_id) on conflict do nothing;
  for account in select distinct value from jsonb_array_elements(p_provider_accounts) order by value loop
    if exists(select 1 from public.legacy_auth_inventory_accounts a
      join public.legacy_auth_inventory_owners o on o.run_id=a.run_id and o.app_user_id=a.app_user_id
      where a.provider_issuer=account->>'issuer' and a.provider_subject=account->>'subject'
        and (o.app_user_id<>owner_id or o.privy_user_id<>p_privy_user_id))
      or exists(select 1 from public.legacy_auth_inventory_unowned u
        where u.privy_user_id<>p_privy_user_id and u.accounts @> jsonb_build_array(account))
      or exists(select 1 from public.live_privy_auth_accounts a
        where a.provider_issuer=account->>'issuer' and a.provider_subject=account->>'subject' and a.app_user_id<>owner_id) then
      raise exception 'VERIFIED_PROVIDER_OWNER_CONFLICT';
    end if;
    insert into public.live_privy_auth_accounts values(account->>'issuer',account->>'subject',owner_id) on conflict do nothing;
  end loop;
  return query select owner_id,synced_wallet_id;
end;
$$;
revoke all on function public.sync_privy_identity_with_provider_accounts(text,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.sync_privy_identity_with_provider_accounts(text,text,bigint,text,jsonb) to service_role;

create or replace function public.classify_cognito_enrollment(p_provider_issuer text,p_provider_subject text,p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid; privy_id text; latest_run uuid; owner_ids uuid[];
begin
  select array_agg(distinct a.app_user_id) into owner_ids from (
    select app_user_id from public.legacy_auth_inventory_accounts where provider_issuer=p_provider_issuer and provider_subject=p_provider_subject
    union
    select a.app_user_id from public.live_privy_auth_accounts a
      where a.provider_issuer=p_provider_issuer and a.provider_subject=p_provider_subject
  ) a;
  if cardinality(owner_ids)>1 then return jsonb_build_object('mode','blocked'); end if;
  select u.id,u.privy_user_id into owner_id,privy_id from public.app_users u where u.id=owner_ids[1] and u.status='active'
    and not exists(select 1 from public.live_privy_auth_owners o where o.app_user_id=u.id and o.privy_user_id<>u.privy_user_id);
  if owner_id is not null then
    if exists(select 1 from public.app_users u where u.verified_email=lower(trim(p_verified_email)) and u.id<>owner_id)
      or exists(select 1 from public.legacy_auth_inventory_unowned u where u.privy_user_id<>privy_id
        and u.accounts @> jsonb_build_array(jsonb_build_object('issuer',p_provider_issuer,'subject',p_provider_subject))) then
      return jsonb_build_object('mode','blocked');
    end if;
    return jsonb_build_object('mode','recovery','expectedPrivyUserId',privy_id);
  end if;
  if cardinality(owner_ids)>0 then return jsonb_build_object('mode','blocked'); end if;
  if exists(select 1 from public.legacy_auth_inventory_unowned u where u.emails @> jsonb_build_array(lower(trim(p_verified_email)))
      or u.accounts @> jsonb_build_array(jsonb_build_object('issuer',p_provider_issuer,'subject',p_provider_subject))) then return jsonb_build_object('mode','blocked'); end if;
  if exists(select 1 from public.app_users u where u.verified_email=lower(trim(p_verified_email))) then return jsonb_build_object('mode','blocked'); end if;
  select id into latest_run from public.legacy_auth_inventory_runs where completed_at is not null order by completed_at desc limit 1;
  if latest_run is null or exists(select 1 from public.app_users u where u.status='active'
    and not exists(select 1 from public.legacy_auth_inventory_owners o where o.run_id=latest_run and o.app_user_id=u.id)
    and not exists(select 1 from public.live_privy_auth_owners o where o.app_user_id=u.id and o.privy_user_id=u.privy_user_id)
    and not exists(select 1 from public.external_auth_identities i where i.app_user_id=u.id)
    and not exists(select 1 from public.external_auth_pending p where p.app_user_id=u.id)) then return jsonb_build_object('mode','blocked'); end if;
  return jsonb_build_object('mode','new');
end;
$$;

create or replace function public.cognito_rollout_ready()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.legacy_auth_inventory_runs r where r.completed_at is not null
    and not exists(select 1 from public.app_users u where u.status='active'
      and not exists(select 1 from public.legacy_auth_inventory_owners o where o.run_id=r.id and o.app_user_id=u.id)
      and not exists(select 1 from public.live_privy_auth_owners o where o.app_user_id=u.id and o.privy_user_id=u.privy_user_id)
      and not exists(select 1 from public.external_auth_identities i where i.app_user_id=u.id)
    and not exists(select 1 from public.external_auth_pending p where p.app_user_id=u.id)));
$$;

create or replace function public.link_external_auth_identity(p_issuer text,p_subject text,p_privy_user_id text,p_wallet_address text,p_chain_id bigint,p_verified_email text,p_commit boolean default true,p_permit_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; existing_id uuid;
begin
  if p_verified_email is null or p_verified_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'IDENTITY_LINK_CONFLICT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('external-identity:'||p_issuer||':'||p_subject,0));
  select u.id into owner_id from public.app_users u join public.user_wallets w on w.app_user_id=u.id
    where u.privy_user_id=p_privy_user_id and u.status='active' and w.chain_id=p_chain_id and w.address=p_wallet_address for update of u;
  if owner_id is null then raise exception 'IDENTITY_LINK_CONFLICT'; end if;
  -- Two independently registered owners must be reviewed, even if their verified emails match.
  if exists(select 1 from public.app_users u where u.verified_email=lower(trim(p_verified_email)) and u.id<>owner_id) then raise exception 'IDENTITY_LINK_CONFLICT'; end if;
  select app_user_id into existing_id from public.external_auth_identities where issuer=p_issuer and subject=p_subject;
  if existing_id is not null and existing_id<>owner_id then raise exception 'IDENTITY_LINK_CONFLICT'; end if;
  if p_permit_hash is not null and not exists(select 1 from public.external_auth_pending where issuer=p_issuer and subject=p_subject and app_user_id=owner_id) then
    if not exists(select 1 from public.cognito_enrollment_permits p where p.token_hash=p_permit_hash and p.issuer=p_issuer and p.subject=p_subject and p.verified_email=lower(trim(p_verified_email)) and (p.expires_at>now() or (p.reserved_privy_user_id=p_privy_user_id and p.reserved_wallet_address=p_wallet_address and p.reserved_chain_id=p_chain_id)) and p.consumed_at is null) then raise exception 'IDENTITY_LINK_CONFLICT'; end if;
  elsif existing_id is null and not exists(select 1 from public.legacy_auth_inventory_owners i where i.app_user_id=owner_id)
    and not exists(select 1 from public.live_privy_auth_owners o where o.app_user_id=owner_id and o.privy_user_id=p_privy_user_id)
    and not exists(select 1 from public.external_auth_pending where issuer=p_issuer and subject=p_subject and app_user_id=owner_id)
    and not exists(select 1 from public.cognito_enrollment_permits where issuer=p_issuer and subject=p_subject and reserved_privy_user_id=p_privy_user_id and reserved_wallet_address=p_wallet_address and reserved_chain_id=p_chain_id and consumed_at is null) then
    raise exception 'IDENTITY_LINK_CONFLICT';
  end if;
  if not p_commit then
    insert into public.external_auth_pending(issuer,subject,app_user_id) values(p_issuer,p_subject,owner_id) on conflict(issuer,subject) do nothing;
    if not exists(select 1 from public.external_auth_pending where issuer=p_issuer and subject=p_subject and app_user_id=owner_id) then raise exception 'IDENTITY_LINK_CONFLICT'; end if;
    return jsonb_build_object('appUserId',owner_id);
  end if;
  insert into public.external_auth_identities(issuer,subject,app_user_id,chain_id,wallet_address)
    values(p_issuer,p_subject,owner_id,p_chain_id,p_wallet_address) on conflict(issuer,subject) do nothing;
  update public.cognito_enrollment_permits set consumed_at=now() where issuer=p_issuer and subject=p_subject and (token_hash=p_permit_hash or reserved_privy_user_id=p_privy_user_id) and consumed_at is null;
  delete from public.external_auth_pending where issuer=p_issuer and subject=p_subject;
  return public.resolve_external_auth_identity(p_issuer,p_subject);
end;
$$;
