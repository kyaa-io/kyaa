-- Rolls back 20261224000400_home_ranking_fan_activity_totals. The web ignores missing keys, so web order does not matter.
begin;
set local lock_timeout = '5s';

do $patch$
declare def text;
  plain constant text := $a$'tickets', public.home_ranking_ticket_balance(v.subject_id), 'tier', v.tier,$a$;
  patched constant text := $b$'tickets', public.home_ranking_ticket_balance(v.subject_id), 'tier', v.tier,
      'attendanceDays', (public.home_ranking_fan_activity(v.subject_id) ->> 'attendanceDays')::integer, 'posts', (public.home_ranking_fan_activity(v.subject_id) ->> 'posts')::integer,$b$;
begin
  def := pg_catalog.pg_get_functiondef('public.read_home_fan_ranking_v3(uuid,text,integer)'::regprocedure);
  if position(patched in def) > 0 then execute replace(def, patched, plain); end if;
end $patch$;
drop function if exists public.home_ranking_fan_activity(uuid);
commit;

notify pgrst, 'reload schema';
