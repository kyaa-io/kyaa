-- Explicit operator-only bindings; Supabase email is never an automatic identity key.
create table public.mobile_email_login_bindings (
  supabase_user_id uuid primary key references auth.users(id) on delete cascade,
  app_user_id uuid not null unique references public.app_users(id) on delete restrict,
  enabled boolean not null default false,
  created_at timestamptz not null default pg_catalog.now()
);
alter table public.mobile_email_login_bindings enable row level security;
revoke all on public.mobile_email_login_bindings from public,anon,authenticated;
grant select,insert,update,delete on public.mobile_email_login_bindings to service_role;

create function public.check_mobile_email_session(p_supabase_user_id uuid,p_session_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('appUserId',u.id,'privyUserId',u.privy_user_id)
  from public.mobile_email_login_bindings b
  join public.app_users u on u.id=b.app_user_id
  join auth.users a on a.id=b.supabase_user_id
  join auth.sessions s on s.user_id=a.id and s.id=p_session_id
  where b.supabase_user_id=p_supabase_user_id and b.enabled and u.status='active'
    and a.email_confirmed_at is not null and a.deleted_at is null
    and (a.banned_until is null or a.banned_until<=pg_catalog.now())
    and lower(a.email)=u.verified_email and u.privy_user_id like 'did:privy:%'
    and (s.not_after is null or s.not_after>pg_catalog.now())
    and not exists(select 1 from public.admin_allowlist x where x.email=u.verified_email)
    and not exists(select 1 from public.apple_lifecycle_subjects x
      where x.privy_user_id=u.privy_user_id and x.credential_state in('revoked','deleted'))
$$;

-- Operator preflight checks provider-only Supabase identities as well as app owners.
create function public.check_mobile_email_provisioning(p_email text,p_supabase_user_id uuid default null,p_privy_user_id text default null)
returns boolean language sql security definer set search_path='' as $$
  select p_email=lower(btrim(p_email))
    and not exists(select 1 from public.admin_allowlist x where x.email=p_email)
    and not exists(select 1 from public.app_users x where x.verified_email=p_email and x.privy_user_id is distinct from p_privy_user_id)
    and not exists(select 1 from auth.users x where lower(x.email)=p_email and x.id is distinct from p_supabase_user_id)
$$;
revoke all on function public.check_mobile_email_provisioning(text,uuid,text) from public,anon,authenticated;
grant execute on function public.check_mobile_email_provisioning(text,uuid,text) to service_role;

-- Snapshots deliberately have no auth.users FK: provider removal must not block or
-- erase the remaining provider's durable cleanup retry.
alter table public.account_deletion_requests
  add column supabase_user_id uuid,
  add column privy_provider_subject text,
  add column supabase_deleted boolean not null default false,
  add column privy_deleted boolean not null default false;

alter function public.begin_owned_account_deletion(text) rename to begin_privy_account_deletion;
create function public.begin_owned_account_deletion(p_privy_user_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare subject text:=p_privy_user_id; email_id uuid; owner_id uuid; result jsonb; v_subject_hash text;
begin
  if subject like 'supabase-email:%' then
    v_subject_hash:=encode(extensions.digest(subject,'sha256'),'hex');
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-subject:'||v_subject_hash,0));
    select jsonb_build_object('appUserId',d.app_user_id,'status',d.status) into result
      from public.account_subject_tombstones t join public.account_deletion_requests d on d.app_user_id=t.app_user_id
      where t.subject_hash=v_subject_hash;
    if result is not null then return result; end if;
    email_id:=substring(subject from 16)::uuid;
    select u.privy_user_id,u.id into subject,owner_id from public.mobile_email_login_bindings b
      join public.app_users u on u.id=b.app_user_id join auth.users a on a.id=b.supabase_user_id
      where b.supabase_user_id=email_id and b.enabled and u.status='active' and a.email_confirmed_at is not null
        and a.deleted_at is null and (a.banned_until is null or a.banned_until<=pg_catalog.now())
        and lower(a.email)=u.verified_email
        and not exists(select 1 from public.admin_allowlist x where x.email=u.verified_email)
        and not exists(select 1 from public.apple_lifecycle_subjects x where x.privy_user_id=u.privy_user_id and x.credential_state in('revoked','deleted'));
    if subject is null then raise exception 'ACCOUNT_DELETION_UNAVAILABLE' using errcode='42501'; end if;
  end if;
  result:=public.begin_privy_account_deletion(subject);
  owner_id:=(result->>'appUserId')::uuid;
  -- Snapshot for deletion started from either login provider, before any cleanup.
  select b.supabase_user_id into email_id from public.mobile_email_login_bindings b where b.app_user_id=owner_id;
  update public.account_deletion_requests set supabase_user_id=coalesce(supabase_user_id,email_id),
    privy_provider_subject=coalesce(privy_provider_subject,provider_subject) where app_user_id=owner_id;
  if email_id is not null then
    insert into public.account_subject_tombstones(subject_hash,app_user_id)
      values(encode(extensions.digest('supabase-email:'||email_id::text,'sha256'),'hex'),owner_id) on conflict do nothing;
    update public.mobile_email_login_bindings set enabled=false where app_user_id=owner_id;
  end if;
  return result;
end $$;

create function public.has_approved_email_account_deletion(p_supabase_user_id uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from public.account_subject_tombstones t
    join public.account_deletion_requests d on d.app_user_id=t.app_user_id
    where t.subject_hash=encode(extensions.digest('supabase-email:'||p_supabase_user_id::text,'sha256'),'hex')
      and d.status in('pending','completed'))
$$;

create function public.mobile_get_email_account_deletion_status(p_supabase_user_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce((select jsonb_build_object('status',d.status,'requestedAt',d.created_at,
    'completedAt',d.completed_at,'lastErrorCode',d.last_error_code)
    from public.account_subject_tombstones t join public.account_deletion_requests d on d.app_user_id=t.app_user_id
    where t.subject_hash=encode(extensions.digest('supabase-email:'||p_supabase_user_id::text,'sha256'),'hex')),
    jsonb_build_object('status','none'))
$$;
revoke all on function public.mobile_get_email_account_deletion_status(uuid) from public,anon,authenticated;
grant execute on function public.mobile_get_email_account_deletion_status(uuid) to service_role;

alter function public.claim_account_deletion(uuid) rename to claim_privy_account_deletion;
create function public.claim_account_deletion(p_app_user_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result:=public.claim_privy_account_deletion(p_app_user_id);
  if result is null then return null; end if;
  return result||(select jsonb_build_object('providerSubject',coalesce(d.privy_provider_subject,d.provider_subject),
    'supabaseUserId',d.supabase_user_id,'privyDeleted',d.privy_deleted,'supabaseDeleted',d.supabase_deleted)
    from public.account_deletion_requests d where d.app_user_id=(result->>'appUserId')::uuid);
end $$;

create function public.finish_account_deletion_provider(p_app_user_id uuid,p_lease_token uuid,p_provider text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_provider not in('privy','supabase') then raise exception 'INVALID_PROVIDER'; end if;
  update public.account_deletion_requests set privy_deleted=privy_deleted or p_provider='privy',
    supabase_deleted=supabase_deleted or p_provider='supabase'
    where app_user_id=p_app_user_id and lease_token=p_lease_token and lease_until>pg_catalog.now() and status='pending';
  if not found then raise exception 'ACCOUNT_DELETION_LEASE_LOST'; end if;
end $$;

alter function public.complete_account_deletion(uuid,uuid) rename to complete_privy_account_deletion;
create function public.complete_account_deletion(p_app_user_id uuid,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare completed boolean;
begin
  if exists(select 1 from public.account_deletion_requests where app_user_id=p_app_user_id
    and supabase_user_id is not null and (not supabase_deleted or not privy_deleted)) then return false; end if;
  completed:=public.complete_privy_account_deletion(p_app_user_id,p_lease_token);
  if completed then
    update public.account_deletion_requests set supabase_user_id=null,privy_provider_subject=null where app_user_id=p_app_user_id;
  end if;
  return completed;
end $$;

revoke all on function public.check_mobile_email_session(uuid,uuid),
  public.begin_owned_account_deletion(text),public.begin_privy_account_deletion(text),
  public.has_approved_email_account_deletion(uuid),public.claim_account_deletion(uuid),public.claim_privy_account_deletion(uuid),
  public.finish_account_deletion_provider(uuid,uuid,text),public.complete_account_deletion(uuid,uuid),public.complete_privy_account_deletion(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.check_mobile_email_session(uuid,uuid),public.begin_owned_account_deletion(text),
  public.has_approved_email_account_deletion(uuid),public.claim_account_deletion(uuid),
  public.finish_account_deletion_provider(uuid,uuid,text),public.complete_account_deletion(uuid,uuid) to service_role;
-- Internal legacy implementations may only be reached through the wrappers.
revoke all on function public.begin_privy_account_deletion(text),public.claim_privy_account_deletion(uuid),public.complete_privy_account_deletion(uuid,uuid) from service_role;
