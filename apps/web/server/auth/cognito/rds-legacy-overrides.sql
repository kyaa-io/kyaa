-- Target RDS only, after encrypted credential import and Cognito-email verification.
-- Do not apply to the source Supabase project or the phase-one legacy email backend.
-- Review each source/target object fingerprint before authorizing this drift.
alter table public.mobile_email_login_bindings drop constraint if exists mobile_email_login_bindings_supabase_user_id_fkey;

-- Supabase session tokens expire before final cutover; new Cognito sessions use their separate live gate.
create or replace function public.check_mobile_email_session(p_supabase_user_id uuid,p_session_id uuid)
returns jsonb language sql security definer set search_path='' as $$ select null::jsonb $$;

create or replace function public.check_mobile_email_provisioning(p_email text,p_supabase_user_id uuid default null,p_privy_user_id text default null)
returns boolean language sql security definer set search_path='' as $$
  select p_email=lower(btrim(p_email))
    and not exists(select 1 from public.admin_allowlist x where x.email=p_email)
    and not exists(select 1 from public.app_users x where x.verified_email=p_email and x.privy_user_id is distinct from p_privy_user_id)
    and not exists(select 1 from public.legacy_email_credentials x where lower(x.email)=p_email and x.legacy_user_id is distinct from p_supabase_user_id)
$$;

-- Keep the public wrapper's campaign-before-owner lock order.
create or replace function public.begin_owned_account_deletion_before_runmusic(p_privy_user_id text)
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
      join public.app_users u on u.id=b.app_user_id join public.legacy_email_credentials a on a.legacy_user_id=b.supabase_user_id
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
