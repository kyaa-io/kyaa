-- RANK-DAYGAIN-DATA-1117 (감독 11/17 18:2x): the points and likes lists answer each row's gain today and over the last seven days.
--   dayGain   the row's score in the same build's *_day kind: points earned since today 00:00 KST (fan_point_day) or page likes completed since
--             then (creator_like_day). weekGain is the *_week kind (today and the six days before, 00:00 KST), so weekGainDays is 7.
--   source    the build that already ranks the day and week tabs (build_home_metric_rankings, 20261222140000) writes every listed subject to all
--             three kinds in one transaction, so the gain is the same count as the Today and 7-day scores. Two primary-key reads per answered row.
-- Every period answers the keys; the screen hides +N on the Today tab. Nothing else about the lists changes.
-- Order: database first, then web (the web already reads dayGain / weekGain). Rollback: supabase/rollback/20261231110000_home_ranking_metric_day_gain.sql
begin;
set local lock_timeout = '5s';

do $patch$
declare def text; owner_name text; f text; old_text text; new_text text; i integer;
  fns constant text[] := array['public.read_home_fan_ranking_v3(uuid,text,integer)', 'public.read_home_fan_ranking_v3(uuid,text,integer)',
                               'public.read_home_creator_ranking_v3(text,text,integer)', 'public.read_home_creator_ranking_v3(text,text,integer)'];
  olds constant text[] := array[
    $a$'delta', v.delta, 'fans', v.jjinfan_count,$a$,
    $a$'weekGainDays', null, 'metric', 'points'$a$,
    $a$'weekGain', null, 'dayGain', null$a$,
    $a$'weekGainDays', null, 'metric', 'likes'$a$];
  news constant text[] := array[
    $b$'delta', v.delta, 'fans', v.jjinfan_count,
      'dayGain', (select g.score from public.home_ranking_daily g where g.kind = 'fan_point_day' and g.day = h.day and g.subject_id = v.subject_id),
      'weekGain', (select g.score from public.home_ranking_daily g where g.kind = 'fan_point_week' and g.day = h.day and g.subject_id = v.subject_id),$b$,
    $b$'weekGainDays', 7, 'metric', 'points'$b$,
    $b$'weekGain', (select g.score from public.home_ranking_daily g where g.kind = 'creator_like_week' and g.day = h.day and g.subject_id = s.subject_id),
      'dayGain', (select g.score from public.home_ranking_daily g where g.kind = 'creator_like_day' and g.day = h.day and g.subject_id = s.subject_id)$b$,
    $b$'weekGainDays', 7, 'metric', 'likes'$b$];
begin
  for i in 1 .. array_length(fns, 1) loop
    f := fns[i]; old_text := olds[i]; new_text := news[i];
    select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid = f::regprocedure;
    if owner_name in ('anon','authenticated','service_role') or not pg_catalog.pg_has_role(current_user, owner_name, 'USAGE') then
      raise exception 'RANK_DAYGAIN_OWNER_GAP: cannot replace % owned by %', f, owner_name;
    end if;
    def := pg_catalog.pg_get_functiondef(f::regprocedure);
    if position(new_text in def) = 0 then
      if (length(def) - length(replace(def, old_text, ''))) / length(old_text) <> 1 then raise exception 'RANK_DAYGAIN_SHAPE: % (%)', f, i; end if;
      execute replace(def, old_text, new_text);
    end if;
  end loop;
end $patch$;
commit;

notify pgrst, 'reload schema';
