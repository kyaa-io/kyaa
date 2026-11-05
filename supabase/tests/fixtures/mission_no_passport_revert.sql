-- Undo 20261210110000_mission_no_passport_zero.sql (functions only). Run in one transaction as the migration owner.
-- Reverse-replaces new -> old in the three rewritten functions (strings mirror the migration exactly), then drops the helpers.
-- It does NOT restore rows already settled to 0: see the list from ro-after-apply.sql (completed, ledger null, reward 0, mission reward > 0)
-- and set reward_points back to the mission's reward_points for those rows only if they were settled by the migration.
do $revert$
declare
  def text;
  w_old constant text := E'jsonb_build_object(''points'', m.reward_points));\n      end if;';
  w_new constant text := E'jsonb_build_object(''points'', m.reward_points));\n      end if;\n      if found and m.reward_points > 0 then perform public.dukjil_mission_settle_refused(new.id::text); end if;';
  r_old constant text := 'if public.dukjil_wire_is_normal_rejection(msg) then';
  r_new constant text := 'if public.dukjil_wire_is_normal_rejection(msg) then if f.action_key = ''mission'' then perform public.dukjil_mission_settle_refused(f.source_key, f.id); end if;';
  e_old constant text := 'm.reward_points=0 and s.reward_points=0 and s.reward_ledger_id is null';
  e_new constant text := '(s.reward_points=0 and s.reward_ledger_id is null and(m.reward_points=0 or(exists(select 1 from public.dukjil_policy_versions dv where dv.status<>''draft''and dv.effective_from<=s.reviewed_at)and exists(select 1 from public.group_pages gp where gp.id=m.page_id and gp.celebrity_id is not null))))';
begin
  select pg_get_functiondef('public.dukjil_wire_event()'::regprocedure) into strict def;
  if (length(def) - length(replace(def, w_new, ''))) / length(w_new) <> 1 then raise exception 'REVERT_ANCHOR: wire event'; end if;
  execute replace(def, w_new, w_old);
  select pg_get_functiondef('public.retry_dukjil_wire_failures(integer)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, r_new, ''))) / length(r_new) <> 1 then raise exception 'REVERT_ANCHOR: retry'; end if;
  execute replace(def, r_new, r_old);
  select pg_get_functiondef('public.group_earning_rows(uuid,uuid)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, e_new, ''))) / length(e_new) <> 2 then raise exception 'REVERT_ANCHOR: earnings read'; end if;
  execute replace(def, e_new, e_old);
end $revert$;
drop function public.dukjil_mission_settle_backfill();
drop function public.dukjil_mission_settle_refused(text, uuid);
