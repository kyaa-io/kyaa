-- PASSPORT-RENEWAL P1-MISSION-NO-PASSPORT: a group mission approval that the Dukjil policy refuses (member has no passport for
-- the page's creator, contract.md:447-448: no payout, no retroactive payout, no retry, no failure row) must say so on the
-- submission: reward_points = 0 instead of the displayed value with an empty ledger link, which the earnings read shows as an
-- endless 'pending' payout.
-- Scope: only missions of a page that has a creator (group_pages.celebrity_id). Pages without a creator (non-fan pages) are left
-- as they are: whether their missions pay is a business decision this migration does not make.
-- Only the submission row changes; group_missions.reward_points (the shown value) is untouched. A payout that is waiting for a
-- retry (an open dukjil_wire_failures row: lock busy, transient error, gave up) keeps reward_points and stays 'pending'.
-- The approval answer is built from the stored row after the update (group_activity_submission_json), so it follows the settled value.
-- Runs once: a second run fails at the first create function; each rewritten function is first checked to contain the
-- expected text exactly once (twice for the earnings read). Undo: tasks/P1-MISSION-NO-PASSPORT/revert.sql.

create function public.dukjil_mission_settle_refused(p_source text, p_ignore_failure uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_source is null or p_source !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  if not public.dukjil_policy_replaces_earning(pg_catalog.clock_timestamp()) then return; end if;
  update public.group_mission_submissions s set reward_points = 0
   where s.id = p_source::uuid and s.status = 'completed' and s.reward_points > 0 and s.reward_ledger_id is null
     -- a mission of a page with a creator, approved while a non-draft policy was effective
     and exists(select 1 from public.group_missions m join public.group_pages g on g.id = m.page_id
                where m.id = s.mission_id and g.celebrity_id is not null)
     and exists(select 1 from public.dukjil_policy_versions dv where dv.status <> 'draft' and dv.effective_from <= s.reviewed_at)
     and not exists(select 1 from public.dukjil_action_log l
                    where l.app_user_id = s.app_user_id and l.action_key = 'mission' and l.source_key = s.id::text)
     and not exists(select 1 from public.dukjil_wire_failures f
                    where f.app_user_id = s.app_user_id and f.action_key = 'mission' and f.source_key = s.id::text
                      and f.resolved_at is null and f.id is distinct from p_ignore_failure);
end $$;
revoke all on function public.dukjil_mission_settle_refused(text, uuid) from public, anon, authenticated, service_role;

-- Backfill: settles only rows approved while the policy was effective, on a page with a creator, whose member has no passport
-- for that creator. Rows with a passport and no payout record (a silent payout failure), rows approved before the policy took
-- effect and rows of pages without a creator are not touched; their counts are reported as a notice.
create function public.dukjil_mission_settle_backfill() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; settled integer := 0; with_passport integer; before_policy integer; no_creator integer;
begin
  for r in select s.id from public.group_mission_submissions s
             join public.group_missions m on m.id = s.mission_id join public.group_pages g on g.id = m.page_id
           where s.status = 'completed' and s.reward_points > 0 and s.reward_ledger_id is null and g.celebrity_id is not null
             and exists(select 1 from public.dukjil_policy_versions dv where dv.status <> 'draft' and dv.effective_from <= s.reviewed_at)
             and not exists(select 1 from public.fan_passports p where p.app_user_id = s.app_user_id and p.celebrity_id = g.celebrity_id)
  loop
    perform public.dukjil_mission_settle_refused(r.id::text);
  end loop;
  select count(*) into settled from public.group_mission_submissions s
    join public.group_missions m on m.id = s.mission_id
   where s.status = 'completed' and s.reward_points = 0 and s.reward_ledger_id is null and m.reward_points > 0;
  select count(*) into with_passport from public.group_mission_submissions s
    join public.group_missions m on m.id = s.mission_id join public.group_pages g on g.id = m.page_id
   where s.status = 'completed' and s.reward_points > 0 and s.reward_ledger_id is null and g.celebrity_id is not null
     and exists(select 1 from public.dukjil_policy_versions dv where dv.status <> 'draft' and dv.effective_from <= s.reviewed_at)
     and exists(select 1 from public.fan_passports p where p.app_user_id = s.app_user_id and p.celebrity_id = g.celebrity_id);
  select count(*) into before_policy from public.group_mission_submissions s
   where s.status = 'completed' and s.reward_points > 0 and s.reward_ledger_id is null
     and not exists(select 1 from public.dukjil_policy_versions dv where dv.status <> 'draft' and dv.effective_from <= s.reviewed_at);
  select count(*) into no_creator from public.group_mission_submissions s
    join public.group_missions m on m.id = s.mission_id join public.group_pages g on g.id = m.page_id
   where s.status = 'completed' and s.reward_points > 0 and s.reward_ledger_id is null and g.celebrity_id is null;
  raise notice 'DUKJIL_MISSION_SETTLE_BACKFILL: settled rows (payout 0, no ledger link) %, left pending with a passport but no payout record %, left pending approved before the policy %, left pending on a page without a creator %',
    settled, with_passport, before_policy, no_creator;
  return settled;
end $$;
revoke all on function public.dukjil_mission_settle_backfill() from public, anon, authenticated, service_role;

do $migration$
declare
  def text;
  -- 1) approval trigger: settle right after the payout attempt
  w_old constant text := E'jsonb_build_object(''points'', m.reward_points));\n      end if;';
  w_new constant text := E'jsonb_build_object(''points'', m.reward_points));\n      end if;\n      if found and m.reward_points > 0 then perform public.dukjil_mission_settle_refused(new.id::text); end if;';
  -- 2) retry job: a retry that ends in a normal refusal settles too
  r_old constant text := 'if public.dukjil_wire_is_normal_rejection(msg) then';
  r_new constant text := 'if public.dukjil_wire_is_normal_rejection(msg) then if f.action_key = ''mission'' then perform public.dukjil_mission_settle_refused(f.source_key, f.id); end if;';
begin
  select pg_get_functiondef('public.dukjil_wire_event()'::regprocedure) into strict def;
  if (length(def) - length(replace(def, w_old, ''))) / length(w_old) <> 1 then
    raise exception 'DUKJIL_MISSION_SETTLE_BRANCH_CHANGED: wire event'; end if;
  execute replace(def, w_old, w_new);

  select pg_get_functiondef('public.retry_dukjil_wire_failures(integer)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, r_old, ''))) / length(r_old) <> 1 then
    raise exception 'DUKJIL_MISSION_SETTLE_BRANCH_CHANGED: retry'; end if;
  execute replace(def, r_old, r_new);
end $migration$;

-- Earnings read: a completed mission row with payout 0, no ledger link and a mission that still shows a reward is valid
-- ('no_reward', amount 0) only when a non-draft Dukjil policy was effective at review time and the page has a creator (the
-- refused payout). Before the policy and on pages without a creator it still fails loudly, exactly as before.
do $migration$
declare
  def text;
  e_old constant text := 'm.reward_points=0 and s.reward_points=0 and s.reward_ledger_id is null';
  e_new constant text := '(s.reward_points=0 and s.reward_ledger_id is null and(m.reward_points=0 or(exists(select 1 from public.dukjil_policy_versions dv where dv.status<>''draft''and dv.effective_from<=s.reviewed_at)and exists(select 1 from public.group_pages gp where gp.id=m.page_id and gp.celebrity_id is not null))))';
begin
  select pg_get_functiondef('public.group_earning_rows(uuid,uuid)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, e_old, ''))) / length(e_old) <> 2 then
    raise exception 'DUKJIL_MISSION_SETTLE_BRANCH_CHANGED: earnings read'; end if;
  execute replace(def, e_old, e_new);
end $migration$;

select public.dukjil_mission_settle_backfill();
