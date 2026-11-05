-- PASSPORT-RENEWAL P2 (1/8): passport page slots, page claims and the jjinfan title.
-- passport_page_slots: one row per (passport, page, slot 1..9); stamp_id is null while the slot is empty (never filled or voided).
-- passport_page_claims: one immutable row per claimed page (the claim itself; the heart is in creator_heart_ledger).
-- jjinfan_titles: the proof-based title; only revoked_at may change.
-- Tables are reached only through the P2 security definer functions (rights granted in the last P2 migration).

create table public.passport_page_slots (
  passport_id uuid not null references public.fan_passports(id) on delete restrict,
  page_no integer not null check (page_no >= 1),
  slot_no smallint not null check (slot_no between 1 and 9),
  stamp_id uuid references public.community_stamps(id) on delete restrict,
  assigned_at timestamptz,
  cleared_at timestamptz,
  primary key (passport_id, page_no, slot_no),
  constraint passport_page_slots_assigned_check check ((stamp_id is null) = (assigned_at is null) or stamp_id is null)
);
create unique index passport_page_slots_stamp_key on public.passport_page_slots(stamp_id) where stamp_id is not null;
alter table public.passport_page_slots enable row level security;
revoke all on public.passport_page_slots from public, anon, authenticated, service_role;

create table public.passport_page_claims (
  passport_id uuid not null references public.fan_passports(id) on delete restrict,
  page_no integer not null check (page_no >= 1),
  request_key text not null check (length(request_key) between 1 and 200),
  claimed_at timestamptz not null default now(),
  primary key (passport_id, page_no)
);
alter table public.passport_page_claims enable row level security;
revoke all on public.passport_page_claims from public, anon, authenticated, service_role;

create table public.jjinfan_titles (
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  achieved_at timestamptz not null default now(),
  claim_page_no integer not null default 1,
  proof_submission_id uuid,
  revoked_at timestamptz,
  primary key (app_user_id, celebrity_id)
);
alter table public.jjinfan_titles enable row level security;
revoke all on public.jjinfan_titles from public, anon, authenticated, service_role;

create function public.reject_passport_page_mutation() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'PASSPORT_TABLE_IMMUTABLE: %', tg_table_name using errcode = 'P0001';
end $$;
revoke all on function public.reject_passport_page_mutation() from public, anon, authenticated, service_role;

create trigger passport_page_claims_immutable before update or delete on public.passport_page_claims
  for each row execute function public.reject_passport_page_mutation();
create trigger passport_page_claims_no_truncate before truncate on public.passport_page_claims
  for each statement execute function public.reject_passport_page_mutation();

create function public.guard_jjinfan_title_update() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'PASSPORT_TABLE_IMMUTABLE: jjinfan_titles' using errcode = 'P0001';
  end if;
  if new.app_user_id <> old.app_user_id or new.celebrity_id <> old.celebrity_id or new.achieved_at <> old.achieved_at
     or new.claim_page_no <> old.claim_page_no or new.proof_submission_id is distinct from old.proof_submission_id
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'PASSPORT_TABLE_IMMUTABLE: jjinfan_titles only revoked_at may be set once' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.guard_jjinfan_title_update() from public, anon, authenticated, service_role;
create trigger jjinfan_titles_guard before update or delete on public.jjinfan_titles
  for each row execute function public.guard_jjinfan_title_update();
create trigger jjinfan_titles_no_truncate before truncate on public.jjinfan_titles
  for each statement execute function public.reject_passport_page_mutation();
