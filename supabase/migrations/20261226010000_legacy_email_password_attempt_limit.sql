create table public.legacy_email_password_attempts (
  email_sha256 text primary key check(email_sha256 ~ '^[a-f0-9]{64}$'),
  failure_count integer not null check(failure_count between 1 and 5),
  window_started_at timestamptz not null,
  locked_until timestamptz
);
create index legacy_email_password_attempts_window_idx on public.legacy_email_password_attempts(window_started_at);
alter table public.legacy_email_password_attempts enable row level security;
revoke all on public.legacy_email_password_attempts from public,anon,authenticated,service_role,legacy_auth_migrator;

create or replace function public.verify_legacy_email_password(p_email text,p_password text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare credential public.legacy_email_credentials; result jsonb;
  email_hash text; attempt public.legacy_email_password_attempts; checked_at timestamptz;
  -- Fixed cost 10 dummy work; imported hashes with other costs retain their original cost.
  dummy_hash constant text := '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  valid_password boolean;
begin
  if p_email is null or p_password is null or length(p_email)>254 or octet_length(p_password) not between 1 and 4096 then return null; end if;
  email_hash := encode(extensions.digest(lower(trim(p_email)), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(email_hash, 26010000));
  checked_at := clock_timestamp();
  delete from public.legacy_email_password_attempts where email_sha256 in (
    select email_sha256 from public.legacy_email_password_attempts
    where window_started_at < checked_at - interval '1 day'
      and (locked_until is null or locked_until <= checked_at)
    order by window_started_at limit 20 for update skip locked
  );
  select * into attempt from public.legacy_email_password_attempts where email_sha256=email_hash for update;
  if attempt.locked_until > checked_at then return null; end if;
  select c.* into credential from public.legacy_email_credentials c join public.app_users u on u.id=c.app_user_id
    where c.email=lower(trim(p_email)) and c.enabled and c.email_confirmed_at is not null and c.deleted_at is null
      and (c.banned_until is null or c.banned_until<=now()) and u.status='active' and u.verified_email=c.email
      and not exists(select 1 from public.admin_allowlist a where a.email=c.email)
      and not exists(select 1 from public.apple_lifecycle_subjects a where a.privy_user_id=u.privy_user_id and a.credential_state in('revoked','deleted'));
  if credential.legacy_user_id is null or credential.encrypted_password !~ '^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$' then
    perform extensions.crypt(p_password,dummy_hash);
    valid_password := false;
  else
    valid_password := extensions.crypt(p_password,credential.encrypted_password)=credential.encrypted_password;
  end if;
  if not valid_password then
    if attempt.email_sha256 is null or attempt.window_started_at <= checked_at - interval '15 minutes' then
      attempt.failure_count := 0;
      attempt.window_started_at := checked_at;
    end if;
    insert into public.legacy_email_password_attempts(email_sha256,failure_count,window_started_at,locked_until)
      values(email_hash,attempt.failure_count+1,attempt.window_started_at,
        case when attempt.failure_count+1 >= 5 then checked_at+interval '15 minutes' end)
      on conflict(email_sha256) do update set failure_count=excluded.failure_count,
        window_started_at=excluded.window_started_at,locked_until=excluded.locked_until;
    return null;
  end if;
  delete from public.legacy_email_password_attempts where email_sha256=email_hash;
  return jsonb_build_object('legacyUserId',credential.legacy_user_id,'appUserId',credential.app_user_id,'email',credential.email);
end;
$$;
revoke all on function public.verify_legacy_email_password(text,text) from public,anon,authenticated,service_role;
grant execute on function public.verify_legacy_email_password(text,text) to legacy_auth_migrator;
