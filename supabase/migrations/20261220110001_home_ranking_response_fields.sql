-- RANK-REDESIGN data contract only: expose both fan metrics from the same daily build.
-- Existing snapshots, ordering, exposure filters, owners and ACLs remain in force. No cron.
-- Rollback: supabase/rollback/20261220110001_home_ranking_response_fields.sql
begin;
set local lock_timeout = '5s';
do $patch$
declare p record; def text; owner_name name;
begin
  for p in select * from (values
    ($f$public.read_home_fan_ranking_v2(uuid,text,integer)$f$,
     $a$t.subject_id, t.score, t.hearts, t.jjinfan_count,$a$,
     $b$t.subject_id, t.score, t.hearts,
      case when exists (select 1 from public.home_ranking_kind_builds pb where pb.kind = 'fan_points' and pb.day = h.day)
        then coalesce((select ps.score from public.home_ranking_daily ps where ps.kind = 'fan_points' and ps.day = h.day and ps.subject_id = t.subject_id), 0)
      end as points, t.jjinfan_count,$b$),
    ($f$public.read_home_fan_ranking_v2(uuid,text,integer)$f$,
     $a$'points', case when k = 'fan_points' then v.score end$a$, $b$'points', v.points$b$),
    ($f$public.read_home_fan_ranking_v2(uuid,text,integer)$f$,
     $a$'points', case when k = 'fan_points' then m.score end$a$, $b$'points', m.points$b$),
    ($f$public.read_home_fan_ranking_v2(uuid,text,integer)$f$,
     $a$'fans', v.jjinfan_count,
      'liveNow', public.home_ranking_live_now(v.favorite_celebrity_id),
      'isNew'$a$,
     $b$'fans', v.jjinfan_count,
      'isNew'$b$),
    -- No creator point aggregate is defined. Keep unknown distinct from zero.
    ($f$public.read_home_creator_ranking_v2(text,text,integer)$f$,
     $a$'hearts', s.hearts,$a$, $b$'hearts', s.hearts, 'points', null,$b$)
  ) v(fn, old_text, new_text) loop
    select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid = p.fn::regprocedure;
    if owner_name in ('anon','authenticated','service_role') or not pg_catalog.pg_has_role(current_user, owner_name, 'USAGE') then
      raise exception 'RANK_RESPONSE_OWNER_GAP: cannot replace % owned by %', p.fn, owner_name;
    end if;
    if not pg_catalog.has_table_privilege(owner_name, 'public.home_ranking_daily', 'select')
       or not pg_catalog.has_table_privilege(owner_name, 'public.home_ranking_kind_builds', 'select') then
      raise exception 'RANK_RESPONSE_OWNER_GAP: % cannot read snapshots', owner_name;
    end if;
    def := pg_catalog.pg_get_functiondef(p.fn::regprocedure);
    if (length(def) - length(replace(def, p.new_text, ''))) / length(p.new_text) = 1 then continue; end if;
    if (length(def) - length(replace(def, p.old_text, ''))) / length(p.old_text) <> 1 then
      raise exception 'RANK_RESPONSE_SHAPE: %', p.fn;
    end if;
    execute replace(def, p.old_text, p.new_text);
  end loop;
end $patch$;
notify pgrst, 'reload schema';
commit;
