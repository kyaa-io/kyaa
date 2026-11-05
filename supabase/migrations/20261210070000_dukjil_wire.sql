-- PASSPORT-RENEWAL P1-WIRE: connect the actions that only the old earning paths paid to record_dukjil_action.
-- Every hook is an AFTER trigger on the table where the action becomes final, so the creator is resolved inside the
-- database with no extra server lookup. Hooks do nothing while no dukjil policy is in effect (draft keeps old behavior).
create table public.dukjil_wire_failures (
  id uuid primary key default extensions.gen_random_uuid(),
  wire text not null,
  app_user_id uuid not null,
  celebrity_id uuid,
  action_key text not null,
  source_key text not null,
  params jsonb not null default '{}'::jsonb,
  error_state text,
  error_message text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  resolved_at timestamptz,
  attempts integer not null default 0,
  gave_up_at timestamptz
);
-- one open row per event: repeated busy/failed triggers never pile up
create unique index dukjil_wire_failures_open_event on public.dukjil_wire_failures(app_user_id, action_key, source_key) where resolved_at is null;
create index dukjil_wire_failures_open_idx on public.dukjil_wire_failures(created_at) where resolved_at is null and gave_up_at is null;
alter table public.dukjil_wire_failures enable row level security;
alter table public.dukjil_wire_failures force row level security;
revoke all on public.dukjil_wire_failures from public, anon, authenticated, service_role;
create trigger dukjil_wire_failures_no_delete before delete on public.dukjil_wire_failures
  for each row execute function public.reject_fan_ticket_ledger_mutation();
create trigger dukjil_wire_failures_no_truncate before truncate on public.dukjil_wire_failures
  for each statement execute function public.reject_fan_ticket_ledger_mutation();

-- Normal rejections are not failures: caps, reuse, passport not yet issued, restricted accounts.
create function public.dukjil_wire_is_normal_rejection(p_message text) returns boolean
language sql immutable set search_path = '' as $$
  select p_message ~ '(DUKJIL_DAILY_LIMIT|SOURCE_REUSED|POLICY_INACTIVE|PASSPORT_REQUIRED|DUKJIL_CONTENT_TOO_SHORT|DUKJIL_DUPLICATE_BODY|DUKJIL_REPEAT_TARGET|FAN_WEB_ACTIVE_ACCOUNT_REQUIRED|COMMUNITY_STAMP_NOT_FOUND)'
$$;

-- Lock rationale: the caller already runs inside an activity transaction that may hold fan-web-user or other locks, while
-- group_wallet_lock takes group-wallet:owner first and fan-web-user second. Waiting for either could cross another
-- transaction. This function therefore only TRIES the exact same locks, in the group_wallet_lock set, without waiting.
-- If all three are held (or re-entered) the nested group_wallet_lock/group_wallet_post never wait on them. A busy lock is
-- recorded as DUKJIL_WIRE_LOCK_BUSY and retried by retry_dukjil_wire_failures. Nothing here can take part in a deadlock.
create function public.dukjil_wire_award(
  p_wire text, p_user uuid, p_celebrity uuid, p_action text, p_source text, p_params jsonb default '{}'
) returns void language plpgsql security definer set search_path = '' as $$
declare req uuid; msg text; st text; ctx text;
begin
  if p_user is null or not public.dukjil_policy_replaces_earning(pg_catalog.clock_timestamp()) then return; end if;
  req := pg_catalog.md5('dukjil-wire:' || p_user::text || ':' || p_action || ':' || p_source)::uuid;
  begin
    if not (pg_catalog.pg_try_advisory_xact_lock_shared(pg_catalog.hashtextextended('group-wallet:campaign-barrier', 0))
        and pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:' || p_user::text, 0))
        and pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('group-wallet:owner:' || p_user::text, 0))) then
      raise exception 'DUKJIL_WIRE_LOCK_BUSY' using errcode = 'P0001';
    end if;
    perform public.record_dukjil_action(p_user, p_celebrity, p_action, p_source, req, coalesce(p_params, '{}'::jsonb));
  exception when others then
    get stacked diagnostics msg = message_text, st = returned_sqlstate, ctx = pg_exception_context;
    if not public.dukjil_wire_is_normal_rejection(msg) then
      insert into public.dukjil_wire_failures(wire, app_user_id, celebrity_id, action_key, source_key, params, error_state, error_message)
        values (p_wire, p_user, p_celebrity, p_action, p_source, coalesce(p_params, '{}'::jsonb), st, left(msg || ' @ ' || coalesce(ctx, ''), 800))
        on conflict (app_user_id, action_key, source_key) where resolved_at is null do nothing;
    end if;
  end;
end $$;

-- Idempotent: the request key is derived from the event, so a retry of a paid event is a replay. A row is retried at most
-- 5 times and then marked gave_up_at (kept for an operator); one open row exists per event, so nothing piles up.
create function public.retry_dukjil_wire_failures(p_limit integer default 50) returns integer
language plpgsql security definer set search_path = '' as $$
declare f public.dukjil_wire_failures; n integer := 0; msg text;
begin
  if not public.dukjil_policy_replaces_earning(pg_catalog.clock_timestamp()) then return 0; end if;
  for f in select * from public.dukjil_wire_failures where resolved_at is null and gave_up_at is null
      order by created_at limit greatest(1, least(p_limit, 500)) for update skip locked loop
    begin
      if not (pg_catalog.pg_try_advisory_xact_lock_shared(pg_catalog.hashtextextended('group-wallet:campaign-barrier', 0))
          and pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:' || f.app_user_id::text, 0))
          and pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('group-wallet:owner:' || f.app_user_id::text, 0))) then
        continue;
      end if;
      perform public.record_dukjil_action(f.app_user_id, f.celebrity_id, f.action_key, f.source_key,
        pg_catalog.md5('dukjil-wire:' || f.app_user_id::text || ':' || f.action_key || ':' || f.source_key)::uuid, f.params);
      update public.dukjil_wire_failures set resolved_at = pg_catalog.clock_timestamp(), attempts = attempts + 1 where id = f.id;
      n := n + 1;
    exception when others then
      get stacked diagnostics msg = message_text;
      if public.dukjil_wire_is_normal_rejection(msg) then
        update public.dukjil_wire_failures set resolved_at = pg_catalog.clock_timestamp(), attempts = attempts + 1 where id = f.id;
      else
        update public.dukjil_wire_failures set attempts = attempts + 1, error_message = left(msg, 500),
          gave_up_at = case when attempts + 1 >= 5 then pg_catalog.clock_timestamp() end where id = f.id;
      end if;
    end;
  end loop;
  return n;
end $$;

-- ===== hooks =====
-- plan-v2 §3.1 invite: paid when the friend has joined AND finished the entry screening (holds a passport).
-- The general-fan referral is the source of truth: community_stamp_invitation_relations holds exactly one inviter per friend
-- (invitee is unique), and only a 'qualified' relation (friend registered with the code, then passed the screening) pays.
-- So the first inviter wins structurally: a second inviter has no qualified relation and gets nothing, and a first inviter
-- whose own payout is dropped by the monthly cap never hands the friend to anyone else. The friend side uses a per-friend
-- source key, so the friend's 100P is paid once whoever asks and however often the hooks fire.
-- Creator of the invite stamp: the referral carries no creator today, so the page where the friend passed the screening
-- (the qualifying quiz pass) is used. DEV DRAFT, see prod-apply-ledger.md.
create function public.dukjil_wire_invite(p_inviter uuid, p_friend uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare src text := 'invite:' || pg_catalog.md5('friend:' || p_friend::text)::uuid::text; cel uuid;
begin
  if not public.dukjil_policy_replaces_earning(pg_catalog.clock_timestamp()) then return; end if;
  if not exists(select 1 from public.fan_passports where app_user_id = p_friend) then return; end if;
  select q.celebrity_id into cel from public.community_stamp_invitation_relations r
    join public.quiz_passes q on q.id = r.qualifying_quiz_pass_id
    where r.invitee_app_user_id = p_friend and r.inviter_app_user_id = p_inviter and r.status = 'qualified';
  if not found then return; end if;
  if cel is not null and not exists(select 1 from public.celebrities c where c.id = cel and c.status = 'published' and c.archived_at is null) then
    cel := null; end if;
  perform public.dukjil_wire_award('invite', p_inviter, cel, 'invite', src);
  perform public.dukjil_wire_award('invite_friend', p_friend, null, 'invite_friend', src);
end $$;

create function public.dukjil_wire_event() returns trigger language plpgsql security definer set search_path = '' as $$
declare cel uuid; page uuid; owner_id uuid; src text; lnk public.community_stamp_share_links; reward integer; m public.group_missions;
begin
  -- The trigger runs inside the original transaction (survey submit, approval, ...). Nothing in here may break it: a
  -- failing lookup or hook is swallowed in this sub-transaction and the original write continues.
  begin
  if tg_table_name = 'quiz_passes' then
    perform public.dukjil_wire_award('quiz', new.app_user_id, new.celebrity_id, 'quiz', 'quiz:' || new.celebrity_id::text);
  elsif tg_table_name = 'live_reservations' then
    perform public.dukjil_wire_award('live_reserve', new.app_user_id, new.celebrity_id, 'live_reserve', new.live_event_id::text);
  elsif tg_table_name = 'live_attendances' then
    perform public.dukjil_wire_award('live_attend', new.app_user_id, new.celebrity_id, 'live_attend', new.live_event_id::text);
  elsif tg_table_name = 'live_survey_responses' then
    -- A survey that is a live participation mission keeps its old payout (live_participation_points 'survey'); paying the
    -- plan's survey action as well would pay it twice.
    if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted')
       and not exists(select 1 from public.live_participation_missions lm where lm.survey_id = new.survey_id) then
      perform public.dukjil_wire_award('survey', new.app_user_id, new.celebrity_id, 'survey', new.survey_id::text);
    end if;
  elsif tg_table_name = 'certification_submissions' then
    if new.status = 'approved' and new.membership_platform is not null and (tg_op = 'INSERT' or old.status is distinct from 'approved')
       and not exists(select 1 from public.live_participation_missions lm where lm.certification_mission_id is not null
         and lm.certification_mission_id = new.mission_id) then
      perform public.dukjil_wire_award('subscription', new.app_user_id, new.celebrity_id, 'subscription',
        new.celebrity_id::text || ':' || new.membership_platform::text, jsonb_build_object('platform', new.membership_platform::text));
    end if;
  elsif tg_table_name = 'community_stamp_share_visits' then
    select * into lnk from public.community_stamp_share_links where id = new.share_link_id;
    if found and lnk.owner_app_user_id <> new.visitor_app_user_id then
      perform public.dukjil_wire_award('share', lnk.owner_app_user_id, lnk.celebrity_id, 'share',
        lnk.celebrity_id::text || ':' || public.dukjil_kst_date()::text);
    end if;
  elsif tg_table_name = 'group_mission_submissions' then
    if new.status = 'completed' and old.status is distinct from 'completed' then
      select * into m from public.group_missions where id = new.mission_id;
      if found then select celebrity_id into cel from public.group_pages where id = m.page_id; end if;
      if found and cel is not null and m.reward_points > 0 then
        perform public.dukjil_wire_award('group_mission', new.app_user_id, cel, 'mission', new.id::text,
          jsonb_build_object('points', m.reward_points));
      end if;
    end if;
  elsif tg_table_name = 'group_event_registrations' then
    select p.celebrity_id into cel from public.group_events e join public.group_pages p on p.id = e.page_id where e.id = new.event_id;
    if cel is not null then
      if new.checked_in_at is not null and old.checked_in_at is null then
        perform public.dukjil_wire_award('event_checkin', new.app_user_id, cel, 'event_checkin', new.event_id::text);
      end if;
      if new.review_body is not null and old.review_body is null and new.checked_in_at is not null then
        perform public.dukjil_wire_award('event_review', new.app_user_id, cel, 'event_review', new.event_id::text,
          jsonb_build_object('chars', pg_catalog.length(pg_catalog.btrim(new.review_body))));
      end if;
    end if;
  elsif tg_table_name = 'community_stamp_invitation_relations' then
    -- the friend qualified through the general-fan referral (registered with a code, passed the entry screening)
    if new.status = 'qualified' and old.status is distinct from 'qualified' then
      perform public.dukjil_wire_invite(new.inviter_app_user_id, new.invitee_app_user_id);
    end if;
  elsif tg_table_name = 'fan_passports' then
    -- The entry screening inserts the quiz pass before the passport exists, so the pass's own payout was rejected with
    -- PASSPORT_REQUIRED. The same screening has now created the passport: pay that pass's quiz action (idempotent per source).
    perform public.dukjil_wire_award('quiz', new.app_user_id, new.celebrity_id, 'quiz', 'quiz:' || new.celebrity_id::text);
    -- and the friend who qualified earlier in this screening (the qualified state is written by the quiz pass trigger)
    select r.inviter_app_user_id into owner_id from public.community_stamp_invitation_relations r
      where r.invitee_app_user_id = new.app_user_id and r.status = 'qualified';
    if owner_id is not null then perform public.dukjil_wire_invite(owner_id, new.app_user_id); end if;
  end if;
  exception when others then
    raise warning 'dukjil_wire_event skipped on %: %', tg_table_name, sqlerrm;
  end;
  return new;
end $$;

-- B1: once the policy has taken over, new or edited mission rewards must stay inside the policy range (0 = no reward is
-- allowed and simply pays nothing). Missions created earlier keep their displayed value and are paid exactly as shown.
create function public.dukjil_mission_reward_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare pol public.dukjil_policy_versions; lo integer; hi integer;
begin
  if new.reward_points = 0 or (tg_op = 'UPDATE' and new.reward_points is not distinct from old.reward_points) then return new; end if;
  pol := public.dukjil_active_policy();
  if pol.version is null then return new; end if;
  lo := (pol.rules #>> '{actions,mission,pointsMin}')::integer; hi := (pol.rules #>> '{actions,mission,pointsMax}')::integer;
  if lo is not null and hi is not null and (new.reward_points < lo or new.reward_points > hi) then
    raise exception 'DUKJIL_MISSION_REWARD_RANGE' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger dukjil_mission_reward_guard before insert or update of reward_points on public.group_missions
  for each row execute function public.dukjil_mission_reward_guard();

create trigger zzz_dukjil_wire after insert on public.quiz_passes for each row execute function public.dukjil_wire_event();
create trigger zzz_dukjil_wire after insert on public.live_reservations for each row execute function public.dukjil_wire_event();
create trigger zzz_dukjil_wire after insert on public.live_attendances for each row execute function public.dukjil_wire_event();
create trigger zzz_dukjil_wire after insert or update on public.live_survey_responses for each row execute function public.dukjil_wire_event();
create trigger zzz_dukjil_wire after insert or update on public.certification_submissions for each row execute function public.dukjil_wire_event();
create trigger zzz_dukjil_wire after insert on public.community_stamp_share_visits for each row execute function public.dukjil_wire_event();
create trigger zzz_dukjil_wire after update on public.group_mission_submissions for each row execute function public.dukjil_wire_event();
create trigger zzz_dukjil_wire after update on public.group_event_registrations for each row execute function public.dukjil_wire_event();
create trigger zzz_dukjil_wire after update on public.community_stamp_invitation_relations for each row execute function public.dukjil_wire_event();
create trigger zzz_dukjil_wire after insert on public.fan_passports for each row execute function public.dukjil_wire_event();

-- The legacy invitation guard reads the redemption id from "invite:{uuid}". Dukjil invite stamps carry policy_version and
-- use a per-friend key ("invite:{md5 of the friend id as uuid}") that is not a redemption id, so the guard skips them.
create or replace function public.guard_qualified_community_stamp_invitation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_redemption_id uuid;
begin
  if new.kind<>'invite' then return new; end if;
  if new.source_key !~ '^invite:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    if public.dukjil_policy_replaces_earning(pg_catalog.clock_timestamp()) then return new; end if;
  end if;
  v_redemption_id:=pg_catalog.split_part(new.source_key,':',2)::uuid;
  if exists(select 1 from public.community_stamp_invitation_relations relation
      where relation.redemption_id=v_redemption_id and relation.status<>'qualified') then
    raise exception 'COMMUNITY_STAMP_INVITE_NOT_QUALIFIED' using errcode='23514';
  end if;
  return new;
end $$;

-- FIX3 item 4: the legacy referral qualification also issued an inviter-side invite stamp. After activation the policy invite
-- stamp (1 per friend, 3 per month, with the creator) replaces it, so the legacy inviter stamp is skipped to avoid a second
-- stamp for the same friend. The friend-side legacy stamp stays as it was.
do $migration$
declare old_txt constant text := E'perform public.issue_community_stamp(relation.inviter_app_user_id,null,\'invite\',\n    \'invite:\'||relation.redemption_id::text||\':inviter\');';
  new_txt constant text := E'if not public.dukjil_policy_replaces_earning(pg_catalog.clock_timestamp()) then perform public.issue_community_stamp(relation.inviter_app_user_id,null,\'invite\',\n    \'invite:\'||relation.redemption_id::text||\':inviter\'); end if;';
  def text;
begin
  select pg_get_functiondef('public.qualify_community_stamp_invitation_on_quiz_pass()'::regprocedure) into strict def;
  if (length(def) - length(replace(def, old_txt, ''))) / length(old_txt) <> 1 then
    raise exception 'DUKJIL_WIRE_BRANCH_CHANGED: legacy inviter invite stamp not found exactly once'; end if;
  execute replace(def, old_txt, new_txt);
end $migration$;

-- Group mission approval pays through group_wallet_post inside the RPC. After activation the dukjil call is the only payer.
do $migration$
declare f record; old_txt constant text := $o$entry:=public.group_wallet_post(s.app_user_id,'fan_point',m.reward_points,'group_mission',s.id);$o$;
  new_txt constant text := $n$if public.dukjil_policy_replaces_earning(clock_timestamp())then entry:=null;else entry:=public.group_wallet_post(s.app_user_id,'fan_point',m.reward_points,'group_mission',s.id);end if;$n$;
  hits integer := 0; src text;
begin
  for f in select p.oid, p.prosrc from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and position(old_txt in p.prosrc) > 0 loop
    if (length(f.prosrc) - length(replace(f.prosrc, old_txt, ''))) / length(old_txt) <> 1 then
      raise exception 'DUKJIL_WIRE_BRANCH_CHANGED: group mission payout occurs more than once in %', f.oid::regproc; end if;
    hits := hits + 1;
    execute replace(pg_get_functiondef(f.oid), old_txt, new_txt);
  end loop;
  if hits <> 1 then raise exception 'DUKJIL_WIRE_BRANCH_CHANGED: group mission payout found in % functions', hits; end if;
end $migration$;

revoke all on function public.dukjil_wire_is_normal_rejection(text), public.dukjil_wire_award(text, uuid, uuid, text, text, jsonb),
  public.retry_dukjil_wire_failures(integer), public.dukjil_wire_event(), public.dukjil_wire_invite(uuid, uuid), public.dukjil_mission_reward_guard(), public.guard_qualified_community_stamp_invitation() from public, anon, authenticated, service_role;
grant execute on function public.retry_dukjil_wire_failures(integer) to service_role;

-- Retry schedule: same pg_cron pattern as wave-engagement-retention. A no-op until a policy is active.
select cron.schedule('dukjil-wire-retry', '*/5 * * * *', 'select public.retry_dukjil_wire_failures()');
