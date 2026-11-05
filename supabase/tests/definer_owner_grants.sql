-- Run on a migrated DB; read-only. For each target, every owner of a function that calls it can execute it,
-- anon, authenticated and PUBLIC cannot, and service_role keeps its pre-migration entry:
-- service_role may execute only the two targets that already listed it (banner save, notice comments 7-arg).
begin;
do $$declare t regprocedure;o name;keep_service boolean;begin
 foreach t in array array[
  'public.assert_channel_writer(uuid,uuid,uuid)'::regprocedure,
  'public.save_admin_managed_banner(uuid,uuid,uuid,uuid,integer,public.home_banner_kind,uuid,jsonb,text,text)'::regprocedure,
  'public.read_celebrity_notice_comments(text,text,uuid,timestamptz,uuid,integer,public.content_locale)'::regprocedure
 ] loop
  keep_service:=t::oid<>'public.assert_channel_writer(uuid,uuid,uuid)'::regprocedure;
  for o in select distinct pg_get_userbyid(p.proowner) from pg_proc p where p.pronamespace='public'::regnamespace and p.oid<>t::oid
   and p.prosrc ~* ('\m'||(select proname from pg_proc where oid=t::oid)||'\s*\(') loop
   if not has_function_privilege(o,t,'execute')then raise exception 'definer owner % cannot execute %',o,t;end if;
  end loop;
  if has_function_privilege('anon',t,'execute')or has_function_privilege('authenticated',t,'execute')then raise exception 'anon/authenticated must not execute %',t;end if;
  if exists(select 1 from pg_proc p where p.oid=t::oid and(p.proacl is null or exists(select 1 from aclexplode(p.proacl) a where a.grantee=0)))then raise exception 'PUBLIC must not execute %',t;end if;
  if has_function_privilege('service_role',t,'execute')<>keep_service then raise exception 'service_role access changed for %',t;end if;
 end loop;
 raise notice 'DEFINER_OWNER_GRANTS PASS';
end$$;
rollback;
