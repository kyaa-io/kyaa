-- NONFAN-MISSION-REWARD: a group mission approval on a page WITHOUT a creator (non-fan page) pays the reward shown on the
-- submission once a Dukjil policy is in effect, exactly like a page with a creator, minus what needs a creator:
--   * no passport gate (record_dukjil_action already skips it when the creator is null),
--   * no stamp (the 'mission' policy action carries a stamp, and a stamp needs a creator; DUKJIL_CELEBRITY_REQUIRED would turn the
--     payout into an open failure row). The point amount, the range check, the per-mission budget and the one-ledger-row-per-
--     submission rule are the same as for creator pages. The wallet row is the same 'group_mission' row with a null creator.
-- Idempotence is unchanged: request key = md5 of user/action/submission, one action-log row per (user, action, submission), the
-- ledger link is only written while reward_ledger_id is null. Transient errors keep using dukjil_wire_failures + retry.
-- A normal refusal of a non-fan payout (for example a restricted account) now settles the submission to 0 like on creator pages,
-- and the earnings read shows that row as 'no_reward' on any page. Rows approved earlier are NOT paid retroactively; the
-- backfill function from 20261210110000 is untouched and still only covers pages with a creator.
-- Runs once; each rewritten function is first checked to contain the expected text exactly once (twice for the earnings read).
-- Undo: tasks/NONFAN-MISSION-REWARD/revert.sql (same text as supabase/tests/fixtures/nonfan_mission_reward_revert.sql).
do $migration$
declare
  def text;
  w_old constant text := 'if found and cel is not null and m.reward_points > 0 then';
  w_new constant text := 'if found and m.reward_points > 0 then';
  a_old constant text := E'srule := rule -> ''stamp'';\n';
  a_new constant text := E'srule := rule -> ''stamp'';\n  if p_action_key = ''mission'' and p_celebrity is null then srule := null; end if;\n';
  s_old constant text := E'     and exists(select 1 from public.group_missions m join public.group_pages g on g.id = m.page_id\n                where m.id = s.mission_id and g.celebrity_id is not null)\n';
  e_old constant text := 'and exists(select 1 from public.group_pages gp where gp.id=m.page_id and gp.celebrity_id is not null)';
begin
  -- 1) approval trigger: pay pages without a creator too
  select pg_get_functiondef('public.dukjil_wire_event()'::regprocedure) into strict def;
  if (length(def) - length(replace(def, w_old, ''))) / length(w_old) <> 1 then
    raise exception 'NONFAN_MISSION_BRANCH_CHANGED: wire event'; end if;
  execute replace(def, w_old, w_new);

  -- 2) action recorder: a mission payout without a creator has no stamp
  select pg_get_functiondef('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, a_old, ''))) / length(a_old) <> 1 then
    raise exception 'NONFAN_MISSION_BRANCH_CHANGED: record action'; end if;
  execute replace(def, a_old, a_new);

  -- 3) settle helper: normal refusals settle on every page
  select pg_get_functiondef('public.dukjil_mission_settle_refused(text,uuid)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, s_old, ''))) / length(s_old) <> 1 then
    raise exception 'NONFAN_MISSION_BRANCH_CHANGED: settle helper'; end if;
  execute replace(def, s_old, '');

  -- 4) earnings read: a settled-to-0 row is 'no_reward' on any page
  select pg_get_functiondef('public.group_earning_rows(uuid,uuid)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, e_old, ''))) / length(e_old) <> 2 then
    raise exception 'NONFAN_MISSION_BRANCH_CHANGED: earnings read'; end if;
  execute replace(def, e_old, '');
end $migration$;

notify pgrst, 'reload schema';
