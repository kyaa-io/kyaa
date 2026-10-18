-- A short-lived browser handoff carries the original verified native session.
create table public.native_apple_reauth_handoffs (
  handoff_hash text primary key check(handoff_hash ~ '^[a-f0-9]{64}$'),
  privy_user_id text not null references public.apple_auth_owners(privy_user_id) on delete cascade,
  session_hash text not null check(session_hash ~ '^[a-f0-9]{64}$'),
  provider text not null check(provider in('apple','google')),
  provider_subject_hash text not null check(provider_subject_hash ~ '^[a-f0-9]{64}$'),
  owner_generation bigint not null check(owner_generation >= 0),
  locale text not null check(locale in('ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr')),
  return_state text not null check(return_state ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz not null default pg_catalog.clock_timestamp()+interval '2 minutes',
  consumed_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index native_apple_reauth_owner_idx on public.native_apple_reauth_handoffs(privy_user_id,created_at);
alter table public.native_apple_reauth_handoffs enable row level security;
alter table public.native_apple_reauth_handoffs force row level security;
revoke all on public.native_apple_reauth_handoffs from public,anon,authenticated,service_role;

create function public.create_native_apple_reauth_handoff(p_handoff jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare
  subject text:=p_handoff->>'privyUserId';
  owner_id uuid;
  current_generation bigint;
begin
  if subject is null or length(subject) not between 3 and 255 or subject<>btrim(subject) then
    raise exception 'NATIVE_REAUTH_INVALID' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-subject:'||encode(extensions.digest(subject,'sha256'),'hex'),0));
  if public.has_approved_account_deletion(subject) then return false; end if;
  select id into owner_id from public.app_users where privy_user_id=subject;
  if owner_id is not null then perform public.fan_web_lock_active_user(owner_id); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('apple-account-lifecycle:v1',0));
  select generation into current_generation from public.apple_auth_owners where privy_user_id=subject;
  if current_generation is null or current_generation<>(p_handoff->>'generation')::bigint then return false; end if;
  if (select count(*) from public.native_apple_reauth_handoffs
      where privy_user_id=subject and created_at>pg_catalog.clock_timestamp()-interval '10 minutes')>=5 then
    raise exception 'NATIVE_REAUTH_RATE_LIMITED' using errcode='23514';
  end if;
  delete from public.native_apple_reauth_handoffs where expires_at<pg_catalog.clock_timestamp()-interval '1 day';
  insert into public.native_apple_reauth_handoffs(
    handoff_hash,privy_user_id,session_hash,provider,provider_subject_hash,owner_generation,locale,return_state
  ) values(
    p_handoff->>'handoffHash',subject,p_handoff->>'sessionHash',p_handoff->>'provider',
    p_handoff->>'providerSubjectHash',(p_handoff->>'generation')::bigint,p_handoff->>'locale',p_handoff->>'returnState'
  );
  return true;
end $$;

create function public.consume_native_apple_reauth_handoff(p_handoff_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  h public.native_apple_reauth_handoffs%rowtype;
  owner_id uuid;
begin
  if p_handoff_hash is null or p_handoff_hash!~'^[a-f0-9]{64}$' then return null; end if;
  select * into h from public.native_apple_reauth_handoffs where handoff_hash=p_handoff_hash;
  if not found then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-subject:'||encode(extensions.digest(h.privy_user_id,'sha256'),'hex'),0));
  if public.has_approved_account_deletion(h.privy_user_id) then return null; end if;
  select id into owner_id from public.app_users where privy_user_id=h.privy_user_id;
  if owner_id is not null then perform public.fan_web_lock_active_user(owner_id); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('apple-account-lifecycle:v1',0));
  select * into h from public.native_apple_reauth_handoffs where handoff_hash=p_handoff_hash for update;
  if not found or h.consumed_at is not null or h.expires_at<=pg_catalog.clock_timestamp()
    or not exists(select 1 from public.apple_auth_owners where privy_user_id=h.privy_user_id and generation=h.owner_generation) then return null; end if;
  update public.native_apple_reauth_handoffs set consumed_at=pg_catalog.clock_timestamp() where handoff_hash=p_handoff_hash;
  return jsonb_build_object(
    'privyUserId',h.privy_user_id,'sessionHash',h.session_hash,'provider',h.provider,
    'providerSubjectHash',h.provider_subject_hash,'generation',h.owner_generation,
    'locale',h.locale,'returnState',h.return_state
  );
end $$;

revoke all on function public.create_native_apple_reauth_handoff(jsonb),public.consume_native_apple_reauth_handoff(text) from public,anon,authenticated;
grant execute on function public.create_native_apple_reauth_handoff(jsonb),public.consume_native_apple_reauth_handoff(text) to service_role;
