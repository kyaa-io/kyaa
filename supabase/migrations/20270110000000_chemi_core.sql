-- 케미 탭 M1 (W1-DB) · 핵심·프로필 표. 설계 arch-chemi r3 §2.2.
-- 전부 새 객체, 기존 객체 변경 0, 시드 0. RLS 켬·정책 없음: 접근은 security definer 함수로만.
-- app_users FK 는 잘못된 사용자 번호를 막는 용도다. 탈퇴는 app_users 줄을 지우지 않으므로(§0 D)
-- cascade 는 일어나지 않고, 케미 줄은 chemi_erase_user()(20270111000000)가 지운다.

create table public.chemi_user_state (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  last_visit_date date,
  last_character text check (last_character in ('changha','elina','yuna','dosa')),
  sound_on boolean not null default true,
  first_load_seen jsonb not null default '{}'::jsonb check (jsonb_typeof(first_load_seen) = 'object'),
  mail_prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(mail_prefs) = 'object'),
  updated_at timestamptz not null default now()
);

-- 만 14세 미만은 줄을 만들지 않는다(함수가 막는다).
create table public.chemi_profiles (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  birth_date date not null check (birth_date >= date '1900-01-01'),
  calendar text not null check (calendar in ('solar','lunar','lunar_leap')),
  birth_time time,
  time_precision text not null check (time_precision in ('exact','band','unknown')),
  gender text check (gender in ('female','male')),
  birth_place text check (char_length(birth_place) between 1 and 80),
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  edit_count integer not null default 0 check (edit_count >= 0),
  regen_used boolean not null default false,
  check ((time_precision = 'unknown') = (birth_time is null))
);

create table public.chemi_charts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null check (kind in ('saju','star')),
  chart jsonb not null check (jsonb_typeof(chart) = 'object'),
  engine_version text not null check (char_length(engine_version) between 1 and 40),
  computed_at timestamptz not null default now(),
  unique (user_id, kind)
);

-- 최대 10명(함수)·1년 미사용 삭제(chemi_purge_stale_partners). 만 14세 미만 상대는 저장하지 않는다.
create table public.chemi_partners (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 20),
  birth_date date not null check (birth_date >= date '1900-01-01'),
  calendar text not null check (calendar in ('solar','lunar','lunar_leap')),
  birth_time time,
  time_precision text not null check (time_precision in ('exact','band','unknown')),
  gender text check (gender in ('female','male')),
  source text not null check (source in ('saju','star','friend_today')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  check ((time_precision = 'unknown') = (birth_time is null))
);
create index chemi_partners_user_idx on public.chemi_partners (user_id, created_at);
create index chemi_partners_last_used_idx on public.chemi_partners (last_used_at);

-- unique(user, content, kind, target_key, kst_date): 하루 한 번·같은 결과의 근거. 캐릭터만 바꿔 다시 보기는 같은 줄.
create table public.chemi_readings (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  content text not null check (content in ('saju','fortune','star','tarot')),
  kind text not null check (kind in ('first','daily','topic','compat','tarot3','date','goodday','month','calendar','friend_today')),
  character text not null check (character in ('changha','elina','yuna','dosa')),
  kst_date date not null,
  target_key text not null default '' check (char_length(target_key) <= 120),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  engine_version text not null check (char_length(engine_version) between 1 and 40),
  table_version text not null check (char_length(table_version) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (user_id, content, kind, target_key, kst_date)
);
create index chemi_readings_user_date_idx on public.chemi_readings (user_id, kst_date);

create table public.chemi_reading_styles (
  reading_id uuid not null references public.chemi_readings(id) on delete cascade,
  character text not null check (character in ('changha','elina','yuna','dosa')),
  locale text not null check (locale ~ '^[a-z]{2}(-[A-Za-z0-9]{2,8})?$'),
  text jsonb not null,
  source text not null check (source in ('ai','table')),
  created_at timestamptz not null default now(),
  primary key (reading_id, character, locale)
);

-- 줄 없음 = on. 단 scope='feature' 는 줄 없음 = off(chemi_feature_state 본문에 고정, §9.2). 시드 없음.
create table public.chemi_switches (
  scope text not null check (scope in ('content','character','feature')),
  key text not null check (key ~ '^[a-z0-9][a-z0-9_.:-]{0,63}$'),
  state text not null check (state in ('on','maintenance','off')),
  updated_at timestamptz not null default now(),
  primary key (scope, key)
);

alter table public.chemi_user_state enable row level security;
alter table public.chemi_profiles enable row level security;
alter table public.chemi_charts enable row level security;
alter table public.chemi_partners enable row level security;
alter table public.chemi_readings enable row level security;
alter table public.chemi_reading_styles enable row level security;
alter table public.chemi_switches enable row level security;
revoke all on public.chemi_user_state, public.chemi_profiles, public.chemi_charts, public.chemi_partners,
  public.chemi_readings, public.chemi_reading_styles, public.chemi_switches
  from public, anon, authenticated, service_role;
