-- After 20261211060000: the non-fan mission pays once; creator pages and the legacy path are unchanged; the revert restores the old text.
\set expect ok
\ir nonfan_mission_reward_probe.sql

begin;
\ir nonfan_mission_reward_revert.sql
do $$
begin
  if position('cel is not null and m.reward_points > 0' in pg_get_functiondef('public.dukjil_wire_event()'::regprocedure)) = 0
     or position('p_celebrity is null then srule' in pg_get_functiondef('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)'::regprocedure)) > 0
     or position('g.celebrity_id is not null' in pg_get_functiondef('public.dukjil_mission_settle_refused(text,uuid)'::regprocedure)) = 0
     or position('gp.celebrity_id is not null' in pg_get_functiondef('public.group_earning_rows(uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'revert must restore the old function text';
  end if;
end $$;
rollback;
