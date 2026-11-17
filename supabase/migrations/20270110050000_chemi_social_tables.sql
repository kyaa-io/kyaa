-- 케미 탭 M1 (W1-DB) · 친구·공유·알림 신청 표. 함수는 W1-REWARD(공유)·W1-MAIL(알림)·W6-SRV(친구). 설계 arch-chemi r3 §2.2.
-- 새 객체만, 시드 0.

-- 친구에게는 월·일만 보인다(decisions 01:xx). 두 사람 한 줄, 작은 uuid 가 low.
create table public.chemi_birth_shares (
  user_low uuid not null references public.app_users(id) on delete cascade,
  user_high uuid not null references public.app_users(id) on delete cascade,
  low_shares boolean not null default false,
  high_shares boolean not null default false,
  asked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high)
);
create index chemi_birth_shares_high_idx on public.chemi_birth_shares (user_high);

-- 공유 카드. 생일·시간·점수 근거·상대 별명을 넣지 않는다(D5). 30일 뒤 만료.
create table public.chemi_share_cards (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{6,32}$'),
  user_id uuid not null references public.app_users(id) on delete cascade,
  content text not null check (content in ('saju','fortune','star','tarot')),
  character text not null check (character in ('changha','elina','yuna','dosa')),
  reading_id uuid references public.chemi_readings(id) on delete cascade,
  card jsonb not null check (jsonb_typeof(card) = 'object'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  deleted_at timestamptz,
  check (expires_at > created_at)
);
create index chemi_share_cards_user_idx on public.chemi_share_cards (user_id, created_at desc);

create table public.chemi_remind_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null check (kind in ('tomorrow','free_ask','minor_limit')),
  content text not null default '' check (content in ('','saju','fortune','star','tarot')),
  send_date date not null,
  status text not null default 'pending' check (status in ('pending','queued','cancelled')),
  created_at timestamptz not null default now(),
  unique (user_id, kind, content, send_date)
);
create index chemi_remind_requests_due_idx on public.chemi_remind_requests (send_date) where status = 'pending';

alter table public.chemi_birth_shares enable row level security;
alter table public.chemi_share_cards enable row level security;
alter table public.chemi_remind_requests enable row level security;
revoke all on public.chemi_birth_shares, public.chemi_share_cards, public.chemi_remind_requests
  from public, anon, authenticated, service_role;
