-- PASSPORT-RENEWAL FIX3 item 6: group mission earnings keep reading after the Dukjil policy takes over the payout.
-- After activation the approval RPC no longer posts the reward itself; record_dukjil_action posts the same 'group_mission'
-- wallet row and links it on the submission, so the existing rule (ledger row of source group_mission = submission) holds.
-- While that payout waits for a retry (wire failure / busy lock) the submission is completed with reward_points > 0 and no
-- ledger row yet. That state is shown as 'pending' with no amount instead of failing the whole list with
-- GROUP_EARNINGS_INCONSISTENT. It only applies when a non-draft Dukjil policy was already effective at review time, so a
-- pre-activation inconsistency still fails loudly.
do $migration$
declare
  def text;
  pending_payout constant text := $p$(s.status='completed'and s.reward_points>0 and s.reward_ledger_id is null and exists(select 1 from public.dukjil_policy_versions dv where dv.status<>'draft'and dv.effective_from<=s.reviewed_at))$p$;
  a_old constant text := $o$when m.reward_points=0 and s.reward_points=0 and s.reward_ledger_id is null then 'no_reward'else 'credited'end status,$o$;
  b_old constant text := $o$case when s.status='completed'then s.reward_points::bigint end original_amount,$o$;
  c_old constant text := $o$case when s.status='completed'then s.reward_points::bigint end net_amount,$o$;
  d_old constant text := $o$case when s.status='completed'then (m.reward_points=0 and s.reward_points=0 and s.reward_ledger_id is null)or(s.reward_points>0 and l.id$o$;
begin
  select pg_get_functiondef('public.group_earning_rows(uuid,uuid)'::regprocedure) into strict def;
  if (select count(*) from unnest(array[a_old,b_old,c_old,d_old]) o
       where (length(def) - length(replace(def, o, ''))) / length(o) = 1) <> 4 then
    raise exception 'DUKJIL_EARNINGS_CONTRACT_CHANGED'; end if;
  def := replace(def, a_old, replace(a_old, 'else ''credited''', 'when ' || pending_payout || ' then ''pending''else ''credited'''));
  def := replace(def, b_old, 'case when s.status=''completed''and not ' || pending_payout || ' then s.reward_points::bigint end original_amount,');
  def := replace(def, c_old, 'case when s.status=''completed''and not ' || pending_payout || ' then s.reward_points::bigint end net_amount,');
  def := replace(def, d_old, 'case when s.status=''completed''then (m.reward_points=0 and s.reward_points=0 and s.reward_ledger_id is null)or ' || pending_payout || ' or(s.reward_points>0 and l.id');
  execute def;
end $migration$;
