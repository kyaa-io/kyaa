-- Add wave categories without changing legacy payload hashes or origins.
alter table public.business_inquiries drop constraint business_inquiries_inquiry_type_check;
alter table public.business_inquiries add constraint business_inquiries_inquiry_type_check
  check (inquiry_type in ('fanmeeting','creator','partner','wave_creator','wave_partner'));

create or replace function public.submit_categorized_business_inquiry(
  p_id uuid,
  p_locale text,
  p_name text,
  p_company text,
  p_email text,
  p_message text,
  p_consent boolean,
  p_ip_hash text,
  p_payload_hash text,
  p_inquiry_type text
)
returns boolean language plpgsql security definer set search_path = pg_catalog,public as $$
declare old_hash text; old_type text;
begin
  if p_id is null or p_locale is null or p_locale not in ('ko','en') or p_consent is distinct from true
    or p_inquiry_type is null or p_inquiry_type not in ('creator','partner','wave_creator','wave_partner')
    or p_name is null or char_length(btrim(p_name)) not between 1 and 80 or p_name ~ '[[:cntrl:]]'
    or p_company is null or char_length(btrim(p_company)) not between 1 and 120 or p_company ~ '[[:cntrl:]]'
    or p_email is null or char_length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_email ~ '[[:cntrl:]]'
    or p_message is null or char_length(btrim(p_message)) not between 1 and 4000
    or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$'
  then raise exception 'INQUIRY_INVALID'; end if;

  -- This is the same shared lock and quota window as the legacy RPC.
  perform pg_advisory_xact_lock(9102026,1300);
  select payload_hash,inquiry_type into old_hash,old_type from public.business_inquiries where id=p_id;
  if found then
    if old_hash<>p_payload_hash or old_type<>p_inquiry_type then raise exception 'INQUIRY_IDEMPOTENCY_CONFLICT'; end if;
    return true;
  end if;
  if (select count(*) from public.business_inquiries where ip_hash=p_ip_hash and created_at>now()-interval '1 hour')>=3
    or (select count(*) from public.business_inquiries where created_at>now()-interval '24 hours')>=100
  then raise exception 'INQUIRY_RATE_LIMITED'; end if;
  insert into public.business_inquiries(id,locale,contact_name,company,email,message,ip_hash,payload_hash,inquiry_type)
    values(p_id,p_locale,btrim(p_name),btrim(p_company),p_email,btrim(p_message),p_ip_hash,p_payload_hash,p_inquiry_type);
  return false;
end $$;

create table public.wave_engagements (
  event text not null check(event in ('page_view','inquiry_open','inquiry_submit','inquiry_accepted')),
  request_id uuid not null,
  session_hash text not null check(session_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text not null check(ip_hash ~ '^[0-9a-f]{64}$'),
  channel text not null check(channel in ('google','bing','naver','telegram','direct','other')),
  locale text not null check(locale in ('ko','en')),
  payload_hash text check(payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key(event,request_id),
  check ((event='inquiry_accepted') = (payload_hash is not null))
);
create index wave_engagements_created_idx on public.wave_engagements(created_at);
create index wave_engagements_ip_idx on public.wave_engagements(ip_hash,created_at);
alter table public.wave_engagements enable row level security;
revoke all on public.wave_engagements from public,anon,authenticated,service_role;
grant select,insert,delete on public.wave_engagements to service_role;

create function public.maintain_wave_engagements() returns void
language sql security invoker set search_path=pg_catalog,public as $$
  delete from public.wave_engagements where created_at<now()-interval '90 days';
$$;

-- Client events cannot assert acceptance. The lock bounds both quotas atomically.
create function public.record_wave_engagement(p_event text,p_id uuid,p_session_hash text,p_ip_hash text,p_channel text,p_locale text)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare prior public.wave_engagements;
begin
  if p_event is null or p_event not in ('page_view','inquiry_open','inquiry_submit') or p_id is null
    or p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
    or p_channel is null or p_channel not in ('google','bing','naver','telegram','direct','other')
    or p_locale is null or p_locale not in ('ko','en') then raise exception 'INQUIRY_INVALID'; end if;
  perform pg_advisory_xact_lock(9102026,1301);
  select * into prior from public.wave_engagements where event=p_event and request_id=p_id;
  if found then
    if prior.session_hash<>p_session_hash or prior.channel<>p_channel or prior.locale<>p_locale then
      raise exception 'INQUIRY_IDEMPOTENCY_CONFLICT'; end if;
    return true;
  end if;
  if (select count(*) from public.wave_engagements where ip_hash=p_ip_hash and created_at>now()-interval '1 hour')>=600
    or (select count(*) from public.wave_engagements where created_at>now()-interval '24 hours')>=10000
    then raise exception 'INQUIRY_RATE_LIMITED'; end if;
  insert into public.wave_engagements(event,request_id,session_hash,ip_hash,channel,locale)
    values(p_event,p_id,p_session_hash,p_ip_hash,p_channel,p_locale);
  return false;
end $$;

-- Acceptance survives queue payload purging and is committed with the first enqueue.
create function public.submit_wave_inquiry(p_id uuid,p_locale text,p_name text,p_email text,p_message text,p_consent boolean,
  p_ip_hash text,p_payload_hash text,p_inquiry_type text,p_session_hash text,p_channel text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare replayed boolean; prior public.wave_engagements;
begin
  if p_inquiry_type is null or p_inquiry_type not in ('wave_creator','wave_partner')
    or p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_channel is null or p_channel not in ('google','bing','naver','telegram','direct','other')
    then raise exception 'INQUIRY_INVALID'; end if;
  perform pg_advisory_xact_lock(9102026,1300);
  select * into prior from public.wave_engagements where event='inquiry_accepted' and request_id=p_id;
  if found then
    if p_payload_hash is null or prior.payload_hash<>p_payload_hash or prior.session_hash<>p_session_hash
      or p_channel<>prior.channel or p_locale is distinct from prior.locale then raise exception 'INQUIRY_IDEMPOTENCY_CONFLICT'; end if;
    return true;
  end if;
  replayed := public.submit_categorized_business_inquiry(p_id,p_locale,p_name,'kyaa wave',p_email,p_message,p_consent,p_ip_hash,p_payload_hash,p_inquiry_type);
  insert into public.wave_engagements(event,request_id,session_hash,ip_hash,channel,locale,payload_hash)
    values('inquiry_accepted',p_id,p_session_hash,p_ip_hash,p_channel,p_locale,p_payload_hash);
  return replayed;
end $$;

-- Counts reflect events and anonymous sessions, never people, purchases or delivery.
create function public.wave_engagement_summary(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_days integer default 7)
returns table(channel text,event text,event_count bigint,session_count bigint)
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
  if p_days is null or p_days not in (7,30,90) then raise exception 'INQUIRY_INVALID'; end if;
  return query select e.channel,e.event,count(*),count(distinct e.session_hash)
    from public.wave_engagements e where e.created_at>=now()-make_interval(days=>p_days)
    group by e.channel,e.event order by e.channel,e.event;
end $$;

revoke all on function public.maintain_wave_engagements() from public,anon,authenticated;
revoke all on function public.record_wave_engagement(text,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.submit_wave_inquiry(uuid,text,text,text,text,boolean,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.wave_engagement_summary(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.maintain_wave_engagements(),public.record_wave_engagement(text,uuid,text,text,text,text),
  public.submit_wave_inquiry(uuid,text,text,text,text,boolean,text,text,text,text,text),public.wave_engagement_summary(uuid,uuid,integer) to service_role;
select cron.schedule('wave-engagement-retention','23 * * * *','select public.maintain_wave_engagements()');
