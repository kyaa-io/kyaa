-- 20261222140000: the points and likes lists against a recount from the source tables, inside one rolled-back build.
-- Run: psql -X -v ON_ERROR_STOP=1 -d byus -f supabase/tests/home_ranking_points_likes.sql (prints PASS lines; any failure raises).
begin;
select public.refresh_home_rankings(pg_catalog.clock_timestamp());
do $t$
declare d date := (pg_catalog.clock_timestamp() at time zone 'Asia/Seoul')::date; bad bigint; per text; r jsonb; ranks int[]; n int;
  day_start timestamptz := (((pg_catalog.clock_timestamp() at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul');
  week_start timestamptz := ((((pg_catalog.clock_timestamp() at time zone 'Asia/Seoul')::date) - 6)::timestamp at time zone 'Asia/Seoul');
begin
  -- 1. Points earned: positive fan_point rows only, per window; spending and corrections never lower the value.
  foreach per in array array['all', 'day', 'week'] loop
    select count(*) into bad from public.home_ranking_daily t
     where t.kind = 'fan_point_' || per and t.day = d
       and t.score <> coalesce((select sum(l.amount) from public.mobile_fan_economy_ledger l where l.app_user_id = t.subject_id and l.asset = 'fan_point' and l.amount > 0
                                  and l.created_at >= case per when 'all' then '-infinity'::timestamptz when 'day' then day_start else week_start end), 0);
    if bad > 0 then raise exception 'FAIL fan_point_% recount differs for % rows', per, bad; end if;
    select count(*) into bad from public.home_ranking_daily t where t.kind = 'creator_like_' || per and t.day = d
       and t.score <> (select count(*) from public.fan_reactions r join public.app_users u on u.id = r.app_user_id and u.status = 'active'
                        where r.celebrity_id = t.subject_id and r.completed_at >= case per when 'all' then '-infinity'::timestamptz when 'day' then day_start else week_start end);
    if bad > 0 then raise exception 'FAIL creator_like_% recount differs for % rows', per, bad; end if;
    if (select row_count from public.home_ranking_kind_builds where kind = 'fan_point_' || per and day = d) is null then raise exception 'FAIL no build record fan_point_%', per; end if;
  end loop;
  raise notice 'PASS points and likes match a recount for all, day and week';

  -- 2. Every fan who earned points is listed; one with spending keeps the earned total.
  select count(*) into bad from (select l.app_user_id from public.mobile_fan_economy_ledger l join public.app_users u on u.id = l.app_user_id and u.status = 'active'
     where l.asset = 'fan_point' and l.amount > 0
       and not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = l.app_user_id and mr.revoked_at is null) group by 1) e
   where not exists (select 1 from public.home_ranking_daily t where t.kind = 'fan_point_all' and t.day = d and t.subject_id = e.app_user_id);
  if bad > 0 then raise exception 'FAIL % earning fans missing from fan_point_all', bad; end if;
  raise notice 'PASS every earning fan is listed (debits: %)', (select count(*) from public.mobile_fan_economy_ledger where asset = 'fan_point' and amount < 0);

  -- 3. Readers: ranks 1..n in score order, operator and test accounts out, stats present, no SNS follower value invented.
  foreach per in array array['all', 'day', 'week'] loop
    r := public.read_home_fan_ranking_v3(null, per, 50);
    select array_agg((e->>'rank')::int order by ord) into ranks from pg_catalog.jsonb_array_elements(r->'rows') with ordinality x(e, ord);
    n := pg_catalog.jsonb_array_length(r->'rows');
    if n > 0 and ranks <> (select array_agg(i) from generate_series(1, n) i) then raise exception 'FAIL fan % ranks not 1..n', per; end if;
    if exists (select 1 from pg_catalog.jsonb_array_elements(r->'rows') with ordinality a(e, i) join pg_catalog.jsonb_array_elements(r->'rows') with ordinality b(f, j) on j = i + 1
               where (a.e->>'score')::bigint < (b.f->>'score')::bigint) then raise exception 'FAIL fan % not in score order', per; end if;
    if exists (select 1 from pg_catalog.jsonb_array_elements(r->'rows') e where not (e ? 'hearts' and e ? 'tickets' and e ? 'totalPoints') or e ? 'followers')
      then raise exception 'FAIL fan % stats', per; end if;
    if r->>'metric' <> 'points' then raise exception 'FAIL fan % metric', per; end if;
    r := public.read_home_creator_ranking_v3('ko', per, 50);
    if exists (select 1 from pg_catalog.jsonb_array_elements(r->'rows') e where not (e ? 'hearts' and e ? 'fans' and e ? 'likes') or e ? 'followers')
      then raise exception 'FAIL creator % stats', per; end if;
    if exists (select 1 from pg_catalog.jsonb_array_elements(r->'rows') with ordinality a(e, i) join pg_catalog.jsonb_array_elements(r->'rows') with ordinality b(f, j) on j = i + 1
               where (a.e->>'score')::bigint < (b.f->>'score')::bigint) then raise exception 'FAIL creator % not in score order', per; end if;
  end loop;
  select count(*) into bad from public.home_ranking_daily t join public.app_users au on au.id = t.subject_id
   where t.kind = 'fan_point_all' and t.day = d and t.rank <= 50
     and (exists (select 1 from public.admin_allowlist aa where aa.active and lower(aa.email) = lower(au.verified_email)) or lower(coalesce(au.verified_email, '')) like 'test-%@privy.io')
     and exists (select 1 from pg_catalog.jsonb_array_elements(public.read_home_fan_ranking_v3(t.subject_id, 'all', 50)->'rows') e where (e->>'isMe')::boolean);
  if bad > 0 then raise exception 'FAIL % operator or test accounts listed', bad; end if;
  raise notice 'PASS readers ordered, operators out, stats present, no followers field';

  -- 4. Viewer: profile reference resolves to the same fan through home_ranking_profile_subject.
  select t.subject_id into strict r from (select null) z left join lateral (select to_jsonb(t.subject_id) as subject_id from public.home_ranking_daily t
    join public.app_users au on au.id = t.subject_id and au.status = 'active' and lower(coalesce(au.verified_email, '')) not like 'test-%@privy.io'
     and not exists (select 1 from public.admin_allowlist aa where aa.active and lower(aa.email) = lower(au.verified_email))
   where t.kind = 'fan_point_all' and t.day = d order by t.rank limit 1) t on true;
  if r is not null and r <> 'null'::jsonb then
    declare viewer uuid := (r #>> '{}')::uuid; me jsonb; ref jsonb;
    begin
      me := public.read_home_fan_ranking_v3(viewer, 'all', 50);
      select e->'profileRef' into ref from pg_catalog.jsonb_array_elements(me->'rows') e where (e->>'isMe')::boolean;
      if me->'me' is null or ref is null then raise exception 'FAIL viewer row missing'; end if;
      if public.home_ranking_profile_subject(viewer, ref) is distinct from viewer then raise exception 'FAIL points profile ref does not resolve'; end if;
      if public.home_ranking_profile_subject(viewer, ref || '{"rank": 999999}') is not null then raise exception 'FAIL bad rank resolved'; end if;
    end;
    raise notice 'PASS points profile reference resolves to the listed fan';
  end if;

  -- 5. Grants: service role reads, nobody else.
  if pg_catalog.has_function_privilege('anon', 'public.read_home_fan_ranking_v3(uuid,text,integer)', 'execute')
     or pg_catalog.has_function_privilege('authenticated', 'public.read_home_creator_ranking_v3(text,text,integer)', 'execute')
     or pg_catalog.has_function_privilege('service_role', 'public.build_home_metric_rankings(date,timestamptz)', 'execute')
     or not pg_catalog.has_function_privilege('service_role', 'public.read_home_creator_ranking_v3(text,text,integer)', 'execute') then raise exception 'FAIL grants'; end if;
  begin perform public.read_home_fan_ranking_v3(null, 'month', 5); raise exception 'FAIL month accepted';
  exception when sqlstate '22023' then null; end;
  raise notice 'PASS grants and period check';
end $t$;
rollback;
