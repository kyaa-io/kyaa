-- Translation limits move from constants in check_display_translation_budget into one service-only settings row,
-- so an operator changes them with an UPDATE instead of a migration. Signatures, the shared advisory lock and the
-- TRANSLATION_RATE_LIMITED / TRANSLATION_INVALID_INPUT codes of both reserve functions stay the same.
-- translation_limit_alerts records the first time a service day/month crosses alert_percent or is exhausted,
-- once per (kind, period, limit), so a raised limit re-arms its alerts.
create table public.translation_limits (
  singleton boolean primary key default true check (singleton),
  user_requests_per_minute integer not null check (user_requests_per_minute between 1 and 1000),
  user_daily_characters integer not null check (user_daily_characters between 1 and 10000000),
  service_daily_characters integer not null check (service_daily_characters between 1 and 100000000),
  service_monthly_characters bigint not null check (service_monthly_characters between 1 and 3000000000),
  alert_percent integer not null default 80 check (alert_percent between 1 and 99),
  updated_at timestamptz not null default clock_timestamp(),
  check (service_daily_characters <= service_monthly_characters)
);
insert into public.translation_limits(user_requests_per_minute,user_daily_characters,service_daily_characters,service_monthly_characters)
values (20,30000,300000,3000000);

create table public.translation_limit_alerts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('day_warning','month_warning','day_exhausted','month_exhausted')),
  period_start timestamptz not null,
  limit_characters bigint not null,
  used_characters bigint not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (kind,period_start,limit_characters)
);
alter table public.translation_limits enable row level security;
alter table public.translation_limit_alerts enable row level security;
revoke all on public.translation_limits,public.translation_limit_alerts from public,anon,authenticated;
grant select,update on public.translation_limits to service_role;
grant select on public.translation_limit_alerts to service_role;

create function public.touch_translation_limits()
returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at:=clock_timestamp();
  return new;
end $$;
create trigger translation_limits_touch before update on public.translation_limits
for each row execute function public.touch_translation_limits();

create or replace function public.check_display_translation_budget(p_app_user_id uuid,p_requester_hash text,p_character_count integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=clock_timestamp(); v_day timestamptz;v_month timestamptz;v_min_count bigint;v_user_chars bigint;v_day_chars bigint;v_month_chars bigint;
  v_limits public.translation_limits;
begin
  if p_app_user_id is not null then perform public.fan_web_lock_active_user(p_app_user_id); end if;
  if p_requester_hash is null or p_requester_hash !~ '^[a-f0-9]{64}$' or p_character_count is null or p_character_count not between 1 and 20000 then raise exception 'TRANSLATION_INVALID_INPUT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web:translation-budget',0));
  select * into v_limits from public.translation_limits where singleton;
  -- A missing settings row must not turn every comparison into null and lift the limits.
  if not found then raise exception 'TRANSLATION_RATE_LIMITED'; end if;
  v_now:=clock_timestamp();
  v_day:=date_trunc('day',v_now at time zone 'UTC') at time zone 'UTC';
  v_month:=date_trunc('month',v_now at time zone 'UTC') at time zone 'UTC';
  select count(*) filter(where created_at>v_now-interval '1 minute'),coalesce(sum(character_count) filter(where created_at>=v_day),0)
    into v_min_count,v_user_chars from public.display_translation_requests
    where case when p_app_user_id is null then app_user_id is null and requester_hash=p_requester_hash else app_user_id=p_app_user_id end;
  if p_app_user_id is not null then
    select v_min_count+count(*) filter(where created_at>v_now-interval '1 minute'),v_user_chars+coalesce(sum(character_count) filter(where created_at>=v_day),0)
    into v_min_count,v_user_chars from public.content_translation_requests where app_user_id=p_app_user_id;
  end if;
  select coalesce(sum(character_count) filter(where created_at>=v_day),0),coalesce(sum(character_count),0)
    into v_day_chars,v_month_chars from (
      select character_count,created_at from public.content_translation_requests where created_at>=v_month
      union all select character_count,created_at from public.display_translation_requests where created_at>=v_month
    ) requests;
  if v_min_count>=v_limits.user_requests_per_minute or v_user_chars+p_character_count>v_limits.user_daily_characters
    or v_day_chars+p_character_count>v_limits.service_daily_characters or v_month_chars+p_character_count>v_limits.service_monthly_characters then
    raise exception 'TRANSLATION_RATE_LIMITED';
  end if;
  -- The request is accepted: note the first crossing of the warning share of the service day/month.
  if (v_day_chars+p_character_count)*100>=v_limits.service_daily_characters::bigint*v_limits.alert_percent then
    insert into public.translation_limit_alerts(kind,period_start,limit_characters,used_characters)
    values('day_warning',v_day,v_limits.service_daily_characters,v_day_chars+p_character_count) on conflict do nothing;
  end if;
  if (v_month_chars+p_character_count)*100>=v_limits.service_monthly_characters*v_limits.alert_percent then
    insert into public.translation_limit_alerts(kind,period_start,limit_characters,used_characters)
    values('month_warning',v_month,v_limits.service_monthly_characters,v_month_chars+p_character_count) on conflict do nothing;
  end if;
end $$;

-- Called by the server after a reservation answered TRANSLATION_RATE_LIMITED (that transaction rolled back), so a service
-- day/month that is exhausted and now shows source text is recorded once. Per-user limits are not recorded.
create function public.record_translation_limit_block(p_character_count integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=clock_timestamp(); v_day timestamptz;v_month timestamptz;v_day_chars bigint;v_month_chars bigint;
  v_limits public.translation_limits;
begin
  if p_character_count is null or p_character_count not between 1 and 20000 then raise exception 'TRANSLATION_INVALID_INPUT'; end if;
  select * into v_limits from public.translation_limits where singleton;
  if not found then return; end if;
  v_day:=date_trunc('day',v_now at time zone 'UTC') at time zone 'UTC';
  v_month:=date_trunc('month',v_now at time zone 'UTC') at time zone 'UTC';
  if exists(select 1 from public.translation_limit_alerts where kind='month_exhausted' and period_start=v_month and limit_characters=v_limits.service_monthly_characters)
    and exists(select 1 from public.translation_limit_alerts where kind='day_exhausted' and period_start=v_day and limit_characters=v_limits.service_daily_characters) then return; end if;
  select coalesce(sum(character_count) filter(where created_at>=v_day),0),coalesce(sum(character_count),0)
    into v_day_chars,v_month_chars from (
      select character_count,created_at from public.content_translation_requests where created_at>=v_month
      union all select character_count,created_at from public.display_translation_requests where created_at>=v_month
    ) requests;
  if v_month_chars+p_character_count>v_limits.service_monthly_characters then
    insert into public.translation_limit_alerts(kind,period_start,limit_characters,used_characters)
    values('month_exhausted',v_month,v_limits.service_monthly_characters,v_month_chars) on conflict do nothing;
  end if;
  if v_day_chars+p_character_count>v_limits.service_daily_characters then
    insert into public.translation_limit_alerts(kind,period_start,limit_characters,used_characters)
    values('day_exhausted',v_day,v_limits.service_daily_characters,v_day_chars) on conflict do nothing;
  end if;
end $$;

revoke all on function public.check_display_translation_budget(uuid,text,integer),public.record_translation_limit_block(integer),public.touch_translation_limits() from public,anon,authenticated;
grant execute on function public.record_translation_limit_block(integer) to service_role;
