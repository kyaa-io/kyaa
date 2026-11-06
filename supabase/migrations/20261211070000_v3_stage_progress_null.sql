-- Policy v3 stage progress: Bronze, Silver 1 and Silver 2 have no heart minimum of their own (all 0 in
-- 20261210134000_heart_tier_v3.sql; they are decided by passport slots, not hearts). get_fan_stage_progress cannot express
-- a "next" stage whose minimum is not above the current one, and the app rejects that shape, which turned the whole
-- /api/me/summary?tierStages=1 response into a 503 for every passport holder at Bronze or Silver. Return no stage progress
-- (null) in exactly that case. No policy value changes; v1/v2 output is identical.
do $migration$
declare
  def text;
  a constant text := E'  from selected;';
  b constant text := E'  from selected\n  where selected.policy_version < 3 or selected.next_key is null or selected.next_minimum_score > selected.minimum_score;';
begin
  select pg_get_functiondef('public.get_fan_stage_progress(integer,text)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, a, ''))) / length(a) <> 1 then
    raise exception 'V3_STAGE_PROGRESS_ANCHOR_CHANGED'; end if;
  execute replace(def, a, b);
end $migration$;
