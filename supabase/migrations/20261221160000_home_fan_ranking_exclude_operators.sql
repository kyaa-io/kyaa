-- Public fan rankings (home fan ranking, hearts/points and day/week gain readers) leave out operator and test accounts:
-- an active admin_allowlist email match (case-insensitive), and test-*@privy.io accounts (case-insensitive). A fan with no verified email is a normal fan and stays listed. Read-time filter only; no hearts, points or stored rank is changed,
-- so the remaining fans close up and rank shifts up. Rollback: supabase/rollback/20261221160000_home_fan_ranking_exclude_operators.sql.
do $patch$
declare f text; def text; owner_name name;
  old_text constant text := $a$join public.app_users au on au.id = t.subject_id and au.status = 'active'$a$;
  new_text constant text := $b$join public.app_users au on au.id = t.subject_id and au.status = 'active'
        and not exists (select 1 from public.admin_allowlist aa where aa.active and pg_catalog.lower(aa.email) = pg_catalog.lower(au.verified_email))
        and coalesce(pg_catalog.lower(au.verified_email), '') not like 'test-%@privy.io'$b$;
begin
  foreach f in array array['public.read_home_fan_ranking_v2(uuid,text,integer)', 'public.read_home_fan_ranking_period(uuid,text,integer)'] loop
    select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid = f::regprocedure;
    if owner_name in ('anon','authenticated','service_role') or not pg_catalog.pg_has_role(current_user, owner_name, 'USAGE') then
      raise exception 'RANK_OPERATOR_OWNER_GAP: cannot replace % owned by %', f, owner_name;
    end if;
    def := pg_catalog.pg_get_functiondef(f::regprocedure);
    if position(new_text in def) > 0 then continue; end if;
    if (length(def) - length(replace(def, old_text, ''))) / length(old_text) <> 1 then raise exception 'RANK_OPERATOR_SHAPE: %', f; end if;
    execute replace(def, old_text, new_text);
  end loop;
end $patch$;
