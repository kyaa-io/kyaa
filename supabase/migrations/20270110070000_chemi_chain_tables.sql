-- 케미 탭 M1 (W1-DB) · 기록 대기열(GIWA 테스트넷, 개인정보 0). 넣기는 chemi_chain_enqueue(20270110090000),
-- 임대·발급·소각은 W1-CHAIN(20270111050000). 구조는 public.blockchain_jobs 를 본떴고 그 표는 건드리지 않는다.
-- 설계 arch-chemi r3 §7.1. 새 객체만, 시드 0.

create table public.chemi_chain_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  status text not null default 'leased' check (status in ('leased','sent','confirmed','failed')),
  tx_hash text check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  record_count integer not null default 0 check (record_count >= 0),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  confirmed_at timestamptz,
  error_code text check (char_length(error_code) between 1 and 60)
);

-- id 는 공개 기록 번호(무작위). 체인·주소·메타데이터에 나가는 식별자는 이것뿐이다.
-- record_key 는 DB 안에서만 쓰는 중복 방지 열쇠다. 탈퇴하면 'erased:{id}' 로 바꾼다.
-- salt 는 결과문 해시에 섞는 32바이트로 DB 밖으로 내보내지 않는다. 탈퇴·동의 철회 때 지운다.
create table public.chemi_chain_records (
  id uuid primary key default extensions.gen_random_uuid(),
  record_key text not null unique check (char_length(record_key) between 1 and 200),
  user_id uuid,
  kind text not null check (kind in ('daily_reading','saju_first','saju_topic','tarot3','game_best','charm','card','album',
    'week5','box_item','title','rank','rank_table')),
  kst_date date not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  salt bytea check (octet_length(salt) = 32),
  eligible_at timestamptz not null,
  status text not null check (status in ('waiting_wallet','pending','leased','sent','minted','retry','burn_pending','burned','void')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  lease_owner text check (char_length(lease_owner) between 1 and 120),
  lease_expires_at timestamptz,
  batch_id uuid references public.chemi_chain_batches(id),
  tx_hash text check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  token_no numeric(78,0) check (token_no >= 0),
  wallet_address text check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  minted_at timestamptz,
  burned_at timestamptz,
  void_reason text check (char_length(void_reason) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (record_key not like 'erased:%' or (user_id is null and wallet_address is null and salt is null)),
  check (user_id is not null or kind = 'rank_table' or record_key like 'erased:%'),
  check (status <> 'void' or void_reason is not null)
);
create index chemi_chain_records_due_idx on public.chemi_chain_records (eligible_at) where status in ('pending','retry');
create index chemi_chain_records_lease_idx on public.chemi_chain_records (lease_expires_at) where status in ('leased','sent');
create index chemi_chain_records_burn_idx on public.chemi_chain_records (created_at) where status = 'burn_pending';
create index chemi_chain_records_user_idx on public.chemi_chain_records (user_id, created_at desc) where user_id is not null;

-- 케미 발급 지갑은 한 번에 한 실행만 쓴다(§7.2). 한 줄짜리 임대이며 시드 없이 실행이 넣는다.
create table public.chemi_chain_writer (
  singleton boolean primary key default true check (singleton),
  lease_owner text not null check (char_length(lease_owner) between 1 and 120),
  lease_expires_at timestamptz not null
);

alter table public.chemi_chain_batches enable row level security;
alter table public.chemi_chain_records enable row level security;
alter table public.chemi_chain_writer enable row level security;
revoke all on public.chemi_chain_batches, public.chemi_chain_records, public.chemi_chain_writer
  from public, anon, authenticated, service_role;
