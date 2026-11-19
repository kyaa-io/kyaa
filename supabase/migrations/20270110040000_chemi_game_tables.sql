-- 케미 탭 M1 (W1-DB) · 게임 표. 함수는 W4-SRV(M3). 설계 arch-chemi r3 §2.2·§5.3b.
-- 새 객체만, 시드 0.

-- user_id null = 비회원 체험 1판(slot_kind='trial'). 같은 request_key = 같은 판(§5.3b).
create table public.chemi_game_plays (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete cascade,
  game text not null check (game in ('run','match')),
  character text not null check (character in ('changha','elina','yuna','dosa')),
  map text not null check (map ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  kst_date date not null,
  slot_kind text not null check (slot_kind in ('free','extra','trial')),
  slot_no smallint not null check (slot_no between 1 and 3),
  request_key uuid,
  request_hash text check (request_hash ~ '^[0-9a-f]{64}$'),
  seed bigint not null,
  status text not null default 'issued' check (status in ('issued','submitted','verified','review','void','refunded')),
  score integer check (score >= 0),
  input_log jsonb,
  ledger_id uuid,
  issued_at timestamptz not null default now(),
  submitted_at timestamptz,
  check ((user_id is null) = (slot_kind = 'trial')),
  check (user_id is null or (request_key is not null and request_hash is not null)),
  unique (user_id, request_key),
  unique (user_id, game, kst_date, slot_kind, slot_no)
);
create index chemi_game_plays_day_idx on public.chemi_game_plays (game, kst_date, score desc) where status = 'verified';

create table public.chemi_game_weeks (
  week_start date not null check (extract(isodow from week_start) = 1),
  game text not null check (game in ('run','match')),
  user_id uuid not null references public.app_users(id) on delete cascade,
  best_play_id uuid references public.chemi_game_plays(id) on delete set null,
  best_score integer check (best_score >= 0),
  best_at timestamptz,
  final_rank integer check (final_rank > 0),
  status text not null default 'open' check (status in ('open','provisional','final')),
  primary key (week_start, game, user_id)
);
create index chemi_game_weeks_rank_idx on public.chemi_game_weeks (week_start, game, best_score desc, best_at);
create index chemi_game_weeks_user_idx on public.chemi_game_weeks (user_id);

-- 체험 1판은 공유 링크당 1번(P-7). 사용자 정보 없음.
create table public.chemi_trial_uses (
  share_id text not null check (share_id ~ '^[A-Za-z0-9_-]{6,32}$'),
  game text not null check (game in ('run','match')),
  used_at timestamptz not null default now(),
  primary key (share_id, game)
);

alter table public.chemi_game_plays enable row level security;
alter table public.chemi_game_weeks enable row level security;
alter table public.chemi_trial_uses enable row level security;
revoke all on public.chemi_game_plays, public.chemi_game_weeks, public.chemi_trial_uses
  from public, anon, authenticated, service_role;
