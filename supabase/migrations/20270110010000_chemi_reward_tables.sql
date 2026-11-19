-- 케미 탭 M1 (W1-DB) · 보상·성장 표. 함수는 W1-REWARD(20270111010000)·W5 가 낸다. 설계 arch-chemi r3 §2.2.
-- 새 객체만, 시드 0. celebrities 는 FK 를 걸지 않는다(기존 표의 삭제 동작을 바꾸지 않기 위해).

-- 3P 는 최애별 하루 1번(P1). pending_wallet = 지갑 닫힘 또는 §0 A 출처 미승인.
create table public.chemi_point_grants (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  character text not null check (character in ('changha','elina','yuna','dosa')),
  celebrity_id uuid,
  kst_date date not null,
  status text not null check (status in ('granted','pending_passport','pending_wallet','skipped')),
  points integer not null default 0 check (points >= 0),
  ledger_id uuid,
  reading_id uuid references public.chemi_readings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, character, kst_date),
  check ((status = 'granted') = (ledger_id is not null)),
  check (status = 'granted' or points = 0)
);

-- 스탬프 1개 = 계정마다 하루 1번(04-0b 03).
create table public.chemi_day_stamps (
  user_id uuid not null references public.app_users(id) on delete cascade,
  kst_date date not null,
  first_content text not null check (first_content in ('saju','fortune','star','tarot')),
  created_at timestamptz not null default now(),
  primary key (user_id, kst_date)
);

-- 친밀 EXP. 도사는 EXP 가 없다(§10.1 1). 같은 source 하루 최애 3명까지는 함수가 잠금 뒤 센다.
create table public.chemi_exp_log (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  character text not null check (character in ('changha','elina','yuna')),
  source text not null check (source in ('feed','fortune','star','tarot','saju','run','match','share')),
  kst_date date not null,
  exp integer not null check (exp > 0),
  created_at timestamptz not null default now(),
  unique (user_id, character, source, kst_date)
);
create index chemi_exp_log_user_source_day_idx on public.chemi_exp_log (user_id, source, kst_date);
create index chemi_exp_log_user_day_idx on public.chemi_exp_log (user_id, kst_date);

create table public.chemi_minis (
  user_id uuid not null references public.app_users(id) on delete cascade,
  character text not null check (character in ('changha','elina','yuna')),
  exp_total bigint not null default 0 check (exp_total >= 0),
  adopted_at timestamptz not null default now(),
  meters jsonb not null default '{}'::jsonb check (jsonb_typeof(meters) = 'object'),
  meters_at timestamptz,
  primary key (user_id, character)
);

-- 이번 주 5/7. 무료 질문 묶음은 이 줄을 새로 만든 호출에서만 만든다(§5.2a).
create table public.chemi_week_boxes (
  user_id uuid not null references public.app_users(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  achieved_at timestamptz not null,
  opened_at timestamptz,
  item_code text check (char_length(item_code) between 1 and 40),
  pass_lot_id uuid,
  primary key (user_id, week_start)
);

create table public.chemi_items (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  item_code text not null check (char_length(item_code) between 1 and 40),
  acquired_at timestamptz not null default now(),
  unique (user_id, item_code)
);

create table public.chemi_rooms (
  user_id uuid not null references public.app_users(id) on delete cascade,
  character text not null check (character in ('changha','elina','yuna')),
  layout jsonb not null default '{}'::jsonb check (jsonb_typeof(layout) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, character)
);

-- 앨범 6칸(입양·Lv5·Lv10·Lv15·Lv20·Lv30, 11-9 03).
create table public.chemi_album (
  user_id uuid not null references public.app_users(id) on delete cascade,
  character text not null check (character in ('changha','elina','yuna')),
  slot smallint not null check (slot between 1 and 6),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, character, slot)
);

create table public.chemi_titles (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  title_code text not null check (char_length(title_code) between 1 and 40),
  acquired_at timestamptz not null default now(),
  equipped boolean not null default false,
  unique (user_id, title_code)
);
create unique index chemi_titles_one_equipped on public.chemi_titles (user_id) where equipped;

create table public.chemi_snacks (
  id uuid primary key default extensions.gen_random_uuid(),
  giver_id uuid not null references public.app_users(id) on delete cascade,
  receiver_id uuid not null references public.app_users(id) on delete cascade,
  character text not null check (character in ('changha','elina','yuna')),
  kst_date date not null,
  created_at timestamptz not null default now(),
  unique (giver_id, receiver_id, kst_date),
  check (giver_id <> receiver_id)
);
create index chemi_snacks_receiver_idx on public.chemi_snacks (receiver_id, kst_date);

-- 주 첫 공유 +1 / 최애별 하루 친밀 +5 / 같은 결과 1번(P-15 I3).
create table public.chemi_share_rewards (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null check (kind in ('week_pass','day_exp','result_once')),
  key text not null check (char_length(key) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (user_id, kind, key)
);

alter table public.chemi_point_grants enable row level security;
alter table public.chemi_day_stamps enable row level security;
alter table public.chemi_exp_log enable row level security;
alter table public.chemi_minis enable row level security;
alter table public.chemi_week_boxes enable row level security;
alter table public.chemi_items enable row level security;
alter table public.chemi_rooms enable row level security;
alter table public.chemi_album enable row level security;
alter table public.chemi_titles enable row level security;
alter table public.chemi_snacks enable row level security;
alter table public.chemi_share_rewards enable row level security;
revoke all on public.chemi_point_grants, public.chemi_day_stamps, public.chemi_exp_log, public.chemi_minis,
  public.chemi_week_boxes, public.chemi_items, public.chemi_rooms, public.chemi_album, public.chemi_titles,
  public.chemi_snacks, public.chemi_share_rewards
  from public, anon, authenticated, service_role;
