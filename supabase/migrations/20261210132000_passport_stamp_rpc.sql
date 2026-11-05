-- PASSPORT-RENEWAL P2 (3/8): assign a stamp to a passport page slot, claim a full page (heart), void a stamp.
-- All functions: security definer, search_path '', execute service_role only, errors P0001 with a fixed code.
-- Lock order: group_wallet_lock(user) -> passport row -> slots -> stamp issue.
-- Draft rules flagged in the report: daily stamp limit = policy rules.actions.<a>.stamp.capMax (capPer other than 'none');
-- a stamp whose kind has no empty matching slot on page 1 goes to an overflow page only when that daily limit is not reached.

create table public.passport_stamp_voids (
  id uuid primary key default extensions.gen_random_uuid(),
  stamp_id uuid not null unique references public.community_stamps(id) on delete restrict,
  actor_app_user_id uuid not null references public.app_users(id) on delete restrict,
  reason text not null check (length(reason) between 1 and 500),
  sanction boolean not null default false,
  request_key text not null unique check (length(request_key) between 1 and 200),
  point_correction text not null check (point_correction in ('corrected', 'review', 'none')),
  review_reason text,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table public.passport_stamp_voids enable row level security;
revoke all on public.passport_stamp_voids from public, anon, authenticated, service_role;
create trigger passport_stamp_voids_immutable before update or delete on public.passport_stamp_voids
  for each row execute function public.reject_passport_page_mutation();
create trigger passport_stamp_voids_no_truncate before truncate on public.passport_stamp_voids
  for each statement execute function public.reject_passport_page_mutation();

-- Policy used for slot rules: the active one, else the newest version (dev drafts).
create function public.passport_policy_row() returns public.dukjil_policy_versions
language sql stable security definer set search_path = '' as $$
  select * from public.dukjil_policy_versions
   order by (status = 'active' and effective_from <= pg_catalog.clock_timestamp()) desc, version desc limit 1
$$;

-- Action key of a stamp kind in the policy (rules.actions.<action>.stamp.kind), else the kind text when page 1 names it.
create function public.passport_stamp_action(p_kind public.community_stamp_kind) returns text
language plpgsql stable security definer set search_path = '' as $$
declare pol public.dukjil_policy_versions; act text;
begin
  pol := public.passport_policy_row();
  if pol.version is null then return null; end if;
  select a.key into act from jsonb_each(pol.rules -> 'actions') a where a.value #>> '{stamp,kind}' = p_kind::text order by a.key limit 1;
  if act is null and exists(select 1 from jsonb_array_elements(pol.mission_book -> 'pages') pg, jsonb_array_elements(pg -> 'slots') s
                            where s ->> 'action' = p_kind::text) then act := p_kind::text; end if;
  return act;
end $$;

-- PR-P2-DB-4: slot placement happens inside the stamp issuer, so every earn RPC (record_dukjil_action, attend_creator) places the stamp
-- in the same transaction. The P1 issuer is renamed to *_base (body untouched) and a wrapper with the same signature places new stamps.
alter function public.dukjil_issue_stamp(uuid, uuid, public.community_stamp_kind, text, integer) rename to dukjil_issue_stamp_base;

-- Places an existing stamp in the first fitting slot. No-op (stamp stays unplaced) when: no celebrity, the policy has no mission book pages
-- (policies before v3), the kind maps to no slot action, the user has no passport, or the stamp already has a slot (idempotent).
-- Page 1 full / daily limit reached: the stamp is kept without a slot (contract 3.3); a later void or a new page frees nothing retroactively.
create function public.passport_place_stamp(p_user uuid, p_celebrity uuid, p_stamp uuid, p_kind public.community_stamp_kind) returns void
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  pol public.dukjil_policy_versions; act text; pass uuid; slot_page integer; slot_no integer; cap_per text; cap_max integer;
  today_count integer; max_page integer;
begin
  if p_user is null or p_celebrity is null or p_stamp is null or p_kind is null then return; end if;
  pol := public.passport_policy_row();
  if pol.version is null or jsonb_typeof(pol.mission_book -> 'pages') is distinct from 'array' then return; end if;
  act := public.passport_stamp_action(p_kind);
  if act is null then return; end if;
  select id into pass from public.fan_passports where app_user_id = p_user and celebrity_id = p_celebrity for update;
  if pass is null then return; end if;
  if exists(select 1 from public.passport_page_slots x where x.passport_id = pass and x.stamp_id = p_stamp) then return; end if;

  select (s ->> 'slot')::integer into slot_no
    from jsonb_array_elements(pol.mission_book #> '{pages,0,slots}') s
   where s ->> 'action' = act
     and not exists(select 1 from public.passport_page_slots x where x.passport_id = pass and x.page_no = 1
                      and x.slot_no = (s ->> 'slot')::integer and x.stamp_id is not null)
   order by (s ->> 'slot')::integer limit 1;
  if slot_no is not null then
    slot_page := 1;
  else
    cap_per := pol.rules #>> array['actions', act, 'stamp', 'capPer'];
    cap_max := nullif(pol.rules #>> array['actions', act, 'stamp', 'capMax'], '')::integer;
    if cap_per is not null and cap_per <> 'none' and cap_max is not null then
      select count(*) into today_count from public.community_stamps c
       where c.app_user_id = p_user and c.celebrity_id = p_celebrity and c.kind = p_kind and c.id <> p_stamp
         and public.dukjil_kst_date(c.issued_at) = public.dukjil_kst_date();
      if today_count < cap_max then
        -- cleared slots on overflow pages first (lowest page, lowest slot), then the next free slot of the last page, else a new page
        select x.page_no, x.slot_no into slot_page, slot_no from public.passport_page_slots x
         where x.passport_id = pass and x.page_no > 1 and x.stamp_id is null order by x.page_no, x.slot_no limit 1;
        if slot_page is null then
          select coalesce(max(page_no), 1) into max_page from public.passport_page_slots where passport_id = pass;
          select g.n into slot_no from generate_series(1, 9) g(n)
           where not exists(select 1 from public.passport_page_slots x where x.passport_id = pass and x.page_no = greatest(max_page, 2) and x.slot_no = g.n)
           order by g.n limit 1;
          if slot_no is not null then slot_page := greatest(max_page, 2); else slot_page := max_page + 1; slot_no := 1; end if;
        end if;
      end if;
    end if;
  end if;

  if slot_page is not null then
    insert into public.passport_page_slots(passport_id, page_no, slot_no, stamp_id, assigned_at, cleared_at)
      values (pass, slot_page, slot_no, p_stamp, pg_catalog.clock_timestamp(), null)
      on conflict (passport_id, page_no, slot_no) do update set stamp_id = excluded.stamp_id, assigned_at = excluded.assigned_at, cleared_at = null
        where public.passport_page_slots.stamp_id is null;
  end if;
end $$;

create function public.dukjil_issue_stamp(
  p_user uuid, p_celebrity uuid, p_kind public.community_stamp_kind, p_source_key text, p_policy integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_before uuid; v_id uuid;
begin
  select id into v_before from public.community_stamps where app_user_id = p_user and kind = p_kind and source_key = p_source_key;
  v_id := public.dukjil_issue_stamp_base(p_user, p_celebrity, p_kind, p_source_key, p_policy);
  if v_before is null and v_id is not null then perform public.passport_place_stamp(p_user, p_celebrity, v_id, p_kind); end if;
  return v_id;
end $$;
revoke all on function public.dukjil_issue_stamp_base(uuid, uuid, public.community_stamp_kind, text, integer),
  public.dukjil_issue_stamp(uuid, uuid, public.community_stamp_kind, text, integer),
  public.passport_place_stamp(uuid, uuid, uuid, public.community_stamp_kind) from public, anon, authenticated, service_role;

-- PR-P2-DB-6 (review 3): mission-book slot 8 (steady_checkin). Cumulative attendance days of this passport (not consecutive; a day whose check-in
-- stamp was voided does not count) reach the policy value pages[0].slots[action=steady_checkin].days -> one steady_checkin stamp, placed by the
-- issuer into slot 8. The source key is fixed per creator, so repeated calls and replays never issue a second one (a voided one is not re-issued).
create function public.passport_issue_steady_checkin(p_user uuid, p_celebrity uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pol public.dukjil_policy_versions; need integer; have integer;
begin
  if p_user is null or p_celebrity is null then return null; end if;
  pol := public.passport_policy_row();
  if pol.version is null then return null; end if;
  select nullif(s ->> 'days', '')::integer into need from jsonb_array_elements(coalesce(pol.mission_book #> '{pages,0,slots}', '[]'::jsonb)) s
   where s ->> 'action' = 'steady_checkin' limit 1;
  if need is null or need < 1 then return null; end if;
  select count(*) into have from public.group_creator_attendance a join public.community_stamps st on st.id = a.stamp_id
   where a.app_user_id = p_user and a.celebrity_id = p_celebrity and st.revoked_at is null;
  if have < need then return null; end if;
  return public.dukjil_issue_stamp(p_user, p_celebrity, 'steady_checkin', 'steady-checkin:' || p_celebrity::text || ':page1', pol.version);
end $$;
revoke all on function public.passport_issue_steady_checkin(uuid, uuid) from public, anon, authenticated, service_role;

-- PR-P2-DB-6 (review 5): the correction path for an admin void must work on a sanctioned or deactivated account.
-- group_wallet_lock_target takes exactly the group_wallet_lock lock set in the same order, but skips the active-account check of the TARGET.
-- The release gate stays: wallet disabled -> GROUP_WALLET_UNAVAILABLE, write fence -> GROUP_WALLET_WRITE_FENCED (the void rolls back as a whole).
-- group_wallet_post_correction is the live group_wallet_post definition with only its lock call swapped, so ledger rules stay identical.
-- Ordinary wallet writes keep group_wallet_lock and its active check.
create function public.group_wallet_lock_target(p_owner uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_owner is null then raise exception 'GROUP_WALLET_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('group-wallet:campaign-barrier', 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-wallet:owner:' || p_owner, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:' || p_owner::text, 0));
  if not exists(select 1 from public.group_wallet_release where singleton and enabled) then raise exception 'GROUP_WALLET_UNAVAILABLE'; end if;
  if exists(select 1 from public.group_wallet_release where singleton and write_fenced) then raise exception 'GROUP_WALLET_WRITE_FENCED'; end if;
end $$;
do $$declare definition text;begin
  select pg_get_functiondef(oid) into strict definition from pg_proc where pronamespace = 'public'::regnamespace and proname = 'group_wallet_post';
  if position('perform public.group_wallet_lock(p_owner);' in definition) = 0 or position('''dukjil_correction''' in definition) = 0 then
    raise exception 'DUKJIL_WALLET_CONTRACT_CHANGED'; end if;
  definition := replace(definition, 'FUNCTION public.group_wallet_post(', 'FUNCTION public.group_wallet_post_correction(');
  definition := replace(definition, 'perform public.group_wallet_lock(p_owner);', 'perform public.group_wallet_lock_target(p_owner);');
  execute definition;
end $$;
-- the ledger insert trigger takes the full lock itself; a dukjil_correction debit takes the target lock instead (same pattern as the refund credits)
do $$declare definition text;begin
  select pg_get_functiondef(oid) into strict definition from pg_proc where pronamespace = 'public'::regnamespace and proname = 'group_wallet_assign_sequence';
  if position('else perform public.group_wallet_lock(new.app_user_id);end if;' in definition) = 0 then raise exception 'DUKJIL_WALLET_TRIGGER_CHANGED'; end if;
  definition := replace(definition, 'else perform public.group_wallet_lock(new.app_user_id);end if;',
    'elsif new.amount<0 and new.source_type=''dukjil_correction'' then perform public.group_wallet_lock_target(new.app_user_id); else perform public.group_wallet_lock(new.app_user_id);end if;');
  execute definition;
end $$;
revoke all on function public.group_wallet_lock_target(uuid), public.group_wallet_post_correction(uuid, text, bigint, text, uuid)
  from public, anon, authenticated, service_role;

-- RPC kept for direct use (and tests): validates, issues through the placing issuer and answers with the slot the stamp really holds.
-- L2: the answer is read back from passport_page_slots, so a lost slot (page full, daily limit, conflict) is pageNo/slotNo null, never a made-up slot.
create function public.assign_passport_stamp(
  p_user uuid, p_celebrity uuid, p_kind public.community_stamp_kind, p_source_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  pol public.dukjil_policy_versions; act text; pass uuid; stamp uuid; existing uuid; slot_page integer; slot_no integer;
begin
  if p_user is null or p_celebrity is null or p_kind is null or p_source_key is null or length(p_source_key) not between 1 and 220 then
    raise exception 'STAMP_KIND_UNKNOWN' using errcode = 'P0001'; end if;
  pol := public.passport_policy_row();
  act := public.passport_stamp_action(p_kind);
  if act is null then raise exception 'STAMP_KIND_UNKNOWN' using errcode = 'P0001'; end if;
  perform public.group_wallet_lock(p_user, true);
  select id into pass from public.fan_passports where app_user_id = p_user and celebrity_id = p_celebrity for update;
  if pass is null then raise exception 'PASSPORT_REQUIRED' using errcode = 'P0001'; end if;

  select s.id into existing from public.community_stamps s where s.app_user_id = p_user and s.kind = p_kind and s.source_key = p_source_key;
  if existing is not null then
    select sl.page_no, sl.slot_no into slot_page, slot_no from public.passport_page_slots sl where sl.passport_id = pass and sl.stamp_id = existing;
    return jsonb_build_object('stampId', existing, 'pageNo', slot_page, 'slotNo', slot_no, 'overflow', coalesce(slot_page > 1, false), 'replayed', true);
  end if;

  stamp := public.dukjil_issue_stamp(p_user, p_celebrity, p_kind, p_source_key, pol.version);
  select sl.page_no, sl.slot_no into slot_page, slot_no from public.passport_page_slots sl where sl.passport_id = pass and sl.stamp_id = stamp;
  return jsonb_build_object('stampId', stamp, 'pageNo', slot_page, 'slotNo', slot_no, 'overflow', coalesce(slot_page > 1, false), 'replayed', false);
end $$;

create function public.claim_passport_page(
  p_user uuid, p_celebrity uuid, p_page_no integer, p_request_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pass uuid; filled integer; title_active boolean; src uuid; cheer uuid; cheer_key text; pol public.dukjil_policy_versions;
begin
  if p_page_no is null or p_page_no < 1 or p_request_key is null or length(p_request_key) not between 1 and 200 then
    raise exception 'PASSPORT_PAGE_NOT_COMPLETE' using errcode = 'P0001'; end if;
  perform public.group_wallet_lock(p_user, true);
  select id into pass from public.fan_passports where app_user_id = p_user and celebrity_id = p_celebrity for update;
  if pass is null then raise exception 'PASSPORT_REQUIRED' using errcode = 'P0001'; end if;
  cheer_key := 'page_claim_cheer:' || pass::text || ':' || public.dukjil_kst_date()::text;

  if exists(select 1 from public.passport_page_claims where passport_id = pass and page_no = p_page_no) then
    select exists(select 1 from public.jjinfan_titles t where t.app_user_id = p_user and t.celebrity_id = p_celebrity and t.revoked_at is null) into title_active;
    select id into cheer from public.community_stamps where app_user_id = p_user and kind = 'cheer' and source_key = cheer_key;
    return jsonb_build_object('hearts', 1, 'pageNo', p_page_no, 'jjinfanConfirmed', title_active, 'cheerStampId', cheer, 'replayed', true);
  end if;

  select count(*) into filled from public.passport_page_slots where passport_id = pass and page_no = p_page_no and stamp_id is not null;
  if filled < 9 then raise exception 'PASSPORT_PAGE_NOT_COMPLETE' using errcode = 'P0001'; end if;

  select exists(select 1 from public.jjinfan_titles t where t.app_user_id = p_user and t.celebrity_id = p_celebrity and t.revoked_at is null) into title_active;
  if p_page_no = 1 then
    -- page 1 is complete only with slot 9 (proof) filled: that confirms the jjinfan title (a revoked title is not re-issued)
    insert into public.jjinfan_titles(app_user_id, celebrity_id) values (p_user, p_celebrity) on conflict (app_user_id, celebrity_id) do nothing;
    select exists(select 1 from public.jjinfan_titles t where t.app_user_id = p_user and t.celebrity_id = p_celebrity and t.revoked_at is null) into title_active;
  elsif not title_active then
    raise exception 'PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN' using errcode = 'P0001';
  end if;

  insert into public.passport_page_claims(passport_id, page_no, request_key) values (pass, p_page_no, p_request_key);
  src := (substr(md5(pass::text || ':' || p_page_no::text), 1, 8) || '-' || substr(md5(pass::text || ':' || p_page_no::text), 9, 4) || '-'
          || substr(md5(pass::text || ':' || p_page_no::text), 13, 4) || '-' || substr(md5(pass::text || ':' || p_page_no::text), 17, 4) || '-'
          || substr(md5(pass::text || ':' || p_page_no::text), 21, 12))::uuid;
  insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id)
    values (p_celebrity, p_user, 1, 'passport_page_claim', src);

  -- the day's first Claim also earns a 0-point cheer stamp (idempotent per day)
  pol := public.passport_policy_row();
  cheer := public.dukjil_issue_stamp_base(p_user, p_celebrity, 'cheer', cheer_key, pol.version);
  return jsonb_build_object('hearts', 1, 'pageNo', p_page_no, 'jjinfanConfirmed', title_active, 'cheerStampId', cheer, 'replayed', false);
end $$;

-- PR-P2-DB-8: dukjil_point_corrections (20261210050000) is also where a stamp void records its point-correction result (contract 3.5).
-- A check-in grant has no dukjil_action_log row, so action_log_id becomes optional and the row links to the stamp and, for a check-in, the attendance row.
alter table public.dukjil_point_corrections alter column action_log_id drop not null;
alter table public.dukjil_point_corrections
  add column stamp_id uuid unique references public.community_stamps(id) on delete restrict,
  add column attendance_id uuid unique references public.group_creator_attendance(id) on delete restrict,
  add column status text not null default 'corrected' check (status in ('corrected', 'review')),
  add column void_reason text;
alter table public.dukjil_point_corrections
  add constraint dukjil_point_corrections_source check (num_nonnulls(action_log_id, attendance_id) = 1),
  add constraint dukjil_point_corrections_status_ledger check ((status = 'corrected') = (ledger_id is not null));

create function public.void_passport_stamp(
  p_actor uuid, p_stamp_id uuid, p_reason text, p_sanction boolean, p_request_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  st public.community_stamps; prior public.passport_stamp_voids; pass uuid; g_id uuid; g_ledger uuid; correction text := 'none'; review text;
  cid uuid; entry uuid; from_att boolean := false; revoked boolean := false; is_admin boolean; amt integer; gseq bigint; spent boolean;
begin
  if p_actor is null or p_stamp_id is null or p_request_key is null or length(coalesce(p_reason, '')) not between 1 and 500 then
    raise exception 'STAMP_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into prior from public.passport_stamp_voids where request_key = p_request_key or stamp_id = p_stamp_id limit 1;
  if prior.id is not null then
    return jsonb_build_object('stampId', prior.stamp_id, 'replayed', true, 'pointCorrection', prior.point_correction,
      'jjinfanRevoked', exists(select 1 from public.passport_stamp_voids v where v.id = prior.id and v.sanction));
  end if;
  select * into st from public.community_stamps where id = p_stamp_id for update;
  if st.id is null then raise exception 'STAMP_NOT_FOUND' using errcode = 'P0001'; end if;
  select exists(select 1 from public.admin_allowlist a join public.app_users u on u.verified_email = a.email
                 where u.id = p_actor and u.status = 'active' and a.active and a.role <> 'viewer') into is_admin;
  if not is_admin and p_actor <> st.app_user_id then raise exception 'ADMIN_REQUIRED' using errcode = 'P0001'; end if;
  -- M3: a title revocation (sanction) is an admin decision; the stamp owner may only void their own stamp
  if coalesce(p_sanction, false) and not is_admin then raise exception 'ADMIN_REQUIRED' using errcode = 'P0001'; end if;
  if st.revoked_at is not null then
    return jsonb_build_object('stampId', st.id, 'replayed', true, 'pointCorrection', 'none', 'jjinfanRevoked', false);
  end if;

  -- review 5: an admin void must also work on a sanctioned or inactive target; the owner's own void keeps the full active check
  if is_admin then perform public.group_wallet_lock_target(st.app_user_id);
  else perform public.group_wallet_lock(st.app_user_id, true); end if;
  update public.community_stamps set revoked_at = pg_catalog.clock_timestamp(), revoked_reason = left(p_reason, 200) where id = st.id;
  select id into pass from public.fan_passports where app_user_id = st.app_user_id and celebrity_id = st.celebrity_id;
  if pass is not null then
    update public.passport_page_slots set stamp_id = null, cleared_at = pg_catalog.clock_timestamp() where passport_id = pass and stamp_id = st.id;
  end if;

  -- point correction: the grant that came with this stamp (dukjil_action_log.stamp_id), taken back only when the points are still there
  select l.id, l.points, l.ledger_id into g_id, amt, g_ledger from public.dukjil_action_log l where l.stamp_id = st.id and l.points > 0 order by l.created_at limit 1;
  if g_id is null then
    -- review 4: a check-in grant is recorded only in group_creator_attendance (stamp_id), so it is looked up there with the same rule
    select a.id, a.points, a.ledger_id into g_id, amt, g_ledger from public.group_creator_attendance a where a.stamp_id = st.id and a.points > 0 limit 1;
    from_att := g_id is not null;
  end if;
  if g_id is not null then
    cid := extensions.gen_random_uuid();
    -- M4 (contract 3.5): take the grant back only when no deduction row follows it; other points covering the balance do not count
    select e.owner_sequence into gseq from public.mobile_fan_economy_ledger e where e.id = g_ledger;
    select exists(select 1 from public.mobile_fan_economy_ledger e
                   where e.app_user_id = st.app_user_id and e.celebrity_id is null and e.asset = 'fan_point' and e.amount < 0
                     and e.source_type <> 'dukjil_correction' and e.owner_sequence > gseq) into spent;
    if not spent and public.group_wallet_balance(st.app_user_id, 'fan_point') >= amt then
      -- the deduction row's source_id is the corrections row id, so the ledger traces back to the void
      entry := public.group_wallet_post_correction(st.app_user_id, 'fan_point', -amt::bigint, 'dukjil_correction', cid);
      correction := 'corrected';
    else
      correction := 'review'; review := 'rights_spent';
    end if;
    insert into public.dukjil_point_corrections(id, action_log_id, attendance_id, stamp_id, app_user_id, amount, reason, ledger_id, status, void_reason)
      values (cid, case when from_att then null else g_id end, case when from_att then g_id else null end, st.id, st.app_user_id, amt,
              coalesce(review, 'stamp_void'), entry, correction, left(p_reason, 500));
  end if;

  if p_sanction and st.celebrity_id is not null then
    update public.jjinfan_titles set revoked_at = pg_catalog.clock_timestamp()
     where app_user_id = st.app_user_id and celebrity_id = st.celebrity_id and revoked_at is null;
    revoked := found;
  end if;
  insert into public.passport_stamp_voids(stamp_id, actor_app_user_id, reason, sanction, request_key, point_correction, review_reason)
    values (st.id, p_actor, p_reason, coalesce(p_sanction, false), p_request_key, correction, review);
  return jsonb_build_object('stampId', st.id, 'replayed', false, 'pointCorrection', correction, 'jjinfanRevoked', revoked);
end $$;

-- Read model for the roadmap UI: pages of policy slots (page 1) and overflow pages, with claim state.
create function public.read_passport_roadmap(p_user uuid, p_celebrity uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pass uuid; pol public.dukjil_policy_versions; pages jsonb := '[]'::jsonb; title_active boolean; max_page integer; pn integer; f integer; sl jsonb;
begin
  select id into pass from public.fan_passports where app_user_id = p_user and celebrity_id = p_celebrity;
  if pass is null then raise exception 'PASSPORT_REQUIRED' using errcode = 'P0001'; end if;
  pol := public.passport_policy_row();
  select exists(select 1 from public.jjinfan_titles t where t.app_user_id = p_user and t.celebrity_id = p_celebrity and t.revoked_at is null) into title_active;
  select coalesce(max(page_no), 1) into max_page from public.passport_page_slots where passport_id = pass;
  for pn in 1..max_page loop
    select coalesce(jsonb_agg(jsonb_build_object('slot', g.n, 'action',
        case when pn = 1 then (select s ->> 'action' from jsonb_array_elements(pol.mission_book #> '{pages,0,slots}') s where (s ->> 'slot')::integer = g.n) else null end,
        'filled', x.stamp_id is not null, 'stampId', x.stamp_id, 'clearedAt', x.cleared_at) order by g.n), '[]'::jsonb)
      into sl from generate_series(1, 9) g(n)
      left join public.passport_page_slots x on x.passport_id = pass and x.page_no = pn and x.slot_no = g.n;
    select count(*) into f from public.passport_page_slots where passport_id = pass and page_no = pn and stamp_id is not null;
    pages := pages || jsonb_build_array(jsonb_build_object(
      'pageNo', pn, 'slots', sl, 'filled', f,
      'claimable', f = 9 and not exists(select 1 from public.passport_page_claims c where c.passport_id = pass and c.page_no = pn) and (pn = 1 or title_active),
      'claimed', exists(select 1 from public.passport_page_claims c where c.passport_id = pass and c.page_no = pn),
      'locked', pn > 1 and not title_active,
      'lockReason', case when pn > 1 and not title_active then 'PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN' else null end));
  end loop;
  return jsonb_build_object('passportId', pass, 'pages', pages, 'jjinfan', title_active,
    'hearts', (select coalesce(sum(amount), 0) from public.creator_heart_ledger where app_user_id = p_user and celebrity_id = p_celebrity and source_type = 'passport_page_claim'));
end $$;

-- Admin read of the corrections still waiting for follow-up (rights_spent). service_role only; the caller must be an active, non-viewer admin.
create function public.read_passport_point_reviews(p_actor uuid, p_limit integer default 50, p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare is_admin boolean;
begin
  if p_actor is null then raise exception 'ADMIN_REQUIRED' using errcode = 'P0001'; end if;
  select exists(select 1 from public.admin_allowlist a join public.app_users u on u.verified_email = a.email
                 where u.id = p_actor and u.status = 'active' and a.active and a.role <> 'viewer') into is_admin;
  if not is_admin then raise exception 'ADMIN_REQUIRED' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', x.id, 'stampId', x.stamp_id, 'appUserId', x.app_user_id, 'celebrityId', x.celebrity_id, 'amount', x.amount,
      'reason', x.reason, 'voidReason', x.void_reason, 'source', case when x.attendance_id is not null then 'attendance' else 'action' end,
      'createdAt', x.created_at) order by x.created_at desc, x.id desc)
    from (select c.*, s.celebrity_id from public.dukjil_point_corrections c join public.community_stamps s on s.id = c.stamp_id
           where c.status = 'review' and (p_before is null or c.created_at < p_before)
           order by c.created_at desc, c.id desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) x), '[]'::jsonb);
end $$;

revoke all on function public.read_passport_point_reviews(uuid, integer, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.read_passport_point_reviews(uuid, integer, timestamptz) to service_role;

revoke all on function public.passport_policy_row(), public.passport_stamp_action(public.community_stamp_kind),
  public.assign_passport_stamp(uuid, uuid, public.community_stamp_kind, text), public.claim_passport_page(uuid, uuid, integer, text),
  public.void_passport_stamp(uuid, uuid, text, boolean, text), public.read_passport_roadmap(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.assign_passport_stamp(uuid, uuid, public.community_stamp_kind, text),
  public.claim_passport_page(uuid, uuid, integer, text), public.void_passport_stamp(uuid, uuid, text, boolean, text),
  public.read_passport_roadmap(uuid, uuid) to service_role;
