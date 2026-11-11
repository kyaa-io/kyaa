-- PRIVY-EXIT-0005: Cognito sign-in and kyaa-issued wallet addresses without any Privy call.
-- app_users.privy_user_id stays the external identity key: existing members keep their did:privy value,
-- new members get 'kyaa:<uuid>'. Existing owners are found only by an exact verified Google/Apple subject;
-- a matching email alone never merges two accounts.

-- user_wallets.provider stays 'privy' for every member wallet: about 30 record/stamp functions select
-- provider='privy' as "the member's embedded record address". kyaa_wallet_derivations marks server-issued ones.

-- Kakao Login (Cognito OIDC provider) subjects are recorded with the Google/Apple ones. Privy session sync still
-- accepts Google/Apple only, so Kakao rows only come from create_kyaa_member.
alter table public.live_privy_auth_accounts drop constraint live_privy_auth_accounts_provider_issuer_check;
alter table public.live_privy_auth_accounts add constraint live_privy_auth_accounts_provider_issuer_check
  check (provider_issuer in ('https://accounts.google.com','https://appleid.apple.com','https://kauth.kakao.com'));

create sequence public.kyaa_wallet_derivation_index_seq as bigint minvalue 0 start 0;
create table public.kyaa_wallet_derivations (
  derivation_index bigint primary key check (derivation_index between 0 and 2147483647),
  app_user_id uuid not null unique references public.app_users(id) on delete cascade,
  chain_id bigint not null,
  address text not null,
  created_at timestamptz not null default now(),
  unique (chain_id, address),
  foreign key (chain_id, address) references public.user_wallets(chain_id, address)
);
alter table public.kyaa_wallet_derivations enable row level security;
revoke all on public.kyaa_wallet_derivations from public, anon, authenticated;
revoke all on sequence public.kyaa_wallet_derivation_index_seq from public, anon, authenticated;

-- Verified provider accounts of one member (Google/Apple subjects seen through Privy, the Privy export or Cognito).
create function public.kyaa_member_provider_accounts(p_app_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(distinct jsonb_build_object('issuer',a.provider_issuer,'subject',a.provider_subject)),'[]'::jsonb)
  from (
    select provider_issuer,provider_subject from public.live_privy_auth_accounts where app_user_id=p_app_user_id
    union
    select provider_issuer,provider_subject from public.legacy_auth_inventory_accounts where app_user_id=p_app_user_id
  ) a;
$$;

-- Request-time lookup. Returns null for unknown or inactive members.
create function public.resolve_kyaa_identity(p_issuer text, p_subject text, p_chain_id bigint)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('appUserId',u.id,'identityKey',u.privy_user_id,'verifiedEmail',u.verified_email,
    'walletAddress',w.address,'chainId',w.chain_id,'providerAccounts',public.kyaa_member_provider_accounts(u.id))
  from public.external_auth_identities i
  join public.app_users u on u.id=i.app_user_id and u.status='active'
  left join public.user_wallets w on w.app_user_id=u.id and w.chain_id=p_chain_id
  where i.issuer=p_issuer and i.subject=p_subject;
$$;

-- Sign-in classification after a verified Cognito callback.
-- linked: the Cognito identity now points at an existing active member (by exact provider subject).
-- new: no member owns this provider subject or email; the caller issues a wallet and calls create_kyaa_member.
-- blocked: inactive member, ambiguous owners, or an email already used by another member (needs recovery/review).
create function public.kyaa_sign_in(p_issuer text, p_subject text, p_provider_issuer text, p_provider_subject text,
  p_verified_email text, p_chain_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_email text:=lower(btrim(p_verified_email)); v_owner uuid; v_owners uuid[]; v_status text; v_wallet text;
begin
  if p_issuer !~ '^https://cognito-idp\.[a-z0-9-]+\.amazonaws\.com/[a-zA-Z0-9_-]+$' or length(p_subject) not between 1 and 256
    or p_provider_issuer not in ('https://accounts.google.com','https://appleid.apple.com','https://kauth.kakao.com')
    or length(p_provider_subject) not between 1 and 256
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'INVALID_SIGN_IN';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('external-identity:'||p_issuer||':'||p_subject,0));
  perform pg_advisory_xact_lock(hashtextextended('live-privy-provider:'||p_provider_issuer||':'||p_provider_subject,0));
  -- Two providers with the same email signing up at once must not both pass the email check (no unique index on email).
  perform pg_advisory_xact_lock(hashtextextended('kyaa-member-email:'||v_email,0));

  select i.app_user_id,u.status into v_owner,v_status from public.external_auth_identities i
    join public.app_users u on u.id=i.app_user_id where i.issuer=p_issuer and i.subject=p_subject;
  if v_owner is not null then
    if v_status<>'active' then return jsonb_build_object('mode','blocked','reason','inactive'); end if;
    return jsonb_build_object('mode','linked','appUserId',v_owner);
  end if;

  select array_agg(distinct a.app_user_id) into v_owners from (
    select app_user_id from public.live_privy_auth_accounts where provider_issuer=p_provider_issuer and provider_subject=p_provider_subject
    union
    select app_user_id from public.legacy_auth_inventory_accounts where provider_issuer=p_provider_issuer and provider_subject=p_provider_subject
  ) a;
  if cardinality(v_owners)>1 then return jsonb_build_object('mode','blocked','reason','ambiguous'); end if;
  if cardinality(v_owners)=1 then
    select status into v_status from public.app_users where id=v_owners[1] for update;
    if v_status is distinct from 'active' then return jsonb_build_object('mode','blocked','reason','inactive'); end if;
    if exists(select 1 from public.external_auth_identities where issuer=p_issuer and app_user_id=v_owners[1]) then
      return jsonb_build_object('mode','blocked','reason','ambiguous');
    end if;
    select address into v_wallet from public.user_wallets where app_user_id=v_owners[1] and chain_id=p_chain_id;
    if v_wallet is null then return jsonb_build_object('mode','blocked','reason','wallet_missing'); end if;
    insert into public.external_auth_identities(issuer,subject,app_user_id,chain_id,wallet_address)
      values(p_issuer,p_subject,v_owners[1],p_chain_id,v_wallet);
    return jsonb_build_object('mode','linked','appUserId',v_owners[1]);
  end if;

  if exists(select 1 from public.app_users where verified_email=v_email) then
    return jsonb_build_object('mode','blocked','reason','email_in_use');
  end if;
  return jsonb_build_object('mode','new','derivationIndex',nextval('public.kyaa_wallet_derivation_index_seq'));
end;
$$;

-- Creates a new member whose wallet address the server derived from the configured xpub at p_derivation_index.
create function public.create_kyaa_member(p_issuer text, p_subject text, p_provider_issuer text, p_provider_subject text,
  p_verified_email text, p_chain_id bigint, p_derivation_index bigint, p_wallet_address text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_email text:=lower(btrim(p_verified_email)); v_key text:='kyaa:'||extensions.gen_random_uuid()::text; v_owner uuid;
begin
  if p_wallet_address !~ '^0x[0-9a-f]{40}$' or p_derivation_index is null or p_derivation_index<0
    or p_provider_issuer not in ('https://accounts.google.com','https://appleid.apple.com','https://kauth.kakao.com') then raise exception 'INVALID_SIGN_IN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('external-identity:'||p_issuer||':'||p_subject,0));
  perform pg_advisory_xact_lock(hashtextextended('live-privy-provider:'||p_provider_issuer||':'||p_provider_subject,0));
  -- Two providers with the same email signing up at once must not both pass the email check (no unique index on email).
  perform pg_advisory_xact_lock(hashtextextended('kyaa-member-email:'||v_email,0));
  if exists(select 1 from public.external_auth_identities where issuer=p_issuer and subject=p_subject)
    or exists(select 1 from public.live_privy_auth_accounts where provider_issuer=p_provider_issuer and provider_subject=p_provider_subject)
    or exists(select 1 from public.legacy_auth_inventory_accounts where provider_issuer=p_provider_issuer and provider_subject=p_provider_subject)
    or exists(select 1 from public.app_users where verified_email=v_email) then
    raise exception 'IDENTITY_LINK_CONFLICT';
  end if;
  select s.app_user_id into strict v_owner from public.sync_privy_identity(v_key,v_email,p_chain_id,p_wallet_address) s;
  insert into public.kyaa_wallet_derivations(derivation_index,app_user_id,chain_id,address) values(p_derivation_index,v_owner,p_chain_id,p_wallet_address);
  insert into public.live_privy_auth_owners values(v_owner,v_key);
  insert into public.live_privy_auth_accounts values(p_provider_issuer,p_provider_subject,v_owner);
  insert into public.external_auth_identities(issuer,subject,app_user_id,chain_id,wallet_address)
    values(p_issuer,p_subject,v_owner,p_chain_id,p_wallet_address);
  return public.resolve_kyaa_identity(p_issuer,p_subject,p_chain_id);
end;
$$;

revoke all on function public.kyaa_member_provider_accounts(uuid), public.resolve_kyaa_identity(text,text,bigint),
  public.kyaa_sign_in(text,text,text,text,text,bigint),
  public.create_kyaa_member(text,text,text,text,text,bigint,bigint,text) from public, anon, authenticated;
grant execute on function public.kyaa_member_provider_accounts(uuid), public.resolve_kyaa_identity(text,text,bigint),
  public.kyaa_sign_in(text,text,text,text,text,bigint),
  public.create_kyaa_member(text,text,text,text,text,bigint,bigint,text) to service_role;

-- Session sync accepts kyaa:<uuid> identity keys as well as existing did:privy keys (otherwise unchanged).
create or replace function public.sync_privy_identity_with_provider_accounts(
  p_privy_user_id text,p_verified_email text,p_chain_id bigint,p_wallet_address text,p_provider_accounts jsonb
) returns table(app_user_id uuid,wallet_id uuid)
language plpgsql security definer set search_path='' as $$
declare account jsonb; owner_id uuid; synced_wallet_id uuid;
begin
  p_privy_user_id:=btrim(p_privy_user_id);
  if p_privy_user_id is null or p_privy_user_id !~ '^(did:privy|kyaa):[^[:space:]]+$'
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
