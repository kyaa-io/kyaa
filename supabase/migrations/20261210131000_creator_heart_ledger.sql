-- PASSPORT-RENEWAL P2 (2/8): the creator heart ledger. One row per claimed passport page (+1 heart for that creator).
-- Append-only. Hearts are not a wallet asset: no balance, no spending. The tier (migration 134000) and the ranking read this
-- table; the one-time stamp conversion (migration 136000) lives in its own table and never enters this one, so the ranking
-- can exclude it by reading only source_type 'passport_page_claim'.

create table public.creator_heart_ledger (
  id uuid primary key default extensions.gen_random_uuid(),
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  amount integer not null check (amount = 1),
  source_type text not null check (source_type in ('passport_page_claim')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  constraint creator_heart_ledger_source_key unique (source_type, source_id)
);
create index creator_heart_ledger_owner_idx on public.creator_heart_ledger(app_user_id, celebrity_id);
create index creator_heart_ledger_creator_idx on public.creator_heart_ledger(celebrity_id, created_at);
alter table public.creator_heart_ledger enable row level security;
revoke all on public.creator_heart_ledger from public, anon, authenticated, service_role;

create trigger creator_heart_ledger_append_only before update or delete on public.creator_heart_ledger
  for each row execute function public.reject_passport_page_mutation();
create trigger creator_heart_ledger_no_truncate before truncate on public.creator_heart_ledger
  for each statement execute function public.reject_passport_page_mutation();
