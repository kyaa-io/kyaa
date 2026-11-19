-- 케미 탭 M1 (W1-DB) · 결제·이용권 표. 함수는 W1-PAY(20270111020000)·W1-ASK 가 낸다. 설계 arch-chemi r3 §2.2·§5.3c·§6.
-- 새 객체만, 시드 0. (K) = 법정 보관 5년(11-1 19): 사용자 FK 를 두지 않고 탈퇴 때 내용만 비운다(§6.7).

-- (K) 주문. 결제사에 보내는 orderId = order_no.
create table public.chemi_orders (
  id uuid primary key default extensions.gen_random_uuid(),
  order_no text not null unique check (order_no ~ '^C-[0-9]{8}-[0-9]{4,6}$'),
  user_id uuid not null,
  product_code text not null check (product_code ~ '^[a-z0-9_]{1,40}(:[a-z0-9-]{1,20})?$'),
  target jsonb not null default '{}'::jsonb check (jsonb_typeof(target) = 'object'),
  amount_krw integer not null check (amount_krw > 0),
  currency text not null default 'KRW' check (currency = 'KRW'),
  status text not null default 'created' check (status in ('created','confirming','paid','opened','cancel_pending','auto_cancelled',
    'refund_requested','refunded','failed','abandoned','manual_review','disputed')),
  is_first_purchase boolean not null default false,
  is_minor boolean not null default false,
  limit_month date check (extract(day from limit_month) = 1),
  payment_key text unique check (char_length(payment_key) between 1 and 200),
  binding_verified_at timestamptz,
  method text check (char_length(method) between 1 and 40),
  draft_ask_id uuid,
  grant_attempts integer not null default 0 check (grant_attempts >= 0),
  created_at timestamptz not null default now(),
  confirming_at timestamptz,
  paid_at timestamptz,
  fulfilled_at timestamptz,
  cancel_pending_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  fail_code text check (char_length(fail_code) between 1 and 60),
  check (status <> 'confirming' or (payment_key is not null and limit_month is not null))
);
-- 승인 여부를 모르는 주문은 계정마다 1건(11-1 04).
create unique index chemi_orders_one_open_per_user on public.chemi_orders (user_id) where status in ('confirming','cancel_pending');
create index chemi_orders_user_idx on public.chemi_orders (user_id, created_at desc);
create index chemi_orders_reconcile_idx on public.chemi_orders (status, confirming_at) where status in ('confirming','cancel_pending','refund_requested','manual_review');
create index chemi_orders_minor_month_idx on public.chemi_orders (user_id, limit_month) where is_minor;

-- (K) 웹훅·확인·대조·운영 기록. foreign = 이 주문의 결제가 아니라 승인·취소 없이 격리한 것(§6.2b).
create table public.chemi_payment_events (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid references public.chemi_orders(id),
  source text not null check (source in ('confirm','webhook','reconcile','cancel','manual')),
  event_key text not null check (char_length(event_key) between 1 and 300),
  disposition text not null check (disposition in ('applied','ignored','foreign')),
  actor text check (char_length(actor) between 1 and 120),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  received_at timestamptz not null default now(),
  unique (source, event_key)
);
create index chemi_payment_events_order_idx on public.chemi_payment_events (order_id) where order_id is not null;

-- (K) 결제사 거래 한 건 = 한 줄. 승인·취소 전이를 이 표만으로 다시 그린다.
create table public.chemi_payment_txns (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.chemi_orders(id),
  kind text not null check (kind in ('approve','cancel')),
  provider_txn_key text not null unique check (char_length(provider_txn_key) between 1 and 200),
  provider_order_id text not null check (char_length(provider_order_id) between 1 and 64),
  payment_key text not null check (char_length(payment_key) between 1 and 200),
  amount_krw integer not null check (amount_krw >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  provider_status text not null check (char_length(provider_status) between 1 and 40),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index chemi_payment_txns_order_idx on public.chemi_payment_txns (order_id);

-- (K) 결제 자격 생일. 운세 생일과 따로 잠근다(§6.5).
create table public.chemi_pay_eligibility (
  user_id uuid primary key,
  birth_date date not null check (birth_date >= date '1900-01-01'),
  basis text not null check (basis in ('self','guardian_verified','identity_verified')),
  locked_at timestamptz not null default now()
);

-- 단건 권리. 같은 주제 두 번 결제 막기(11-1 상태 표).
create table public.chemi_entitlements (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null check (kind in ('saju_topic','fortune_date','fortune_goodday','star_month','star_calendar','star_topic',
    'compat_extra','friend_extra','charm')),
  target_key text not null default '' check (char_length(target_key) <= 120),
  order_id uuid references public.chemi_orders(id),
  opened_at timestamptz,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index chemi_entitlements_live on public.chemi_entitlements (user_id, kind, target_key) where revoked_at is null;
create index chemi_entitlements_order_idx on public.chemi_entitlements (order_id) where order_id is not null;

-- 이용권 묶음(§5.3c). remaining = 쓸 수 있는 수, held = 답을 기다리며 잡힌 수.
-- 처음 무료 3개는 기한 없음(12-1·11-3) → expires_at null 은 initial_free 만.
create table public.chemi_pass_lots (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  pass_kind text not null check (pass_kind in ('ask','tarot3')),
  bucket text not null check (bucket in ('initial_free','weekly_free','share','paid')),
  grant_key text not null unique check (char_length(grant_key) between 1 and 200),
  qty integer not null check (qty > 0),
  remaining integer not null,
  held integer not null default 0,
  expires_at timestamptz,
  closed_at timestamptz,
  closed_reason text check (closed_reason in ('replace','expire','refund')),
  order_id uuid references public.chemi_orders(id),
  granted_at timestamptz not null default now(),
  check (remaining >= 0),
  check (held >= 0),
  check (remaining + held <= qty),
  check ((closed_at is null) = (closed_reason is null)),
  check (closed_at is null or remaining = 0),
  check (expires_at is not null or bucket = 'initial_free'),
  constraint chemi_pass_lots_paid_has_order check ((bucket = 'paid') = (order_id is not null))
);
-- 무료 통은 쌓이지 않는다: 닫히지 않은 묶음은 통마다 1개(잡혀 있어 remaining 0 인 묶음 포함 — r3 N3).
create unique index chemi_pass_lots_one_open_free on public.chemi_pass_lots (user_id, pass_kind, bucket)
  where bucket in ('weekly_free','share') and closed_at is null;
create unique index chemi_pass_lots_one_initial on public.chemi_pass_lots (user_id, pass_kind) where bucket = 'initial_free';
create index chemi_pass_lots_user_idx on public.chemi_pass_lots (user_id, pass_kind) where closed_at is null;
create index chemi_pass_lots_expiry_idx on public.chemi_pass_lots (expires_at) where closed_at is null and expires_at is not null;
create index chemi_pass_lots_order_idx on public.chemi_pass_lots (order_id) where order_id is not null;

-- 이용권 내역. delta = remaining 이 바뀐 양. 한 번 잡은 것(ref)은 use 와 release 중 하나로만 끝난다.
create table public.chemi_pass_ledger (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  lot_id uuid not null references public.chemi_pass_lots(id) on delete cascade,
  pass_kind text not null check (pass_kind in ('ask','tarot3')),
  reason text not null check (reason in ('grant','hold','use','release','lapse','expire','replace','refund')),
  delta integer not null,
  ref_kind text not null check (ref_kind ~ '^[a-z][a-z0-9_]{0,31}$'),
  ref_id text not null check (char_length(ref_id) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (reason, ref_kind, ref_id),
  check (case reason
    when 'grant' then delta > 0
    when 'hold' then delta = -1
    when 'use' then delta in (0, -1)  -- 0 = 잡아 둔 것을 씀(질문), -1 = 잡지 않고 바로 씀(타로 3장)
    when 'release' then delta = 1
    when 'lapse' then delta = -1
    else delta <= 0 end)
);
create unique index chemi_pass_ledger_one_end on public.chemi_pass_ledger (ref_kind, ref_id) where reason in ('use','release');
create index chemi_pass_ledger_user_idx on public.chemi_pass_ledger (user_id, created_at desc);
create index chemi_pass_ledger_lot_idx on public.chemi_pass_ledger (lot_id);

-- (K) 첫 구매 값은 환불해도 돌아오지 않는다(M3).
create table public.chemi_first_purchase (
  user_id uuid primary key,
  order_id uuid not null references public.chemi_orders(id),
  used_at timestamptz not null default now()
);

-- (K) 보호자 동의. 보호자 전화번호 원문은 저장하지 않는다.
create table public.chemi_guardian_consents (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null,
  relation text not null check (char_length(relation) between 1 and 20),
  verified_at timestamptz not null,
  provider text not null check (char_length(provider) between 1 and 40),
  proof_hash text not null check (proof_hash ~ '^[0-9a-f]{64}$'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index chemi_guardian_consents_one_live on public.chemi_guardian_consents (user_id) where revoked_at is null;

-- 하루 1번 09:00 갱신(11-1 20). 작업이 쓰는 값이지 시드가 아니다.
create table public.chemi_fx_rates (
  rate_date date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$' and currency <> 'KRW'),
  krw_per_unit numeric(18,6) not null check (krw_per_unit > 0),
  fetched_at timestamptz not null default now(),
  primary key (rate_date, currency)
);

alter table public.chemi_orders enable row level security;
alter table public.chemi_payment_events enable row level security;
alter table public.chemi_payment_txns enable row level security;
alter table public.chemi_pay_eligibility enable row level security;
alter table public.chemi_entitlements enable row level security;
alter table public.chemi_pass_lots enable row level security;
alter table public.chemi_pass_ledger enable row level security;
alter table public.chemi_first_purchase enable row level security;
alter table public.chemi_guardian_consents enable row level security;
alter table public.chemi_fx_rates enable row level security;
revoke all on public.chemi_orders, public.chemi_payment_events, public.chemi_payment_txns, public.chemi_pay_eligibility,
  public.chemi_entitlements, public.chemi_pass_lots, public.chemi_pass_ledger, public.chemi_first_purchase,
  public.chemi_guardian_consents, public.chemi_fx_rates
  from public, anon, authenticated, service_role;
