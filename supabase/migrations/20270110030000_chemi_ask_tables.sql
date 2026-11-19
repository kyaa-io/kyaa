-- 케미 탭 M1 (W1-DB) · 질문하기 표. 함수는 W1-ASK(20270111030000). 설계 arch-chemi r3 §2.2·§5.3a.
-- 새 객체만, 시드 0.

-- id = 클라이언트가 만든 요청 키(threadId). hold 마다 세대(hold_gen)와 token 을 새로 만든다.
create table public.chemi_ask_threads (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  character text not null check (character in ('changha','elina','yuna','dosa')),
  content text not null check (content in ('saju','fortune','star','tarot')),
  reading_id uuid references public.chemi_readings(id) on delete set null,
  topic text check (char_length(topic) between 1 and 40),
  question text not null check (char_length(question) between 1 and 500),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  klass text check (char_length(klass) between 1 and 40),
  status text not null default 'draft' check (status in ('draft','held','answered','failed','blocked')),
  hold_gen integer not null default 0 check (hold_gen >= 0),
  hold_token uuid,
  hold_lot_id uuid references public.chemi_pass_lots(id),
  hold_expires_at timestamptz,
  answer text check (char_length(answer) <= 8000),
  followup_question text check (char_length(followup_question) between 1 and 500),
  followup_answer text check (char_length(followup_answer) <= 8000),
  followup_status text not null default 'none' check (followup_status in ('none','pending','answered')),
  followup_gen integer not null default 0 check (followup_gen >= 0),
  followup_token uuid,
  followup_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  answered_at timestamptz,
  check (status <> 'held' or (hold_token is not null and hold_lot_id is not null and hold_expires_at is not null and hold_gen > 0)),
  check (status <> 'answered' or answer is not null),
  check (followup_status <> 'pending' or (followup_token is not null and followup_expires_at is not null and followup_question is not null)),
  check (followup_status <> 'answered' or followup_answer is not null),
  check (followup_status = 'none' or status = 'answered')
);
create index chemi_ask_threads_user_idx on public.chemi_ask_threads (user_id, created_at desc);
create index chemi_ask_threads_held_idx on public.chemi_ask_threads (hold_expires_at) where status = 'held';
create index chemi_ask_threads_followup_idx on public.chemi_ask_threads (followup_expires_at) where followup_status = 'pending';
create index chemi_ask_threads_lot_idx on public.chemi_ask_threads (hold_lot_id) where hold_lot_id is not null;

-- 괴롭힘 반복 24시간 멈춤.
create table public.chemi_ask_strikes (
  user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{0,31}$'),
  kst_date date not null,
  count integer not null default 0 check (count >= 0),
  blocked_until timestamptz,
  primary key (user_id, kind, kst_date)
);

-- DEV 하루 상한·원가 실측(12-1). 사용자 정보 없음.
create table public.chemi_ai_usage (
  kst_date date not null,
  purpose text not null check (purpose in ('ask','style','classify')),
  calls bigint not null default 0 check (calls >= 0),
  tokens_in bigint not null default 0 check (tokens_in >= 0),
  tokens_out bigint not null default 0 check (tokens_out >= 0),
  primary key (kst_date, purpose)
);

alter table public.chemi_ask_threads enable row level security;
alter table public.chemi_ask_strikes enable row level security;
alter table public.chemi_ai_usage enable row level security;
revoke all on public.chemi_ask_threads, public.chemi_ask_strikes, public.chemi_ai_usage
  from public, anon, authenticated, service_role;
