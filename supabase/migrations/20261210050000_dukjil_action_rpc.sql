-- PASSPORT-RENEWAL P1-6: dukjil action log, point corrections table, record_dukjil_action, read RPCs.
create table public.dukjil_action_log (
  id uuid primary key default extensions.gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  celebrity_id uuid references public.celebrities(id) on delete restrict,
  action_key text not null check (length(action_key) between 1 and 64),
  source_key text not null check (length(source_key) between 1 and 220),
  request_key uuid not null,
  points integer not null check (points >= 0),
  stamp_id uuid references public.community_stamps(id) on delete restrict,
  ledger_id uuid references public.mobile_fan_economy_ledger(id) on delete restrict,
  capped boolean not null default false,
  reason text,
  policy_version integer not null,
  kst_date date not null,
  body_hash text check (body_hash is null or body_hash ~ '^[0-9a-f]{64}$'),
  target_key text check (target_key is null or length(target_key) <= 220),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (app_user_id, action_key, source_key),
  unique (app_user_id, request_key)
);
create index dukjil_action_log_day_idx on public.dukjil_action_log(app_user_id, action_key, kst_date) where points > 0;
create index dukjil_action_log_body_idx on public.dukjil_action_log(app_user_id, action_key, body_hash, kst_date) where body_hash is not null;
create index dukjil_action_log_target_idx on public.dukjil_action_log(app_user_id, action_key, target_key) where target_key is not null;
create index dukjil_action_log_creator_idx on public.dukjil_action_log(app_user_id, celebrity_id, action_key, kst_date) where points > 0;
create table public.dukjil_point_corrections (
  id uuid primary key default extensions.gen_random_uuid(),
  action_log_id uuid not null unique references public.dukjil_action_log(id) on delete restrict,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  amount integer not null check (amount > 0),
  reason text not null,
  ledger_id uuid references public.mobile_fan_economy_ledger(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table public.dukjil_action_log enable row level security;
alter table public.dukjil_point_corrections enable row level security;
revoke all on public.dukjil_action_log, public.dukjil_point_corrections from public, anon, authenticated, service_role;
create trigger dukjil_action_log_immutable before update or delete on public.dukjil_action_log
  for each row execute function public.reject_fan_ticket_ledger_mutation();
create trigger dukjil_action_log_no_truncate before truncate on public.dukjil_action_log
  for each statement execute function public.reject_fan_ticket_ledger_mutation();
create trigger dukjil_point_corrections_immutable before update or delete on public.dukjil_point_corrections
  for each row execute function public.reject_fan_ticket_ledger_mutation();
create trigger dukjil_point_corrections_no_truncate before truncate on public.dukjil_point_corrections
  for each statement execute function public.reject_fan_ticket_ledger_mutation();

create function public.record_dukjil_action(
  p_user uuid, p_celebrity uuid, p_action_key text, p_source_key text, p_request_key uuid, p_params jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  today date := public.dukjil_kst_date();
  day_start timestamptz; day_end timestamptz; month_start date;
  pol public.dukjil_policy_versions; rule jsonb; prule jsonb; srule jsonb;
  prior public.dukjil_action_log; log_id uuid := extensions.gen_random_uuid();
  v_points integer := 0; used integer; cap_max integer; cap_per text;
  point_capped boolean := false; stamp_capped boolean := false; stamp uuid; entry uuid; msub uuid;
  skey text; skind text; cnt integer; reason text; v_body text; v_target text; params jsonb := coalesce(p_params, '{}'::jsonb);
begin
  if p_user is null or p_action_key is null or p_source_key is null or p_request_key is null
     or length(p_source_key) not between 1 and 220 then
    raise exception 'GROUP_WALLET_INVALID' using errcode = 'P0001'; end if;
  perform public.group_wallet_lock(p_user);
  select * into prior from public.dukjil_action_log
    where app_user_id = p_user and (request_key = p_request_key or (action_key = p_action_key and source_key = p_source_key));
  if found then
    if prior.request_key <> p_request_key or prior.action_key <> p_action_key or prior.source_key <> p_source_key then
      raise exception 'SOURCE_REUSED' using errcode = 'P0001'; end if;
    return jsonb_build_object('points', prior.points, 'stampId', prior.stamp_id, 'capped', prior.capped,
      'reason', prior.reason, 'replayed', true);
  end if;
  pol := public.dukjil_active_policy();
  if pol.version is null then raise exception 'POLICY_INACTIVE' using errcode = 'P0001'; end if;
  rule := pol.rules -> 'actions' -> p_action_key;
  if rule is null then raise exception 'UNKNOWN_ACTION' using errcode = 'P0001'; end if;
  if p_celebrity is not null then
    -- FIX3 item 7: a point-only action must not pay a private or archived creator either (same rejection as the stamp path).
    perform 1 from public.celebrities where id = p_celebrity and status = 'published' and archived_at is null;
    if not found then raise exception 'COMMUNITY_STAMP_NOT_FOUND' using errcode = 'P0001'; end if;
    -- FIX3 item 4: invite is a user-level action; its celebrity is only the stamp's creator record, not a passport scope.
    if p_action_key <> 'invite' then
      perform 1 from public.fan_passports where app_user_id = p_user and celebrity_id = p_celebrity;
      if not found then raise exception 'PASSPORT_REQUIRED' using errcode = 'P0001'; end if;
    end if;
  end if;
  if (rule -> 'minChars') is not null and coalesce((params ->> 'chars')::integer, 0) < (rule ->> 'minChars')::integer then
    raise exception 'DUKJIL_CONTENT_TOO_SHORT' using errcode = 'P0001'; end if;
  -- plan-v2 §3.1 verification column: same body as a recent paid one (sameBodyDays, dev draft) and repeat on the same target.
  v_body := nullif(params ->> 'bodyHash', '');
  if v_body is not null and v_body !~ '^[0-9a-f]{64}$' then raise exception 'DUKJIL_PARAMS_INVALID' using errcode = 'P0001'; end if;
  if (rule -> 'sameBodyDays') is not null and v_body is not null and exists(select 1 from public.dukjil_action_log
      where app_user_id = p_user and action_key = p_action_key and body_hash = v_body
        and kst_date > today - (rule ->> 'sameBodyDays')::integer) then
    raise exception 'DUKJIL_DUPLICATE_BODY' using errcode = 'P0001'; end if;
  if coalesce((rule ->> 'oncePerTarget')::boolean, false) then
    v_target := nullif(params ->> 'targetKey', '');
    if v_target is null and p_action_key = 'comment' and p_source_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select c.post_id::text into v_target from public.fan_post_comments c where c.id = p_source_key::uuid;
    end if;
    if v_target is not null and exists(select 1 from public.dukjil_action_log
        where app_user_id = p_user and action_key = p_action_key and target_key = v_target) then
      raise exception 'DUKJIL_REPEAT_TARGET' using errcode = 'P0001'; end if;
  end if;
  day_start := (today::timestamp at time zone 'Asia/Seoul');
  day_end := ((today + 1)::timestamp at time zone 'Asia/Seoul');
  month_start := date_trunc('month', today::timestamp)::date;

  -- points
  if (rule -> 'pointsMin') is not null then
    v_points := coalesce((params ->> 'points')::integer, 0);
    -- A mission created before activation pays the exact value shown to the member, even outside the range. New or edited
    -- out-of-range rewards are blocked at the source (group_missions trigger), so this only matches that older data.
    if (v_points < (rule ->> 'pointsMin')::integer or v_points > (rule ->> 'pointsMax')::integer)
       and not (p_action_key = 'mission' and v_points > 0 and exists(select 1 from public.group_mission_submissions ms
         join public.group_missions gm on gm.id = ms.mission_id
         where ms.id::text = p_source_key and ms.app_user_id = p_user and ms.status = 'completed' and gm.reward_points = v_points)) then
      raise exception 'DUKJIL_PARAMS_INVALID' using errcode = 'P0001'; end if;
  elsif (rule -> 'firstPoints') is not null and not exists(select 1 from public.dukjil_action_log
      where app_user_id = p_user and celebrity_id is not distinct from p_celebrity and action_key = p_action_key and points > 0) then
    v_points := (rule ->> 'firstPoints')::integer;
  else
    v_points := coalesce((rule ->> 'points')::integer, 0);
  end if;
  -- Kept legacy LIVE payout: attendance/early/first pay only the highest of live_attend and the key value, so what the
  -- old participation receipts already paid for this round is deducted here (the old path deducts live_attend in turn).
  if p_action_key = 'live_attend' and v_points > 0
     and p_source_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_points := greatest(0, v_points - coalesce((select sum(r.awarded_points) from public.live_participation_receipts r
      where r.app_user_id = p_user and r.live_event_id = p_source_key::uuid and r.mission_key in ('attendance', 'early', 'first')), 0)::integer);
  end if;
  prule := rule -> 'pointCap';
  if v_points > 0 and prule is not null and prule ->> 'per' <> 'none' then
    cap_per := prule ->> 'per'; cap_max := (prule ->> 'max')::integer;
    select count(*) into used from public.dukjil_action_log
      where app_user_id = p_user and action_key = p_action_key and points > 0
        and ((cap_per = 'user_day' and kst_date = today)
          or (cap_per = 'user_month' and kst_date >= month_start)
          or (cap_per = 'creator_month' and kst_date >= month_start and celebrity_id is not distinct from p_celebrity));
    if used >= cap_max then v_points := 0; point_capped := true; reason := 'POINT_CAP'; end if;
  end if;

  -- stamp
  srule := rule -> 'stamp';
  if srule is not null then
    skind := srule ->> 'kind';
    if skind <> 'invite' and p_celebrity is null then raise exception 'DUKJIL_CELEBRITY_REQUIRED' using errcode = 'P0001'; end if;
    cap_per := srule ->> 'capPer';
    if cap_per = 'creator_day' then
      select count(*) into cnt from public.community_stamps where app_user_id = p_user and celebrity_id = p_celebrity
        and kind = skind::public.community_stamp_kind and issued_at >= day_start and issued_at < day_end;
    elsif cap_per = 'creator_once' then
      select count(*) into cnt from public.community_stamps where app_user_id = p_user and celebrity_id = p_celebrity
        and kind = skind::public.community_stamp_kind;
    elsif cap_per = 'user_month' then
      select count(*) into cnt from public.community_stamps where app_user_id = p_user
        and kind = skind::public.community_stamp_kind and issued_at >= (month_start::timestamp at time zone 'Asia/Seoul')
        and issued_at < ((month_start + interval '1 month')::timestamp at time zone 'Asia/Seoul')
        -- the legacy invitee-side invite stamp (no policy) is not a policy invite stamp and must not use up the monthly 3
        and (skind <> 'invite' or policy_version is not null);
    elsif cap_per = 'user_once' then
      select count(*) into cnt from public.community_stamps where app_user_id = p_user
        and kind = skind::public.community_stamp_kind;
    else cnt := 0; end if;
    if cnt >= coalesce((srule ->> 'capMax')::integer, 1) then
      stamp_capped := true; reason := coalesce(reason || '+', '') || 'STAMP_CAP';
    end if;
  end if;
  if v_points = 0 and (point_capped or stamp_capped) and (srule is null or stamp_capped) then
    raise exception 'DUKJIL_DAILY_LIMIT' using errcode = 'P0001'; end if;

  if srule is not null and not stamp_capped then
    skey := case srule ->> 'keyMode'
      when 'legacyDaily' then 'daily-checkin:' || p_celebrity::text || ':' || today::text
      when 'day' then p_celebrity::text || ':' || today::text
      when 'creator' then coalesce(p_celebrity::text, 'global')
      when 'platform' then p_celebrity::text || ':' || coalesce(params ->> 'platform', 'unknown')
      else p_source_key end;
    stamp := public.dukjil_issue_stamp(p_user, p_celebrity, skind::public.community_stamp_kind, skey, pol.version);
  end if;
  if v_points > 0 then
    -- FIX3 item 6: a group mission reward is posted as the same 'group_mission' row the old approval wrote (source = the
    -- submission), and linked on the submission, so the earnings read keeps validating it.
    if p_action_key = 'mission' and p_source_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select ms.id into msub from public.group_mission_submissions ms
        where ms.id = p_source_key::uuid and ms.app_user_id = p_user and ms.status = 'completed'
          and ms.reward_points = v_points and ms.reward_ledger_id is null;
    end if;
    if msub is not null then
      entry := public.group_wallet_post(p_user, 'fan_point', v_points::bigint, 'group_mission', msub);
      update public.group_mission_submissions set reward_ledger_id = entry where id = msub and reward_ledger_id is null;
    else
      entry := public.group_wallet_post(p_user, 'fan_point', v_points::bigint,
        case when p_action_key = 'proof' then 'dukjil_proof' else 'dukjil_action' end, log_id);
    end if;
  end if;
  insert into public.dukjil_action_log(id, app_user_id, celebrity_id, action_key, source_key, request_key, points,
      stamp_id, ledger_id, capped, reason, policy_version, kst_date, body_hash, target_key)
    values (log_id, p_user, p_celebrity, p_action_key, p_source_key, p_request_key, v_points, stamp, entry,
      point_capped or stamp_capped, reason, pol.version, today, v_body, v_target);
  return jsonb_build_object('points', v_points, 'stampId', stamp, 'capped', point_capped or stamp_capped,
    'reason', reason, 'replayed', false);
end $$;

create function public.read_dukjil_catalog() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('active', true, 'version', p.version, 'effectiveFrom', p.effective_from,
    'rules', p.rules, 'missionBook', p.mission_book) from public.dukjil_active_policy() p where p.version is not null),
    jsonb_build_object('active', false))
$$;

create function public.read_dukjil_today(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare today date := public.dukjil_kst_date(); result jsonb;
begin
  if p_user is null then raise exception 'GROUP_WALLET_INVALID' using errcode = 'P0001'; end if;
  select jsonb_build_object('kstDate', today, 'actions', coalesce(jsonb_object_agg(action_key, jsonb_build_object(
    'count', n, 'points', pts)), '{}'::jsonb)) into result
  from (select action_key, count(*) n, sum(points) pts from public.dukjil_action_log
    where app_user_id = p_user and kst_date = today and points > 0 group by action_key) t;
  return result;
end $$;

revoke all on function public.record_dukjil_action(uuid, uuid, text, text, uuid, jsonb),
  public.read_dukjil_catalog(), public.read_dukjil_today(uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_dukjil_action(uuid, uuid, text, text, uuid, jsonb),
  public.read_dukjil_catalog(), public.read_dukjil_today(uuid) to service_role;
