begin;

-- The web form owns applicant details; the app keeps only an owner-bound receipt.
create table public.mobile_event_application_links (
  code_hash text primary key check(code_hash ~ '^[0-9a-f]{64}$'),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  event_id uuid not null references public.mobile_participation_events(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '30 minutes',
  consumed_request_id uuid,
  check(expires_at>created_at)
);
create index mobile_event_application_links_owner on public.mobile_event_application_links(app_user_id,created_at);
create table public.mobile_event_applications (
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  event_id uuid not null references public.mobile_participation_events(id) on delete cascade,
  rsvp_id uuid not null unique references public.byus_day_rsvps(id) on delete cascade,
  received_at timestamptz not null default clock_timestamp(),
  primary key(app_user_id,event_id)
);
alter table public.mobile_event_application_links enable row level security;
alter table public.mobile_event_application_links force row level security;
alter table public.mobile_event_applications enable row level security;
alter table public.mobile_event_applications force row level security;
revoke all on public.mobile_event_application_links,public.mobile_event_applications from public,anon,authenticated,service_role;

create function public.create_owned_mobile_event_application_link(p_app_user_id uuid,p_event_id uuid,p_code_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.mobile_participation_events%rowtype; expiry timestamptz;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select*into e from public.mobile_participation_events where id=p_event_id and state='published' and clock_timestamp()<ends_at for share;
  if not found or e.application_url is null then raise exception 'MOBILE_PARTICIPATION_NOT_FOUND';end if;
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'MOBILE_PARTICIPATION_INVALID';end if;
  if e.event_kind<>'byus_day' or e.application_url !~ '^https://[^/?#]+/connect/(kyaa-wave|byus-day)([?#].*)?$' then
    return jsonb_build_object('applicationUrl',e.application_url,'linkSupported',false);
  end if;
  delete from public.mobile_event_application_links where app_user_id=p_app_user_id and consumed_request_id is null and expires_at<clock_timestamp();
  if (select count(*) from public.mobile_event_application_links where app_user_id=p_app_user_id and created_at>clock_timestamp()-interval '30 minutes')>=20 then
    raise exception 'MOBILE_PARTICIPATION_APPLICATION_RATE_LIMITED';
  end if;
  insert into public.mobile_event_application_links(code_hash,app_user_id,event_id)
    values(p_code_hash,p_app_user_id,p_event_id) returning expires_at into expiry;
  return jsonb_build_object('applicationUrl',e.application_url,'linkSupported',true,'expiresAt',expiry);
end$$;

create function public.submit_mobile_linked_byus_day_rsvp(
  p_application_code_hash text,p_id uuid,p_locale text,p_korean_name text,p_english_name text,p_phone_e164 text,
  p_affiliation text,p_occupation text,p_email text,p_nationality text,p_resident_registration_number_encrypted text,p_consent boolean,
  p_ip_hash text,p_payload_hash text
)returns boolean language plpgsql security definer set search_path='' as $$
declare link public.mobile_event_application_links%rowtype; owner_id uuid;
begin
  select app_user_id into owner_id from public.mobile_event_application_links where code_hash=p_application_code_hash;
  if owner_id is null then raise exception 'RSVP_APPLICATION_LINK_INVALID';end if;
  perform public.fan_web_lock_active_user(owner_id);
  select*into link from public.mobile_event_application_links where code_hash=p_application_code_hash for update;
  if not found then raise exception 'RSVP_APPLICATION_LINK_INVALID';end if;
  if link.consumed_request_id is not null then
    if link.consumed_request_id<>p_id or not exists(select 1 from public.byus_day_rsvp_idempotency where id=p_id and payload_hash=p_payload_hash) then
      raise exception 'RSVP_IDEMPOTENCY_CONFLICT';
    end if;
    return true;
  end if;
  if link.expires_at<=clock_timestamp() or not exists(select 1 from public.mobile_participation_events where id=link.event_id and state='published' and clock_timestamp()<ends_at) then
    raise exception 'RSVP_APPLICATION_LINK_INVALID';
  end if;
  perform public.submit_byus_day_rsvp(p_id,p_locale,p_korean_name,p_english_name,p_phone_e164,p_affiliation,p_occupation,p_email,p_nationality,p_resident_registration_number_encrypted,p_consent,p_ip_hash,p_payload_hash);
  -- A duplicate contact is acknowledged by the web API but never used as ownership proof.
  if exists(select 1 from public.byus_day_rsvps where id=p_id and payload_hash=p_payload_hash) then
    insert into public.mobile_event_applications(app_user_id,event_id,rsvp_id)
      values(link.app_user_id,link.event_id,p_id) on conflict do nothing;
  end if;
  update public.mobile_event_application_links set consumed_request_id=p_id where code_hash=p_application_code_hash;
  return true;
end$$;

alter function public.mobile_participation_event_json_v2(uuid,uuid,public.content_locale) rename to mobile_participation_event_json_before_web_application;
create function public.mobile_participation_event_json_v2(p_app_user_id uuid,p_event_id uuid,p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.mobile_participation_event_json_before_web_application(p_app_user_id,p_event_id,p_locale)||jsonb_build_object(
    'webApplication',case when a.rsvp_id is null then jsonb_build_object('status','not_linked')
      else jsonb_build_object('status','received','receivedAt',a.received_at)end
  )from (select 1) as singleton left join public.mobile_event_applications a on a.app_user_id=p_app_user_id and a.event_id=p_event_id
$$;

create function public.scrub_mobile_event_applications_on_account_disable()returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.status='active' and new.status='disabled' then
    delete from public.mobile_event_application_links where app_user_id=new.id;
    delete from public.mobile_event_applications where app_user_id=new.id;
  end if;
  return new;
end$$;
create trigger app_users_scrub_mobile_event_applications after update of status on public.app_users for each row execute function public.scrub_mobile_event_applications_on_account_disable();

revoke all on function public.create_owned_mobile_event_application_link(uuid,uuid,text),public.submit_mobile_linked_byus_day_rsvp(text,uuid,text,text,text,text,text,text,text,text,text,boolean,text,text),public.mobile_participation_event_json_before_web_application(uuid,uuid,public.content_locale),public.mobile_participation_event_json_v2(uuid,uuid,public.content_locale),public.scrub_mobile_event_applications_on_account_disable() from public,anon,authenticated,service_role;
grant execute on function public.create_owned_mobile_event_application_link(uuid,uuid,text),public.submit_mobile_linked_byus_day_rsvp(text,uuid,text,text,text,text,text,text,text,text,text,boolean,text,text) to service_role;
commit;
