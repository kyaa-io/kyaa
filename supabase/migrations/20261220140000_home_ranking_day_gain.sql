-- RANK-DATA-2: daily heart difference on the existing KST snapshots.
-- Always compare hearts (even on points/fans sorting), never the selected metric's score.
-- The immediately preceding calendar day must have a build. Missing history is null;
-- a subject absent from a built day had zero counted hearts. Negative differences are retained.
-- No ledger writes, new refresh path, grants, owners, RLS policies or wrapper edges.
-- The existing ten-minute ensure_home_rankings/advisory lock governs both totals.
-- Supervisor 2026-11-10 04:35: the existing kind=profile reference is signed-in only.
-- Signed-out JSON has no profileRef key. Existing profile resolution/permissions are unchanged.
-- Rollback: supabase/rollback/20261220140000_home_ranking_day_gain.sql
begin;
set local lock_timeout = '5s';
do $patch$
declare p record; def text; owner_name name;
begin
  for p in select * from (values
    ('public.read_home_fan_ranking_v2(uuid,text,integer)',
     $a$'delta', v.delta,$a$,
     $b$'delta', v.delta,
      'dayGain', case when exists (select 1 from public.home_ranking_kind_builds b where b.kind = 'fan_hearts' and b.day = h.day - 1)
        then v.hearts - coalesce((select y.hearts from public.home_ranking_daily y where y.kind = 'fan_hearts' and y.day = h.day - 1 and y.subject_id = v.subject_id), 0) end,$b$),
    ('public.read_home_creator_ranking_v2(text,text,integer)',
     $a$'hearts', s.hearts, 'points', null,$a$,
     $b$'hearts', s.hearts, 'points', null,
      'dayGain', case when exists (select 1 from public.home_ranking_kind_builds b where b.kind = 'creator_hearts' and b.day = h.day - 1)
        then s.hearts - coalesce((select y.hearts from public.home_ranking_daily y where y.kind = 'creator_hearts' and y.day = h.day - 1 and y.subject_id = s.subject_id), 0) end,$b$),
    ('public.read_home_fan_ranking_v2(uuid,text,integer)',
     $a$) order by v.rn)
      from moved v$a$,
     $b$) || case when p_viewer is not null then pg_catalog.jsonb_build_object(
        'profileRef', pg_catalog.jsonb_build_object('kind', 'profile', 'profileId', v.subject_id)) else '{}'::jsonb end order by v.rn)
      from moved v$b$)
  ) v(fn, old_text, new_text) loop
    select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid = p.fn::regprocedure;
    if owner_name in ('anon','authenticated','service_role') or not pg_catalog.pg_has_role(current_user, owner_name, 'USAGE') then
      raise exception 'RANK_DAY_GAIN_OWNER_GAP: cannot replace % owned by %', p.fn, owner_name;
    end if;
    def := pg_catalog.pg_get_functiondef(p.fn::regprocedure);
    if (length(def) - length(replace(def, p.new_text, ''))) / length(p.new_text) = 1 then continue; end if;
    if (length(def) - length(replace(def, p.old_text, ''))) / length(p.old_text) <> 1 then
      raise exception 'RANK_DAY_GAIN_SHAPE: %', p.fn;
    end if;
    execute replace(def, p.old_text, p.new_text);
  end loop;
end $patch$;
notify pgrst, 'reload schema';
commit;
