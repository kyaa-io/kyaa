create or replace function public.verify_legacy_email_password(p_email text,p_password text)
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

drop table public.legacy_email_password_attempts;
