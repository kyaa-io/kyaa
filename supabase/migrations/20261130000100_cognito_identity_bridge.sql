-- Opt-in Cognito identities reference the existing owner and wallet; email never merges owners.
create table public.external_auth_identities (
  issuer text not null check (issuer ~ '^https://cognito-idp\.[a-z0-9-]+\.amazonaws\.com/[a-zA-Z0-9_-]+$'),
  subject text not null check (length(subject) between 1 and 256),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  chain_id bigint not null,
  wallet_address text not null,
  created_at timestamptz not null default now(),
  primary key (issuer, subject),
  unique (issuer, app_user_id),
  foreign key (chain_id, wallet_address) references public.user_wallets(chain_id, address)
);
alter table public.external_auth_identities enable row level security;
revoke all on public.external_auth_identities from public, anon, authenticated;
grant select, insert on public.external_auth_identities to service_role;

create table public.external_auth_pending (
  issuer text not null,subject text not null,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(issuer,subject), unique(issuer,app_user_id)
);
alter table public.external_auth_pending enable row level security;
revoke all on public.external_auth_pending from public,anon,authenticated;
grant select,insert,delete on public.external_auth_pending to service_role;

create function public.resolve_external_auth_identity(p_issuer text, p_subject text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('appUserId',u.id,'privyUserId',u.privy_user_id,'verifiedEmail',u.verified_email,'walletAddress',w.address,'chainId',w.chain_id)
  from public.external_auth_identities i
  join public.app_users u on u.id=i.app_user_id and u.status='active'
  join public.user_wallets w on w.app_user_id=u.id and w.chain_id=i.chain_id and w.address=i.wallet_address
  where i.issuer=p_issuer and i.subject=p_subject;
$$;
create function public.link_external_auth_identity(p_issuer text,p_subject text,p_privy_user_id text,p_wallet_address text,p_chain_id bigint,p_verified_email text,p_commit boolean default true,p_permit_hash text default null)
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

-- Tokens are encrypted by the app. Cookies contain only an unguessable lookup key.
create table public.cognito_browser_sessions (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  encrypted_session text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.cognito_browser_sessions enable row level security;
revoke all on public.cognito_browser_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.cognito_browser_sessions to service_role;
create function public.write_cognito_browser_session(p_token_hash text,p_encrypted_session text,p_expires_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.cognito_browser_sessions(token_hash,encrypted_session,expires_at) values(p_token_hash,p_encrypted_session,p_expires_at)
  on conflict(token_hash) do update set encrypted_session=excluded.encrypted_session,expires_at=excluded.expires_at
  where public.cognito_browser_sessions.expires_at>clock_timestamp();
  if not found then raise exception 'COGNITO_SESSION_REVOKED' using errcode='55000'; end if;
end;
$$;
create function public.read_cognito_browser_session(p_token_hash text)
returns text language sql stable security definer set search_path='' as $$
  select encrypted_session from public.cognito_browser_sessions where token_hash=p_token_hash and expires_at>clock_timestamp();
$$;
create function public.delete_cognito_browser_session(p_token_hash text)
returns void language sql security definer set search_path='' as $$
  insert into public.cognito_browser_sessions(token_hash,encrypted_session,expires_at) values(p_token_hash,'',clock_timestamp())
  on conflict(token_hash) do update set encrypted_session='',expires_at=least(public.cognito_browser_sessions.expires_at,excluded.expires_at);
$$;
-- Single-use native handoffs never contain tokens in the URL.
create table public.cognito_native_handoffs (
  code_hash text primary key check(code_hash ~ '^[a-f0-9]{64}$'),
  challenge text not null check(challenge ~ '^[A-Za-z0-9_-]{43}$'),
  encrypted_session text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);
alter table public.cognito_native_handoffs enable row level security;
revoke all on public.cognito_native_handoffs from public,anon,authenticated;
grant select,insert,update,delete on public.cognito_native_handoffs to service_role;
create function public.create_cognito_native_handoff(p_code_hash text,p_challenge text,p_encrypted_session text)
returns void language sql security definer set search_path='' as $$
  insert into public.cognito_native_handoffs values(p_code_hash,p_challenge,p_encrypted_session,now()+interval '60 seconds',null);
$$;
create function public.consume_cognito_native_handoff(p_code_hash text,p_challenge text)
returns text language plpgsql security definer set search_path='' as $$
declare result text;
begin
  update public.cognito_native_handoffs set consumed_at=now()
    where code_hash=p_code_hash and challenge=p_challenge and consumed_at is null and expires_at>now()
    returning encrypted_session into result;
  return result;
end;
$$;
revoke all on function public.resolve_external_auth_identity(text,text),public.link_external_auth_identity(text,text,text,text,bigint,text,boolean,text),public.write_cognito_browser_session(text,text,timestamptz),public.read_cognito_browser_session(text),public.delete_cognito_browser_session(text),public.create_cognito_native_handoff(text,text,text),public.consume_cognito_native_handoff(text,text) from public,anon,authenticated;
grant execute on function public.resolve_external_auth_identity(text,text),public.link_external_auth_identity(text,text,text,text,bigint,text,boolean,text),public.write_cognito_browser_session(text,text,timestamptz),public.read_cognito_browser_session(text),public.delete_cognito_browser_session(text),public.create_cognito_native_handoff(text,text,text),public.consume_cognito_native_handoff(text,text) to service_role;

-- Root imports a complete server-verified Privy export joined to current app_users UUIDs.
create table public.legacy_auth_inventory_runs (
  id uuid primary key,
  artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  expected_owner_count integer not null check(expected_owner_count>=0),
  expected_privy_user_count integer check(expected_privy_user_count>=0),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.legacy_auth_inventory_owners (
  run_id uuid not null references public.legacy_auth_inventory_runs(id) on delete cascade,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  privy_user_id text not null,
  primary key(run_id,app_user_id)
);
create table public.legacy_auth_inventory_accounts (
  run_id uuid not null,
  app_user_id uuid not null,
  provider_issuer text not null check(provider_issuer in('https://accounts.google.com','https://appleid.apple.com')),
  provider_subject text not null check(length(provider_subject) between 1 and 256),
  primary key(run_id,provider_issuer,provider_subject),
  foreign key(run_id,app_user_id) references public.legacy_auth_inventory_owners(run_id,app_user_id) on delete cascade
);
create table public.legacy_auth_inventory_unowned (
  run_id uuid not null references public.legacy_auth_inventory_runs(id) on delete cascade,
  privy_user_id text not null,
  accounts jsonb not null check(jsonb_typeof(accounts)='array'),
  emails jsonb not null check(jsonb_typeof(emails)='array'),
  primary key(run_id,privy_user_id)
);
alter table public.legacy_auth_inventory_unowned enable row level security;
revoke all on public.legacy_auth_inventory_unowned from public,anon,authenticated;
grant select,insert on public.legacy_auth_inventory_unowned to service_role;
create table public.cognito_enrollment_permits (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  issuer text not null,subject text not null,
  provider_issuer text not null,provider_subject text not null,
  verified_email text not null,
  reserved_privy_user_id text,
  reserved_wallet_address text,
  reserved_chain_id bigint,
  expires_at timestamptz not null,
  consumed_at timestamptz
);
alter table public.legacy_auth_inventory_runs enable row level security;
alter table public.legacy_auth_inventory_owners enable row level security;
alter table public.legacy_auth_inventory_accounts enable row level security;
alter table public.cognito_enrollment_permits enable row level security;
revoke all on public.legacy_auth_inventory_runs,public.legacy_auth_inventory_owners,public.legacy_auth_inventory_accounts,public.cognito_enrollment_permits from public,anon,authenticated;
grant select,insert,update on public.legacy_auth_inventory_runs,public.legacy_auth_inventory_owners,public.legacy_auth_inventory_accounts,public.cognito_enrollment_permits to service_role;
create function public.import_cognito_legacy_inventory(p_run_id uuid,p_artifact_sha256 text,p_expected_owner_count integer,p_owners jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare owner jsonb; account jsonb;
begin
  insert into public.legacy_auth_inventory_runs(id,artifact_sha256,expected_owner_count)
    values(p_run_id,p_artifact_sha256,p_expected_owner_count) on conflict(id) do nothing;
  if not exists(select 1 from public.legacy_auth_inventory_runs where id=p_run_id and artifact_sha256=p_artifact_sha256 and expected_owner_count=p_expected_owner_count and completed_at is null)
    then raise exception 'INVALID_INVENTORY_RUN'; end if;
  if jsonb_typeof(p_owners)<>'array' or jsonb_array_length(p_owners)>1000 then raise exception 'INVALID_INVENTORY_BATCH'; end if;
  for owner in select value from jsonb_array_elements(p_owners) loop
    if not exists(select 1 from public.app_users u where u.id=(owner->>'appUserId')::uuid and u.privy_user_id=owner->>'privyUserId') then raise exception 'INVENTORY_OWNER_MISMATCH'; end if;
    insert into public.legacy_auth_inventory_owners values(p_run_id,(owner->>'appUserId')::uuid,owner->>'privyUserId') on conflict do nothing;
    for account in select value from jsonb_array_elements(owner->'accounts') loop
      insert into public.legacy_auth_inventory_accounts values(p_run_id,(owner->>'appUserId')::uuid,account->>'issuer',account->>'subject') on conflict(run_id,provider_issuer,provider_subject) do update set app_user_id=excluded.app_user_id
        where public.legacy_auth_inventory_accounts.app_user_id=excluded.app_user_id;
      if not found then raise exception 'INVENTORY_SUBJECT_CONFLICT'; end if;
    end loop;
  end loop;
end;
$$;
create function public.complete_cognito_legacy_inventory(p_run_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.legacy_auth_inventory_runs r where r.id=p_run_id and r.expected_owner_count=(select count(*) from public.legacy_auth_inventory_owners where run_id=p_run_id)
    and r.expected_privy_user_count=(select count(distinct privy_user_id) from (select privy_user_id from public.legacy_auth_inventory_owners where run_id=p_run_id union all select privy_user_id from public.legacy_auth_inventory_unowned where run_id=p_run_id) inventory where privy_user_id like 'did:privy:%'))
    or exists(select 1 from public.app_users u where u.status='active' and not exists(select 1 from public.legacy_auth_inventory_owners o where o.run_id=p_run_id and o.app_user_id=u.id))
    then raise exception 'INCOMPLETE_LEGACY_INVENTORY'; end if;
  update public.legacy_auth_inventory_runs set completed_at=now() where id=p_run_id;
end;
$$;
create function public.classify_cognito_enrollment(p_provider_issuer text,p_provider_subject text,p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid; privy_id text; latest_run uuid;
begin
  if (select count(distinct app_user_id) from public.legacy_auth_inventory_accounts where provider_issuer=p_provider_issuer and provider_subject=p_provider_subject)>1 then return jsonb_build_object('mode','blocked'); end if;
  select a.app_user_id,u.privy_user_id into owner_id,privy_id from public.legacy_auth_inventory_accounts a join public.app_users u on u.id=a.app_user_id
    where a.provider_issuer=p_provider_issuer and a.provider_subject=p_provider_subject and u.status='active' order by a.run_id limit 1;
  if owner_id is not null then
    if exists(select 1 from public.app_users u where u.verified_email=lower(trim(p_verified_email)) and u.id<>owner_id) then return jsonb_build_object('mode','blocked'); end if;
    return jsonb_build_object('mode','recovery','expectedPrivyUserId',privy_id);
  end if;
  if exists(select 1 from public.legacy_auth_inventory_unowned u where u.emails @> jsonb_build_array(lower(trim(p_verified_email)))
      or u.accounts @> jsonb_build_array(jsonb_build_object('issuer',p_provider_issuer,'subject',p_provider_subject))) then return jsonb_build_object('mode','blocked'); end if;
  if exists(select 1 from public.app_users u where u.verified_email=lower(trim(p_verified_email)))
    or exists(select 1 from public.legacy_auth_inventory_accounts a where a.provider_issuer=p_provider_issuer and a.provider_subject=p_provider_subject)
    then return jsonb_build_object('mode','blocked'); end if;
  select id into latest_run from public.legacy_auth_inventory_runs where completed_at is not null order by completed_at desc limit 1;
  if latest_run is null or exists(select 1 from public.app_users u where u.status='active'
    and not exists(select 1 from public.legacy_auth_inventory_owners o where o.run_id=latest_run and o.app_user_id=u.id)
    and not exists(select 1 from public.external_auth_identities i where i.app_user_id=u.id)
    and not exists(select 1 from public.external_auth_pending p where p.app_user_id=u.id)) then return jsonb_build_object('mode','blocked'); end if;
  return jsonb_build_object('mode','new');
end;
$$;
create function public.create_cognito_enrollment_permit(p_token_hash text,p_issuer text,p_subject text,p_provider_issuer text,p_provider_subject text,p_verified_email text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if public.classify_cognito_enrollment(p_provider_issuer,p_provider_subject,p_verified_email)->>'mode'<>'new' then raise exception 'ENROLLMENT_NOT_ALLOWED'; end if;
  insert into public.cognito_enrollment_permits(token_hash,issuer,subject,provider_issuer,provider_subject,verified_email,expires_at) values(p_token_hash,p_issuer,p_subject,p_provider_issuer,p_provider_subject,lower(trim(p_verified_email)),now()+interval '10 minutes');
end;
$$;
revoke all on function public.import_cognito_legacy_inventory(uuid,text,integer,jsonb),public.complete_cognito_legacy_inventory(uuid),public.classify_cognito_enrollment(text,text,text),public.create_cognito_enrollment_permit(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.import_cognito_legacy_inventory(uuid,text,integer,jsonb),public.complete_cognito_legacy_inventory(uuid),public.classify_cognito_enrollment(text,text,text),public.create_cognito_enrollment_permit(text,text,text,text,text,text) to service_role;
create function public.cognito_rollout_ready()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.legacy_auth_inventory_runs r where r.completed_at is not null
    and not exists(select 1 from public.app_users u where u.status='active'
      and not exists(select 1 from public.legacy_auth_inventory_owners o where o.run_id=r.id and o.app_user_id=u.id)
      and not exists(select 1 from public.external_auth_identities i where i.app_user_id=u.id)
    and not exists(select 1 from public.external_auth_pending p where p.app_user_id=u.id)));
$$;
revoke all on function public.cognito_rollout_ready() from public,anon,authenticated;
grant execute on function public.cognito_rollout_ready() to service_role;

create function public.read_cognito_pending_identity(p_issuer text,p_subject text)
returns text language sql stable security definer set search_path='' as $$
  select coalesce((select u.privy_user_id from public.external_auth_pending p join public.app_users u on u.id=p.app_user_id and u.status='active' where p.issuer=p_issuer and p.subject=p_subject),(select reserved_privy_user_id from public.cognito_enrollment_permits where issuer=p_issuer and subject=p_subject and consumed_at is null and reserved_privy_user_id is not null order by expires_at desc limit 1));
$$;
revoke all on function public.read_cognito_pending_identity(text,text) from public,anon,authenticated;
grant execute on function public.read_cognito_pending_identity(text,text) to service_role;
create function public.approved_cognito_deletion_subject(p_issuer text,p_subject text)
returns text language sql stable security definer set search_path='' as $$
  select u.privy_user_id from public.external_auth_identities i join public.app_users u on u.id=i.app_user_id
  where i.issuer=p_issuer and i.subject=p_subject and public.has_approved_account_deletion(u.privy_user_id);
$$;
create function public.cognito_cleanup_subjects(p_privy_user_id text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(distinct i.subject),'[]'::jsonb) from (select subject,app_user_id from public.external_auth_identities union all select subject,app_user_id from public.external_auth_pending) i join public.app_users u on u.id=i.app_user_id where u.privy_user_id=p_privy_user_id;
$$;
revoke all on function public.approved_cognito_deletion_subject(text,text),public.cognito_cleanup_subjects(text) from public,anon,authenticated;
grant execute on function public.approved_cognito_deletion_subject(text,text),public.cognito_cleanup_subjects(text) to service_role;

create function public.import_cognito_unowned_inventory(p_run_id uuid,p_expected_privy_user_count integer,p_users jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare user_record jsonb;
begin
  if not exists(select 1 from public.legacy_auth_inventory_runs where id=p_run_id and completed_at is null)
    or jsonb_typeof(p_users)<>'array' or jsonb_array_length(p_users)>1000 then raise exception 'INVALID_INVENTORY_RUN'; end if;
  update public.legacy_auth_inventory_runs set expected_privy_user_count=p_expected_privy_user_count
    where id=p_run_id and (expected_privy_user_count is null or expected_privy_user_count=p_expected_privy_user_count);
  if not found then raise exception 'INVALID_INVENTORY_COUNT'; end if;
  for user_record in select value from jsonb_array_elements(p_users) loop
    if user_record->>'privyUserId' not like 'did:privy:%' or jsonb_typeof(user_record->'accounts')<>'array' or jsonb_typeof(user_record->'emails')<>'array'
      or exists(select 1 from public.legacy_auth_inventory_owners where run_id=p_run_id and privy_user_id=user_record->>'privyUserId') then raise exception 'INVALID_UNOWNED_IDENTITY'; end if;
    insert into public.legacy_auth_inventory_unowned values(p_run_id,user_record->>'privyUserId',user_record->'accounts',user_record->'emails') on conflict do nothing;
  end loop;
end;
$$;
revoke all on function public.import_cognito_unowned_inventory(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.import_cognito_unowned_inventory(uuid,integer,jsonb) to service_role;

create function public.reserve_cognito_enrollment_permit(p_token_hash text,p_issuer text,p_subject text,p_privy_user_id text,p_wallet_address text,p_chain_id bigint)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.cognito_enrollment_permits set reserved_privy_user_id=p_privy_user_id,reserved_wallet_address=p_wallet_address,reserved_chain_id=p_chain_id
    where token_hash=p_token_hash and issuer=p_issuer and subject=p_subject and consumed_at is null
      and ((expires_at>now() and reserved_privy_user_id is null) or (reserved_privy_user_id=p_privy_user_id and reserved_wallet_address=p_wallet_address and reserved_chain_id=p_chain_id));
  return found;
end;
$$;
revoke all on function public.reserve_cognito_enrollment_permit(text,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.reserve_cognito_enrollment_permit(text,text,text,text,text,bigint) to service_role;
