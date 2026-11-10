-- Restores the readers to the pre-exclusion join.
do $patch$
declare f text; def text; owner_name name;
  old_text constant text := $a$join public.app_users au on au.id = t.subject_id and au.status = 'active'$a$;
  new_text constant text := $b$join public.app_users au on au.id = t.subject_id and au.status = 'active'
        and not exists (select 1 from public.admin_allowlist aa where aa.active and pg_catalog.lower(aa.email) = pg_catalog.lower(au.verified_email))
        and au.verified_email not like 'test-%@privy.io'$b$;
begin
  foreach f in array array['public.read_home_fan_ranking_v2(uuid,text,integer)', 'public.read_home_fan_ranking_period(uuid,text,integer)'] loop
    select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid = f::regprocedure;
    if owner_name in ('anon','authenticated','service_role') or not pg_catalog.pg_has_role(current_user, owner_name, 'USAGE') then
      raise exception 'RANK_OPERATOR_RB_OWNER_GAP: cannot replace % owned by %', f, owner_name;
    end if;
    def := pg_catalog.pg_get_functiondef(f::regprocedure);
    if position(new_text in def) = 0 then continue; end if;
    if (length(def) - length(replace(def, new_text, ''))) / length(new_text) <> 1 then raise exception 'RANK_OPERATOR_RB_SHAPE: %', f; end if;
    execute replace(def, new_text, old_text);
  end loop;
end $patch$;
