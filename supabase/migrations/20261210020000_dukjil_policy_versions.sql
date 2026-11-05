-- PASSPORT-RENEWAL P1-3: dukjil policy versions (rules + mission book), draft seed v1.
create table public.dukjil_policy_versions (
  version integer primary key check (version > 0),
  status text not null default 'draft' check (status in ('draft','active','retired')),
  effective_from timestamptz,
  rules jsonb not null check (jsonb_typeof(rules) = 'object'),
  mission_book jsonb not null check (jsonb_typeof(mission_book) = 'object'),
  note text,
  created_by text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  activated_at timestamptz,
  constraint dukjil_policy_active_needs_date
    check (status = 'draft' or effective_from is not null)
);
create unique index dukjil_policy_one_active on public.dukjil_policy_versions((status)) where status = 'active';
alter table public.dukjil_policy_versions enable row level security;
revoke all on public.dukjil_policy_versions from public, anon, authenticated, service_role;

create function public.dukjil_policy_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'DUKJIL_POLICY_IMMUTABLE' using errcode = 'P0001'; end if;
    return old;
  end if;
  if old.status = 'retired' then raise exception 'DUKJIL_POLICY_IMMUTABLE' using errcode = 'P0001'; end if;
  if old.status = 'active' then
    if new.status <> 'retired' or new.version <> old.version or new.rules <> old.rules
      or new.mission_book <> old.mission_book or new.effective_from is distinct from old.effective_from then
      raise exception 'DUKJIL_POLICY_IMMUTABLE' using errcode = 'P0001';
    end if;
  elsif new.version <> old.version then
    raise exception 'DUKJIL_POLICY_IMMUTABLE' using errcode = 'P0001';
  end if;
  if new.status = 'active' and old.status = 'draft' then
    new.activated_at := coalesce(new.activated_at, pg_catalog.clock_timestamp());
  end if;
  return new;
end $$;
create trigger dukjil_policy_guard before update or delete on public.dukjil_policy_versions
  for each row execute function public.dukjil_policy_guard();
create trigger dukjil_policy_no_truncate before truncate on public.dukjil_policy_versions
  for each statement execute function public.reject_fan_ticket_ledger_mutation();

create function public.dukjil_kst_date(p_at timestamptz default pg_catalog.clock_timestamp()) returns date
language sql stable set search_path = '' as $$ select (p_at at time zone 'Asia/Seoul')::date $$;

-- Active policy whose effective_from has been reached at p_at (null when none).
create function public.dukjil_active_policy(p_at timestamptz default pg_catalog.clock_timestamp())
returns public.dukjil_policy_versions language sql stable security definer set search_path = '' as $$
  select * from public.dukjil_policy_versions where status = 'active' and effective_from <= p_at
$$;
-- True once an active policy has taken over earning (used by the old-earning cutover).
create function public.dukjil_policy_replaces_earning(p_at timestamptz default pg_catalog.clock_timestamp())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.dukjil_policy_versions where status = 'active' and effective_from <= p_at)
$$;

-- Strict production activation: effective_from must be a KST midnight not earlier than the next one.
create function public.activate_dukjil_policy(p_version integer, p_effective_from timestamptz default null)
returns public.dukjil_policy_versions language plpgsql security definer set search_path = '' as $$
declare
  next_midnight timestamptz := ((public.dukjil_kst_date() + 1)::timestamp at time zone 'Asia/Seoul');
  target timestamptz;
  row public.dukjil_policy_versions;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dukjil:policy-activation', 0));
  target := coalesce(p_effective_from, next_midnight);
  if target < next_midnight or (target at time zone 'Asia/Seoul')::time <> time '00:00' then
    raise exception 'DUKJIL_EFFECTIVE_FROM_INVALID' using errcode = 'P0001';
  end if;
  select * into row from public.dukjil_policy_versions where version = p_version for update;
  if not found or row.status <> 'draft' then raise exception 'DUKJIL_POLICY_NOT_DRAFT' using errcode = 'P0001'; end if;
  -- Replacement is not supported: one active row at a time (dukjil_policy_one_active) and retiring the current row here
  -- would leave a gap until the new effective_from. Replace by the written procedure in prod-apply-ledger.md instead.
  if exists(select 1 from public.dukjil_policy_versions where status = 'active') then
    raise exception 'DUKJIL_REPLACEMENT_UNSUPPORTED' using errcode = 'P0001'; end if;
  update public.dukjil_policy_versions set status = 'active', effective_from = target
    where version = p_version returning * into row;
  return row;
end $$;
revoke all on function public.dukjil_policy_guard(), public.dukjil_kst_date(timestamptz),
  public.dukjil_active_policy(timestamptz), public.dukjil_policy_replaces_earning(timestamptz),
  public.activate_dukjil_policy(integer, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.dukjil_active_policy(timestamptz), public.dukjil_policy_replaces_earning(timestamptz),
  public.dukjil_kst_date(timestamptz) to service_role;

-- Draft v1 seed (plan §3.1 values). Not active: nothing changes until activation.
insert into public.dukjil_policy_versions(version, status, rules, mission_book, note, created_by) values (
  1, 'draft',
  $r${
    "actions": {
      "checkin": {"points": 2, "streakEvery": 7, "streakBonus": 10,
        "stamp": {"kind": "daily_checkin", "keyMode": "legacyDaily", "capPer": "creator_day", "capMax": 1}},
      "post": {"points": 20, "minChars": 20, "sameBodyDays": 7, "pointCap": {"per": "user_day", "max": 3},
        "stamp": {"kind": "post", "keyMode": "source", "capPer": "creator_day", "capMax": 1}},
      "comment": {"points": 3, "minChars": 5, "oncePerTarget": true, "pointCap": {"per": "user_day", "max": 10},
        "stamp": {"kind": "comment", "keyMode": "source", "capPer": "creator_day", "capMax": 1}},
      "reaction": {"points": 1, "pointCap": {"per": "user_day", "max": 5},
        "stamp": {"kind": "reaction", "keyMode": "source", "capPer": "creator_once", "capMax": 1}},
      "share": {"points": 10, "pointCap": {"per": "user_day", "max": 3},
        "stamp": {"kind": "share", "keyMode": "day", "capPer": "creator_day", "capMax": 1}},
      "invite": {"points": 200, "friendAction": "invite_friend", "pointCap": {"per": "user_month", "max": 5},
        "stamp": {"kind": "invite", "keyMode": "source", "capPer": "user_month", "capMax": 3}},
      "invite_friend": {"points": 100},
      "quiz": {"points": 20, "stamp": {"kind": "quiz", "keyMode": "source", "capPer": "creator_day", "capMax": 1}},
      "subscription": {"points": 30, "stamp": {"kind": "subscription", "keyMode": "platform", "capPer": "none", "capMax": 1}},
      "live_reserve": {"points": 5, "stamp": {"kind": "live_reserve", "keyMode": "source", "capPer": "none", "capMax": 1}},
      "live_attend": {"points": 20, "stamp": {"kind": "live_attend", "keyMode": "source", "capPer": "none", "capMax": 1}},
      "survey": {"points": 10, "stamp": {"kind": "survey", "keyMode": "source", "capPer": "none", "capMax": 1}},
      "mission": {"pointsMin": 50, "pointsMax": 300, "stamp": {"kind": "mission", "keyMode": "source", "capPer": "none", "capMax": 1}},
      "event_checkin": {"points": 100, "stamp": {"kind": "event_checkin", "keyMode": "source", "capPer": "none", "capMax": 1}},
      "event_review": {"points": 30, "stamp": {"kind": "event_review", "keyMode": "source", "capPer": "none", "capMax": 1}},
      "cheer": {"points": 0, "stamp": {"kind": "cheer", "keyMode": "day", "capPer": "creator_day", "capMax": 1}},
      "proof": {"points": 100, "firstPoints": 500, "pointCap": {"per": "creator_month", "max": 2},
        "stamp": {"kind": "proof", "keyMode": "source", "capPer": "none", "capMax": 1}}
    },
    "liveKept": {
      "note": "기존 LIVE 지급을 그대로 유지(사용자 결정 2026-11-05). 값·횟수 제한은 기존 live_participation_points와 크리에이터별 earning 정책 그대로이며 이 정책이 새로 정하지 않는다.",
      "liveParticipation": "live_participation_points 22개 키를 기존 금액·횟수로 계속 지급. 예약은 live_reserve 5P, 출석은 live_attend 20P가 이미 지급하므로 같은 회차에서 attendance·early·first는 합계가 max(20, 해당 키 값)이 되게 차액만 지급(dev 가안).",
      "perCreatorPolicy": ["journey_completion", "first_clip"],
      "perCreatorPolicyNote": "journey_completion·first_clip은 고정 숫자 없이 크리에이터별 earning 정책 값을 그대로 지급."
    },
    "gate": {"admission": "입국 심사", "companion": "invite", "adGate": true},
    "fraudClawback": false,
    "proofRetentionDays": 90
  }$r$::jsonb,
  $m${
    "pages": [
      {"pageNo": 1, "slots": [
        {"slot": 1, "action": "quiz"}, {"slot": 2, "action": "checkin"}, {"slot": 3, "action": "post"},
        {"slot": 4, "action": "comment"}, {"slot": 5, "action": "share"}, {"slot": 6, "action": "invite"},
        {"slot": 7, "action": "subscription"}, {"slot": 8, "action": "steady_checkin", "days": 3},
        {"slot": 9, "action": "proof", "required": true}
      ]}
    ],
    "overflow": "next_page"
  }$m$::jsonb,
  'D4 확정(사용자 결정): 6번 칸은 친구 추천 1명 필수, 공유 2회 대체 없음. 초대 도장은 plan-v2대로 1명당 1개, 월 3개(D4는 도장 상한을 좁히지 않음). 기존 LIVE 지급은 사용자 결정으로 유지(rules.liveKept). dev 가안, 운영 전 결정 필요: D3 입국 심사, D7 광고 게이트 유지, D9 fraudClawback false, D10-1, D11 증빙 보관 90일, D15 오픈 부스트 하지 않음(시드에서 제거). 최근 글 같은 본문 제외 범위 sameBodyDays=7은 dev 가안. D8·D12 행 없음.',
  'dev-seed'
);
