-- PRE-CHECK before reverting: run ro-after-apply.sql and look at settled_to_zero_nonfan_rows.
-- A completed non-fan submission that this migration settled to 0 (mission reward > 0, no ledger) reads as invalid after the revert
-- (the earnings read goes back to creator pages only) and the member's earnings list for that page fails with GROUP_EARNINGS_INCONSISTENT.
-- If the count is above 0, do not revert yet: decide with the owner how to handle those rows first (for example restore their shown
-- value from the mission amount in a separate, approved data fix).
-- Undo 20261211060000_nonfan_mission_reward.sql (functions only). Run in one transaction as the migration owner.
-- Puts the four rewritten functions back to the 20261210110000 text. It does NOT touch wallet rows or submissions already paid
-- after the migration: they are real payouts. List them first with ro-after-apply.sql and decide separately.
do $revert$
declare
  def text;
  w_old constant text := E'if found and cel is not null and m.reward_points > 0 then\n';
  w_new constant text := E'if found and m.reward_points > 0 then\n';
  a_old constant text := E'srule := rule -> ''stamp'';\n';
  a_new constant text := E'srule := rule -> ''stamp'';\n  if p_action_key = ''mission'' and p_celebrity is null then srule := null; end if;\n';
  s_old constant text := E'     and exists(select 1 from public.group_missions m join public.group_pages g on g.id = m.page_id\n                where m.id = s.mission_id and g.celebrity_id is not null)\n';
  s_anchor constant text := E'     -- a mission of a page with a creator, approved while a non-draft policy was effective\n';
  e_old constant text := 'and exists(select 1 from public.group_pages gp where gp.id=m.page_id and gp.celebrity_id is not null)';
  e_anchor constant text := 'dv.effective_from<=s.reviewed_at))))';
begin
  select pg_get_functiondef('public.dukjil_wire_event()'::regprocedure) into strict def;
  if (length(def) - length(replace(def, w_new, ''))) / length(w_new) <> 1 then raise exception 'REVERT_ANCHOR: wire event'; end if;
  execute replace(def, w_new, w_old);
  select pg_get_functiondef('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, a_new, ''))) / length(a_new) <> 1 then raise exception 'REVERT_ANCHOR: record action'; end if;
  execute replace(def, a_new, a_old);
  select pg_get_functiondef('public.dukjil_mission_settle_refused(text,uuid)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, s_anchor, ''))) / length(s_anchor) <> 1 then raise exception 'REVERT_ANCHOR: settle helper'; end if;
  execute replace(def, s_anchor, s_anchor || s_old);
  select pg_get_functiondef('public.group_earning_rows(uuid,uuid)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, e_anchor, ''))) / length(e_anchor) <> 2 then raise exception 'REVERT_ANCHOR: earnings read'; end if;
  execute replace(def, e_anchor, 'dv.effective_from<=s.reviewed_at)' || e_old || ')))');
end $revert$;
