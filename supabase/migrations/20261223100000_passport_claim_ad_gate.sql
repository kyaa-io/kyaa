-- 대표 11/11 + 감독 11:46 (Codex #137/#138): a passport page heart is paid only after a rewarded ad, the same contract as the ticket exchange.
--
-- A heart is paid when all four hold: the page has 9 stamps, the member's own server-issued session for that page was reported 'granted'
-- (the client reports it on GPT rewardedSlotGranted only; closing the ad never reports it), that session is consumed once in the same
-- transaction as the heart, and the page has no heart yet (passport_page_claims, unchanged).
-- Sessions live in their own table (not group_wallet_ad_sessions) so a heart session can never pay a ticket and a ticket session never a heart;
-- they do not count toward the ticket daily cap. Limits come from the same server configuration as the ticket exchange; no defaults.
--
--   issue_owned_passport_claim_ad_session(user, celebrity, page, ttl, issue_limit, window): refuses before the ad when the page cannot be
--     claimed (PASSPORT_REQUIRED, PASSPORT_PAGE_NOT_COMPLETE, PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN); hands back a granted unspent session for the same page.
--   report_owned_passport_claim_ad_session(user, session, 'shown'|'granted', min_watch): server clock; a 'granted' sooner than min_watch voids it.
--   claim_passport_page_with_ad(user, celebrity, page, request_key, session): consumes the session and calls claim_passport_page.
--     A page already claimed replays only with the session that claimed it.
-- claim_passport_page(uuid,uuid,integer,text) stays (its body is unchanged) but the API role loses EXECUTE, so no ad-less path is left.
--
-- Rollback: supabase/rollback/20261223100000_passport_claim_ad_gate.sql (database first, then the web build that still sends no session).
begin;
set local lock_timeout = '5s';

create table public.passport_claim_ad_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id),
  passport_id uuid not null references public.fan_passports(id),
  page_no integer not null check (page_no >= 1),
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  shown_at timestamptz,
  granted_at timestamptz,
  consumed_at timestamptz,
  consumed_request_key text,
  voided_at timestamptz,
  void_reason text check (void_reason in ('expired', 'replaced', 'too_fast')),
  check ((voided_at is null) = (void_reason is null)),
  check (expires_at > issued_at),
  check (shown_at is null or shown_at >= issued_at),
  check (granted_at is null or (shown_at is not null and granted_at >= shown_at)),
  check (consumed_at is null or granted_at is not null),
  check ((consumed_at is null) = (consumed_request_key is null)),
  check (consumed_at is null or voided_at is null)
);
-- At most one unused session per member, and one consumed session per page (one heart per page).
create unique index passport_claim_ad_sessions_open on public.passport_claim_ad_sessions (app_user_id) where consumed_at is null and voided_at is null;
create unique index passport_claim_ad_sessions_page on public.passport_claim_ad_sessions (passport_id, page_no) where consumed_at is not null;
create index passport_claim_ad_sessions_user_issued on public.passport_claim_ad_sessions (app_user_id, issued_at);
create trigger passport_claim_ad_sessions_no_delete before delete on public.passport_claim_ad_sessions for each row execute function public.reject_fan_ticket_ledger_mutation();
create trigger passport_claim_ad_sessions_no_truncate before truncate on public.passport_claim_ad_sessions for each statement execute function public.reject_fan_ticket_ledger_mutation();
alter table public.passport_claim_ad_sessions enable row level security;
alter table public.passport_claim_ad_sessions force row level security;
revoke all on table public.passport_claim_ad_sessions from public, anon, authenticated, service_role;

create function public.issue_owned_passport_claim_ad_session(
  p_user uuid, p_celebrity uuid, p_page_no integer, p_ttl_seconds integer, p_issue_limit integer, p_issue_window_seconds integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare pass uuid; filled integer; cur public.passport_claim_ad_sessions%rowtype; fresh public.passport_claim_ad_sessions%rowtype; at_time timestamptz := clock_timestamp();
begin
  if p_user is null or p_celebrity is null or p_page_no is null or p_page_no < 1 then raise exception 'PASSPORT_PAGE_NOT_COMPLETE' using errcode = 'P0001'; end if;
  perform public.group_wallet_lock(p_user, true);
  perform public.group_wallet_ad_need(array[p_ttl_seconds, p_issue_limit, p_issue_window_seconds]);
  select id into pass from public.fan_passports where app_user_id = p_user and celebrity_id = p_celebrity;
  if pass is null then raise exception 'PASSPORT_REQUIRED' using errcode = 'P0001'; end if;
  -- Refuse before any ad when the claim could not succeed afterwards (same checks as claim_passport_page).
  if exists (select 1 from public.passport_page_claims where passport_id = pass and page_no = p_page_no) then raise exception 'PASSPORT_PAGE_NOT_COMPLETE' using errcode = 'P0001'; end if;
  select count(*) into filled from public.passport_page_slots where passport_id = pass and page_no = p_page_no and stamp_id is not null;
  if filled < 9 then raise exception 'PASSPORT_PAGE_NOT_COMPLETE' using errcode = 'P0001'; end if;
  if p_page_no > 1 and not exists (select 1 from public.jjinfan_titles t where t.app_user_id = p_user and t.celebrity_id = p_celebrity and t.revoked_at is null) then
    raise exception 'PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN' using errcode = 'P0001'; end if;
  update public.passport_claim_ad_sessions set voided_at = at_time, void_reason = 'expired'
   where app_user_id = p_user and consumed_at is null and voided_at is null and expires_at <= at_time;
  select * into cur from public.passport_claim_ad_sessions where app_user_id = p_user and consumed_at is null and voided_at is null;
  -- A watched but unspent session for the same page is handed back instead of making the member watch again.
  if found and cur.granted_at is not null and cur.passport_id = pass and cur.page_no = p_page_no then
    return jsonb_build_object('sessionId', cur.id, 'status', 'granted', 'expiresAt', cur.expires_at);
  end if;
  if (select count(*) from public.passport_claim_ad_sessions where app_user_id = p_user and issued_at > at_time - make_interval(secs => p_issue_window_seconds)) >= p_issue_limit then
    raise exception 'GROUP_WALLET_AD_RATE_LIMITED' using errcode = 'P0001'; end if;
  if found then update public.passport_claim_ad_sessions set voided_at = at_time, void_reason = 'replaced' where id = cur.id; end if;
  insert into public.passport_claim_ad_sessions (app_user_id, passport_id, page_no, issued_at, expires_at)
    values (p_user, pass, p_page_no, at_time, at_time + make_interval(secs => p_ttl_seconds)) returning * into fresh;
  return jsonb_build_object('sessionId', fresh.id, 'status', 'issued', 'expiresAt', fresh.expires_at);
end $$;

create function public.report_owned_passport_claim_ad_session(p_user uuid, p_session_id uuid, p_event text, p_min_watch_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare rec public.passport_claim_ad_sessions%rowtype; at_time timestamptz := clock_timestamp();
begin
  perform public.group_wallet_lock(p_user, true);
  if p_session_id is null or p_event is null or p_event not in ('shown', 'granted') then raise exception 'GROUP_WALLET_INVALID' using errcode = 'P0001'; end if;
  perform public.group_wallet_ad_need(array[p_min_watch_seconds]);
  select * into rec from public.passport_claim_ad_sessions where id = p_session_id and app_user_id = p_user for update;
  if not found or rec.consumed_at is not null or rec.voided_at is not null or rec.expires_at <= at_time then raise exception 'GROUP_WALLET_AD_SESSION_INVALID' using errcode = 'P0001'; end if;
  if p_event = 'shown' then
    if rec.shown_at is null then update public.passport_claim_ad_sessions set shown_at = at_time where id = rec.id returning * into rec; end if;
  else
    if rec.shown_at is null then raise exception 'GROUP_WALLET_AD_SESSION_INVALID' using errcode = 'P0001'; end if;
    if rec.granted_at is null then
      if at_time - rec.shown_at < make_interval(secs => p_min_watch_seconds) then
        update public.passport_claim_ad_sessions set voided_at = at_time, void_reason = 'too_fast' where id = rec.id;
        return jsonb_build_object('sessionId', rec.id, 'status', 'invalid', 'expiresAt', rec.expires_at);
      end if;
      update public.passport_claim_ad_sessions set granted_at = at_time where id = rec.id returning * into rec;
    end if;
  end if;
  return jsonb_build_object('sessionId', rec.id, 'status', case when rec.granted_at is not null then 'granted' else 'shown' end, 'expiresAt', rec.expires_at);
end $$;

create function public.claim_passport_page_with_ad(p_user uuid, p_celebrity uuid, p_page_no integer, p_request_key text, p_ad_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pass uuid; sess public.passport_claim_ad_sessions%rowtype; r jsonb; at_time timestamptz := clock_timestamp();
begin
  if p_ad_session_id is null then raise exception 'GROUP_WALLET_AD_SESSION_REQUIRED' using errcode = 'P0001'; end if;
  perform public.group_wallet_lock(p_user, true);
  select id into pass from public.fan_passports where app_user_id = p_user and celebrity_id = p_celebrity;
  if pass is null then raise exception 'PASSPORT_REQUIRED' using errcode = 'P0001'; end if;
  select * into sess from public.passport_claim_ad_sessions where id = p_ad_session_id and app_user_id = p_user and passport_id = pass and page_no = p_page_no for update;
  if not found then raise exception 'GROUP_WALLET_AD_SESSION_INVALID' using errcode = 'P0001'; end if;
  if exists (select 1 from public.passport_page_claims where passport_id = pass and page_no = p_page_no) then
    -- Replay (a lost answer): only the session that paid this page reads the first result again.
    if sess.consumed_at is null then raise exception 'GROUP_WALLET_AD_SESSION_INVALID' using errcode = 'P0001'; end if;
    return public.claim_passport_page(p_user, p_celebrity, p_page_no, p_request_key);
  end if;
  if sess.consumed_at is not null or sess.voided_at is not null or sess.granted_at is null or sess.expires_at <= at_time then
    raise exception 'GROUP_WALLET_AD_SESSION_INVALID' using errcode = 'P0001'; end if;
  r := public.claim_passport_page(p_user, p_celebrity, p_page_no, p_request_key);
  update public.passport_claim_ad_sessions set consumed_at = at_time, consumed_request_key = p_request_key where id = sess.id;
  return r;
end $$;

revoke all on function public.issue_owned_passport_claim_ad_session(uuid, uuid, integer, integer, integer, integer),
  public.report_owned_passport_claim_ad_session(uuid, uuid, text, integer),
  public.claim_passport_page_with_ad(uuid, uuid, integer, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.issue_owned_passport_claim_ad_session(uuid, uuid, integer, integer, integer, integer),
  public.report_owned_passport_claim_ad_session(uuid, uuid, text, integer),
  public.claim_passport_page_with_ad(uuid, uuid, integer, text, uuid) to service_role;
-- The ad-less claim is no longer callable from the API role.
revoke execute on function public.claim_passport_page(uuid, uuid, integer, text) from public, anon, authenticated, service_role;

-- Owner rights (20261210137000 lesson): on AWS the callees can be owned by another role than these new functions. Grant what is missing; the check fails the migration instead of hiding a gap.
do $owner$
declare r record;
begin
  for r in
    select distinct o.rolname, c.oid::regprocedure::text as sig
      from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid = f.proowner
      join pg_catalog.pg_proc c on c.oid in ('public.group_wallet_lock(uuid,boolean)'::regprocedure, 'public.group_wallet_ad_need(integer[])'::regprocedure, 'public.claim_passport_page(uuid,uuid,integer,text)'::regprocedure)
     where f.oid in ('public.issue_owned_passport_claim_ad_session(uuid,uuid,integer,integer,integer,integer)'::regprocedure,
                     'public.report_owned_passport_claim_ad_session(uuid,uuid,text,integer)'::regprocedure,
                     'public.claim_passport_page_with_ad(uuid,uuid,integer,text,uuid)'::regprocedure)
       and not o.rolsuper and not pg_catalog.has_function_privilege(o.oid, c.oid, 'EXECUTE')
  loop
    execute format('grant execute on function %s to %I', r.sig, r.rolname);
  end loop;
end $owner$;

notify pgrst, 'reload schema';
commit;
