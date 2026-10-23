-- Copy legacy auth credential state through a private operator export; never expose hashes to the app role.
do $$ begin if not exists(select 1 from pg_roles where rolname='legacy_auth_migrator') then create role legacy_auth_migrator nologin; end if; end $$;
create table public.legacy_email_credentials (
  legacy_user_id uuid primary key,
  app_user_id uuid references public.app_users(id) on delete set null,
  email text not null unique check(email=lower(trim(email))),
  encrypted_password text not null,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz,
  enabled boolean not null default false,
  imported_at timestamptz not null default now()
);
alter table public.legacy_email_credentials enable row level security;
revoke all on public.legacy_email_credentials from public,anon,authenticated,service_role,legacy_auth_migrator;
create function public.verify_legacy_email_password(p_email text,p_password text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare credential public.legacy_email_credentials; result jsonb;
begin
  if p_email is null or p_password is null or length(p_email)>254 or octet_length(p_password) not between 1 and 4096 then return null; end if;
  select c.* into credential from public.legacy_email_credentials c join public.app_users u on u.id=c.app_user_id
    where c.email=lower(trim(p_email)) and c.enabled and c.email_confirmed_at is not null and c.deleted_at is null
      and (c.banned_until is null or c.banned_until<=now()) and u.status='active' and u.verified_email=c.email
      and not exists(select 1 from public.admin_allowlist a where a.email=c.email)
      and not exists(select 1 from public.apple_lifecycle_subjects a where a.privy_user_id=u.privy_user_id and a.credential_state in('revoked','deleted'));
  if credential.legacy_user_id is null or credential.encrypted_password !~ '^\$2[aby]\$' then return null; end if;
  if extensions.crypt(p_password,credential.encrypted_password)<>credential.encrypted_password then return null; end if;
  return jsonb_build_object('legacyUserId',credential.legacy_user_id,'appUserId',credential.app_user_id,'email',credential.email);
end;
$$;
revoke all on function public.verify_legacy_email_password(text,text) from public,anon,authenticated,service_role;
grant execute on function public.verify_legacy_email_password(text,text) to legacy_auth_migrator;
grant usage on schema public to legacy_auth_migrator;

create table public.cognito_email_identities (
  legacy_user_id uuid primary key references public.legacy_email_credentials(legacy_user_id),
  issuer text not null,subject text not null,
  unique(issuer,subject),created_at timestamptz not null default now()
);
alter table public.cognito_email_identities enable row level security;
revoke all on public.cognito_email_identities from public,anon,authenticated;
grant select on public.cognito_email_identities to service_role;
create function public.resolve_cognito_email_owner(p_legacy_user_id uuid,p_issuer text,p_subject text,p_verified_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid; did text;
begin
  select u.id,u.privy_user_id into owner_id,did from public.legacy_email_credentials c join public.app_users u on u.id=c.app_user_id
    where c.legacy_user_id=p_legacy_user_id and c.email=lower(trim(p_verified_email)) and c.enabled
      and c.email_confirmed_at is not null and c.deleted_at is null and (c.banned_until is null or c.banned_until<=now())
      and u.status='active' and u.verified_email=c.email
      and not exists(select 1 from public.admin_allowlist a where a.email=c.email)
      and not exists(select 1 from public.apple_lifecycle_subjects a where a.privy_user_id=u.privy_user_id and a.credential_state in('revoked','deleted'));
  if owner_id is null or p_issuer !~ '^https://cognito-idp\.[a-z0-9-]+\.amazonaws\.com/[a-zA-Z0-9_-]+$' or length(p_subject) not between 1 and 256 then return null; end if;
  insert into public.cognito_email_identities(legacy_user_id,issuer,subject) values(p_legacy_user_id,p_issuer,p_subject) on conflict(legacy_user_id) do nothing;
  if not exists(select 1 from public.cognito_email_identities where legacy_user_id=p_legacy_user_id and issuer=p_issuer and subject=p_subject) then return null; end if;
  return jsonb_build_object('appUserId',owner_id,'privyUserId',did);
end;
$$;
create table public.cognito_email_sessions (
  id uuid primary key,
  legacy_user_id uuid not null,
  encrypted_session text not null,
  refresh_hash text not null unique check(refresh_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  refresh_expires_at timestamptz not null default now()+interval '24 hours',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.cognito_email_sessions enable row level security;
revoke all on public.cognito_email_sessions from public,anon,authenticated;
grant select,insert,update on public.cognito_email_sessions to service_role;
create function public.read_cognito_email_session(p_session_id uuid,p_refresh_hash text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('sessionId',id,'legacyUserId',legacy_user_id,'encryptedSession',encrypted_session)
  from public.cognito_email_sessions where revoked_at is null and
    ((p_session_id is not null and id=p_session_id and expires_at>now())
      or (p_session_id is null and refresh_hash=p_refresh_hash and refresh_expires_at>now()));
$$;
create function public.write_cognito_email_session(p_session_id uuid,p_legacy_user_id uuid,p_encrypted_session text,p_refresh_hash text,p_expires_at timestamptz,p_previous_refresh_hash text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_previous_refresh_hash is not null then
    update public.cognito_email_sessions set revoked_at=now() where refresh_hash=p_previous_refresh_hash and legacy_user_id=p_legacy_user_id and revoked_at is null and refresh_expires_at>now();
    if not found then raise exception 'INVALID_EMAIL_REFRESH'; end if;
  end if;
  insert into public.cognito_email_sessions(id,legacy_user_id,encrypted_session,refresh_hash,expires_at) values(p_session_id,p_legacy_user_id,p_encrypted_session,p_refresh_hash,p_expires_at);
end;
$$;
create function public.revoke_cognito_email_session(p_session_id uuid)
returns void language sql security definer set search_path='' as $$
  update public.cognito_email_sessions set revoked_at=now() where id=p_session_id;
$$;
create function public.cognito_email_cleanup_subject(p_legacy_user_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select subject from public.cognito_email_identities where legacy_user_id=p_legacy_user_id;
$$;
create function public.disable_legacy_email_credential(p_legacy_user_id uuid)
returns void language sql security definer set search_path='' as $$
  update public.legacy_email_credentials set enabled=false,deleted_at=coalesce(deleted_at,now()),encrypted_password='' where legacy_user_id=p_legacy_user_id;
$$;
revoke all on function public.resolve_cognito_email_owner(uuid,text,text,text),public.read_cognito_email_session(uuid,text),public.write_cognito_email_session(uuid,uuid,text,text,timestamptz,text),public.revoke_cognito_email_session(uuid),public.cognito_email_cleanup_subject(uuid),public.disable_legacy_email_credential(uuid) from public,anon,authenticated;
grant execute on function public.resolve_cognito_email_owner(uuid,text,text,text),public.read_cognito_email_session(uuid,text),public.write_cognito_email_session(uuid,uuid,text,text,timestamptz,text),public.revoke_cognito_email_session(uuid),public.cognito_email_cleanup_subject(uuid),public.disable_legacy_email_credential(uuid) to service_role;
