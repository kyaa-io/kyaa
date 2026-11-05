-- PASSPORT-RENEWAL P1-5: per-creator attendance, dukjil stamp issuer, attend_creator RPC.
-- Lock order (all dukjil writers): group_wallet_lock(owner) -> (passport page slots, P3) -> stamp issue.

-- Internal issuer. issue_community_stamp cannot be reused: it rejects subscription/support, validates
-- daily_checkin keys against its own date helper and maps only four action codes. Same wallet,
-- celebrity and blockchain_jobs lane, plus idempotent reuse on a unique conflict.
create function public.dukjil_issue_stamp(
  p_user uuid, p_celebrity uuid, p_kind public.community_stamp_kind, p_source_key text, p_policy integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_recipient text; v_slug text; v_id uuid := extensions.gen_random_uuid();
  v_job uuid := extensions.gen_random_uuid(); v_op text; v_existing uuid;
begin
  if p_user is null or p_kind is null or p_source_key is null then
    raise exception 'COMMUNITY_STAMP_INVALID_REQUEST' using errcode = 'P0001'; end if;
  select id into v_existing from public.community_stamps
    where app_user_id = p_user and kind = p_kind and source_key = p_source_key;
  if v_existing is not null then return v_existing; end if;
  select wallet.address into v_recipient from public.user_wallets wallet
    where wallet.app_user_id = p_user and wallet.chain_id = 91342 and wallet.provider = 'privy'
      and wallet.wallet_type = 'embedded' for key share;
  if v_recipient is null then raise exception 'COMMUNITY_STAMP_WALLET_NOT_READY' using errcode = 'P0001'; end if;
  if p_celebrity is not null then
    select celebrity.slug into v_slug from public.celebrities celebrity
      where celebrity.id = p_celebrity and celebrity.status = 'published' and celebrity.archived_at is null for key share;
    if v_slug is null then raise exception 'COMMUNITY_STAMP_NOT_FOUND' using errcode = 'P0001'; end if;
  end if;
  v_op := 'byus:community-stamp:v1:' || v_id::text;
  insert into public.blockchain_jobs(id, entity_type, entity_id, operation_key, payload_version, payload)
    values (v_job, 'community_stamp', v_id, v_op, 1, jsonb_build_object(
      'recipient', v_recipient, 'issuanceId', '0x' || encode(extensions.digest(v_op, 'sha256'), 'hex'),
      'stampKind', p_kind::text, 'celebritySlug', v_slug));
  insert into public.community_stamps(id, app_user_id, celebrity_id, kind, source_key, blockchain_job_id, policy_version)
    values (v_id, p_user, p_celebrity, p_kind, p_source_key, v_job, p_policy);
  return v_id;
exception when unique_violation then
  select id into v_existing from public.community_stamps
    where app_user_id = p_user and kind = p_kind
      and (source_key = p_source_key
        or (p_celebrity is null and celebrity_id is null)
        or (p_celebrity is not null and celebrity_id = p_celebrity and p_kind in ('first_comment','support')))
    order by issued_at limit 1;
  if v_existing is null then raise; end if;
  return v_existing;
end $$;

create table public.group_creator_attendance (
  id uuid primary key default extensions.gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  attendance_date date not null,
  streak integer not null check (streak > 0),
  points integer not null check (points >= 0),
  stamp_id uuid references public.community_stamps(id) on delete restrict,
  ledger_id uuid references public.mobile_fan_economy_ledger(id) on delete restrict,
  request_key uuid not null,
  policy_version integer not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (app_user_id, celebrity_id, attendance_date),
  unique (app_user_id, request_key)
);
create index group_creator_attendance_streak_idx
  on public.group_creator_attendance(app_user_id, celebrity_id, attendance_date desc);
alter table public.group_creator_attendance enable row level security;
revoke all on public.group_creator_attendance from public, anon, authenticated, service_role;
create trigger group_creator_attendance_immutable before update or delete on public.group_creator_attendance
  for each row execute function public.reject_fan_ticket_ledger_mutation();
create trigger group_creator_attendance_no_truncate before truncate on public.group_creator_attendance
  for each statement execute function public.reject_fan_ticket_ledger_mutation();

create function public.attend_creator(p_user uuid, p_celebrity uuid, p_request_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  today date := public.dukjil_kst_date();
  pol public.dukjil_policy_versions;
  rule jsonb; prior public.group_creator_attendance; mine public.group_creator_attendance;
  streak_count integer; bonus integer := 0; base integer; total integer;
  att_id uuid := extensions.gen_random_uuid(); stamp uuid; entry uuid;
begin
  if p_user is null or p_celebrity is null or p_request_key is null then
    raise exception 'GROUP_WALLET_INVALID' using errcode = 'P0001'; end if;
  perform public.group_wallet_lock(p_user);
  select * into mine from public.group_creator_attendance where app_user_id = p_user and request_key = p_request_key;
  if found then
    if mine.celebrity_id <> p_celebrity then raise exception 'GROUP_WALLET_REQUEST_CONFLICT' using errcode = 'P0001'; end if;
    return jsonb_build_object('points', mine.points, 'streak', mine.streak, 'bonusPoints', 0,
      'stampId', mine.stamp_id, 'attendanceDate', mine.attendance_date, 'replayed', true);
  end if;
  pol := public.dukjil_active_policy();
  if pol.version is null then raise exception 'POLICY_INACTIVE' using errcode = 'P0001'; end if;
  perform 1 from public.fan_passports where app_user_id = p_user and celebrity_id = p_celebrity;
  if not found then raise exception 'PASSPORT_REQUIRED' using errcode = 'P0001'; end if;
  select * into mine from public.group_creator_attendance
    where app_user_id = p_user and celebrity_id = p_celebrity and attendance_date = today;
  if found then
    return jsonb_build_object('points', mine.points, 'streak', mine.streak, 'bonusPoints', 0,
      'stampId', mine.stamp_id, 'attendanceDate', mine.attendance_date, 'replayed', true);
  end if;
  rule := pol.rules -> 'actions' -> 'checkin';
  select * into prior from public.group_creator_attendance
    where app_user_id = p_user and celebrity_id = p_celebrity and attendance_date = today - 1;
  streak_count := coalesce(prior.streak, 0) + 1;
  base := (rule ->> 'points')::integer;
  if streak_count % (rule ->> 'streakEvery')::integer = 0 then bonus := (rule ->> 'streakBonus')::integer; end if;
  total := base + bonus;
  stamp := public.dukjil_issue_stamp(p_user, p_celebrity, 'daily_checkin',
    'daily-checkin:' || p_celebrity::text || ':' || today::text, pol.version);
  entry := public.group_wallet_post(p_user, 'fan_point', total, 'dukjil_action', att_id);
  insert into public.group_creator_attendance(id, app_user_id, celebrity_id, attendance_date, streak, points,
      stamp_id, ledger_id, request_key, policy_version)
    values (att_id, p_user, p_celebrity, today, streak_count, total, stamp, entry, p_request_key, pol.version);
  return jsonb_build_object('points', total, 'streak', streak_count, 'bonusPoints', bonus,
    'stampId', stamp, 'attendanceDate', today, 'replayed', false);
end $$;
revoke all on function public.dukjil_issue_stamp(uuid, uuid, public.community_stamp_kind, text, integer),
  public.attend_creator(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.attend_creator(uuid, uuid, uuid) to service_role;
