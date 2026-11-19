-- 케미 탭 M1 (W1-DB) · 메일 발송함. 넣기는 chemi_mail_enqueue(20270110090000), 임대·완료는 W1-MAIL(20270111040000).
-- 구조는 group_invitation_email_outbox 를 본떴고 그 표는 건드리지 않는다. 새 객체만, 시드 0.
-- user_id 는 FK 없이 둔다: 탈퇴 때 보낸 줄은 user_id·to_hash·payload 를 비우고 남긴다(§6.7).
create table public.chemi_mail_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid,
  to_hash text check (to_hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  category text not null check (category in ('transactional','requested','friend','marketing_ok')),
  dedupe_key text not null unique check (char_length(dedupe_key) between 1 and 200),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  send_after timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','leased','sent','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  lease_owner text check (char_length(lease_owner) between 1 and 120),
  lease_expires_at timestamptz,
  last_error_code text check (char_length(last_error_code) between 1 and 60),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check ((status = 'leased') = (lease_owner is not null and lease_expires_at is not null)),
  check (status <> 'sent' or sent_at is not null)
);
create index chemi_mail_outbox_due_idx on public.chemi_mail_outbox (send_after) where status = 'pending';
create index chemi_mail_outbox_lease_idx on public.chemi_mail_outbox (lease_expires_at) where status = 'leased';
create index chemi_mail_outbox_user_idx on public.chemi_mail_outbox (user_id) where user_id is not null;

alter table public.chemi_mail_outbox enable row level security;
revoke all on public.chemi_mail_outbox from public, anon, authenticated, service_role;
