-- Restore only these replacements; preserve other changes and existing function owners/ACLs.
-- Owner SELECT grants stay, as with 20261220051000. No table policy was created.
begin;
set local lock_timeout = '5s';
do $patch$
declare p record; def text; owner_name name;
begin
  for p in select * from (values
    ($f$public.refresh_home_rankings(timestamptz)$f$, $a$sum(t.hearts)::bigint as hearts,
             case max$a$, $b$sum(t.hearts)::bigint as hearts, count(*)::bigint as jjinfan_count,
             case max$b$, 1),
    ($f$public.refresh_home_rankings(timestamptz)$f$, $a$coalesce(hd.hearts, 0)::bigint as hearts, hd.tier,$a$, $b$coalesce(hd.hearts, 0)::bigint as hearts, coalesce(hd.jjinfan_count, 0)::bigint as jjinfan_count, hd.tier,$b$, 1),
    ($f$public.refresh_home_rankings(timestamptz)$f$, $a$hearts, tier, favorite_celebrity_id, achieved_at, computed_at)$a$, $b$hearts, tier, favorite_celebrity_id, achieved_at, computed_at, jjinfan_count)$b$, 2),
    ($f$public.refresh_home_rankings(timestamptz)$f$, $a$f.tier, f.favorite, r.achieved_at, p_now$a$, $b$f.tier, f.favorite, r.achieved_at, p_now, f.jjinfan_count$b$, 2),
    ($f$public.read_home_fan_ranking_v2(uuid,text,integer)$f$, $a$t.subject_id, t.score, t.hearts, t.rank as stored_rank$a$, $b$t.subject_id, t.score, t.hearts, t.jjinfan_count, t.rank as stored_rank$b$, 1),
    ($f$public.read_home_fan_ranking_v2(uuid,text,integer)$f$, $a$'delta', v.delta,$a$, $b$'delta', v.delta,
      'fans', v.jjinfan_count,
      'liveNow', public.home_ranking_live_now(v.favorite_celebrity_id),
      'isNew', public.home_ranking_recent_entry(k, v.subject_id, h.day),$b$, 1),
    ($f$public.read_home_creator_ranking_v2(text,text,integer)$f$, $a$'challenge', exists$a$, $b$'liveNow', public.home_ranking_live_now(s.subject_id),
      'isNew', public.home_ranking_recent_entry(k, s.subject_id, h.day),
      'challenge', exists$b$, 1)
  ) v(fn, old_text, new_text, occurrences) loop
    select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid = p.fn::regprocedure;
    if owner_name in ('anon','authenticated','service_role') or not pg_catalog.pg_has_role(current_user, owner_name, 'USAGE') then
      raise exception 'RANK_INFO_OWNER_GAP: cannot replace % owned by %', p.fn, owner_name;
    end if;
    def := pg_catalog.pg_get_functiondef(p.fn::regprocedure);
    if (length(def) - length(replace(def, p.new_text, ''))) / length(p.new_text) <> p.occurrences then
      raise exception 'RANK_INFO_ROLLBACK_SHAPE: %', p.fn;
    end if;
    execute replace(def, p.new_text, p.old_text);
  end loop;
end $patch$;
drop function public.home_ranking_live_now(uuid);
drop function public.home_ranking_recent_entry(text,uuid,date);
drop index public.home_ranking_info_subject_day_idx;
alter table public.home_ranking_daily drop column jjinfan_count;
notify pgrst, 'reload schema';
commit;
