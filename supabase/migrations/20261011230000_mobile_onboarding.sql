-- Account passports are separate from an artist's verified fan passport.
create table public.account_passports (
  id uuid primary key default extensions.gen_random_uuid(),
  app_user_id uuid not null unique references public.app_users(id) on delete cascade,
  issued_at timestamptz not null default pg_catalog.clock_timestamp(),
  policy_version text not null,
  terms_accepted_at timestamptz not null default pg_catalog.clock_timestamp(),
  privacy_accepted_at timestamptz not null default pg_catalog.clock_timestamp(),
  request_id uuid not null,
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$')
);
alter table public.account_passports enable row level security;
alter table public.account_passports force row level security;
revoke all on public.account_passports from public,anon,authenticated,service_role;

create function public.get_owned_account_onboarding(p_app_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare passport jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select jsonb_build_object('id',p.id,'issuedAt',p.issued_at) into passport
    from public.account_passports p where p.app_user_id=p_app_user_id;
  return jsonb_build_object('profile',public.get_owned_user_profile(p_app_user_id),
    'policyVersion','2026-10-11','passport',passport);
end $$;

create function public.complete_owned_account_onboarding(
  p_app_user_id uuid,p_request_id uuid,p_nickname text,
  p_terms_accepted boolean,p_privacy_accepted boolean,p_policy_version text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  existing public.account_passports%rowtype;
  payload_hash text;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_request_id is null then raise exception 'ONBOARDING_REQUEST_INVALID' using errcode='22023'; end if;
  if p_terms_accepted is distinct from true or p_privacy_accepted is distinct from true then
    raise exception 'ONBOARDING_CONSENT_REQUIRED' using errcode='22023';
  end if;
  if p_policy_version is distinct from '2026-10-11' then
    raise exception 'ONBOARDING_POLICY_CHANGED' using errcode='22023';
  end if;
  payload_hash:=encode(extensions.digest(jsonb_build_object(
    'nickname',btrim(normalize(p_nickname,NFKC)), 'policyVersion',p_policy_version,
    'termsAccepted',p_terms_accepted,'privacyAccepted',p_privacy_accepted
  )::text,'sha256'),'hex');
  select * into existing from public.account_passports where app_user_id=p_app_user_id;
  if found then
    if existing.request_id=p_request_id and existing.payload_hash<>payload_hash then
      raise exception 'ONBOARDING_REQUEST_CONFLICT' using errcode='23514';
    end if;
    if existing.payload_hash=payload_hash then return public.get_owned_account_onboarding(p_app_user_id); end if;
    raise exception 'FAN005_PROFILE_ALREADY_COMPLETED' using errcode='23514';
  end if;
  perform public.set_owned_user_nickname(p_app_user_id,p_nickname);
  insert into public.account_passports(app_user_id,policy_version,request_id,payload_hash)
    values(p_app_user_id,p_policy_version,p_request_id,payload_hash);
  return public.get_owned_account_onboarding(p_app_user_id);
end $$;

create function public.read_owned_nickname_availability(p_app_user_id uuid,p_nickname text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  nickname text:=btrim(normalize(p_nickname,NFKC));
  normalized text;
  prohibited_candidate text;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  normalized:=lower(nickname collate public.nickname_unicode);
  if nickname is null or not public.nickname_is_db_safe(nickname) or not public.nickname_is_db_safe(normalized) then
    return jsonb_build_object('available',false,'reason','invalid');
  end if;
  prohibited_candidate:=regexp_replace(normalized collate public.nickname_unicode,'[^[:alnum:]]','','g');
  if exists(select 1 from public.prohibited_nickname_catalog c where c.catalog_version='fan-nickname-v1' and c.active
    and ((c.match_mode='exact' and (normalized=c.value_normalized or prohibited_candidate=c.value_normalized))
      or (c.match_mode='contains' and (strpos(normalized,c.value_normalized)>0 or strpos(prohibited_candidate,c.value_normalized)>0)))) then
    return jsonb_build_object('available',false,'reason','prohibited');
  end if;
  if exists(select 1 from public.user_profiles where nickname_normalized=normalized and app_user_id<>p_app_user_id) then
    return jsonb_build_object('available',false,'reason','taken');
  end if;
  return jsonb_build_object('available',true,'reason',null);
end $$;

create function public.erase_disabled_account_passport() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='disabled' then delete from public.account_passports where app_user_id=new.id; end if;
  return new;
end $$;
create trigger erase_disabled_account_passport after update of status on public.app_users
  for each row execute function public.erase_disabled_account_passport();

revoke all on function public.get_owned_account_onboarding(uuid),
  public.complete_owned_account_onboarding(uuid,uuid,text,boolean,boolean,text),
  public.read_owned_nickname_availability(uuid,text),public.erase_disabled_account_passport() from public,anon,authenticated;
grant execute on function public.get_owned_account_onboarding(uuid),
  public.complete_owned_account_onboarding(uuid,uuid,text,boolean,boolean,text),
  public.read_owned_nickname_availability(uuid,text) to service_role;
