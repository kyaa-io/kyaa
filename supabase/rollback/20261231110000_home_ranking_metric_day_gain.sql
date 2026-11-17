-- Rolls back 20261231110000_home_ranking_metric_day_gain. The web reads missing or null gains as "no +N", so web order does not matter.
begin;
set local lock_timeout = '5s';

do $patch$
declare def text; f text; i integer;
  fns constant text[] := array['public.read_home_fan_ranking_v3(uuid,text,integer)', 'public.read_home_fan_ranking_v3(uuid,text,integer)',
                               'public.read_home_creator_ranking_v3(text,text,integer)', 'public.read_home_creator_ranking_v3(text,text,integer)'];
  plains constant text[] := array[
    $a$'delta', v.delta, 'fans', v.jjinfan_count,$a$,
    $a$'weekGainDays', null, 'metric', 'points'$a$,
    $a$'weekGain', null, 'dayGain', null$a$,
    $a$'weekGainDays', null, 'metric', 'likes'$a$];
  patched constant text[] := array[
    $b$'delta', v.delta, 'fans', v.jjinfan_count,
      'dayGain', (select g.score from public.home_ranking_daily g where g.kind = 'fan_point_day' and g.day = h.day and g.subject_id = v.subject_id),
      'weekGain', (select g.score from public.home_ranking_daily g where g.kind = 'fan_point_week' and g.day = h.day and g.subject_id = v.subject_id),$b$,
    $b$'weekGainDays', 7, 'metric', 'points'$b$,
    $b$'weekGain', (select g.score from public.home_ranking_daily g where g.kind = 'creator_like_week' and g.day = h.day and g.subject_id = s.subject_id),
      'dayGain', (select g.score from public.home_ranking_daily g where g.kind = 'creator_like_day' and g.day = h.day and g.subject_id = s.subject_id)$b$,
    $b$'weekGainDays', 7, 'metric', 'likes'$b$];
begin
  for i in 1 .. array_length(fns, 1) loop
    f := fns[i];
    def := pg_catalog.pg_get_functiondef(f::regprocedure);
    if position(patched[i] in def) > 0 then execute replace(def, patched[i], plains[i]); end if;
  end loop;
end $patch$;
commit;

notify pgrst, 'reload schema';
