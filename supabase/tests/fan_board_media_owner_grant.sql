-- Run on a migrated DB; read-only. Every owner of a function that calls fan_board_media_allowed must be able to execute it,
-- and no API role may.
begin;
do $$declare o name;begin
 for o in select distinct pg_get_userbyid(proowner) from pg_proc where pronamespace='public'::regnamespace and prosrc like '%fan_board_media_allowed%' loop
  if not has_function_privilege(o,'public.fan_board_media_allowed(uuid)','execute')then raise exception 'definer owner % cannot execute fan_board_media_allowed',o;end if;
 end loop;
 if has_function_privilege('anon','public.fan_board_media_allowed(uuid)','execute')or has_function_privilege('authenticated','public.fan_board_media_allowed(uuid)','execute')or has_function_privilege('service_role','public.fan_board_media_allowed(uuid)','execute')then raise exception 'API role must not execute fan_board_media_allowed';end if;
 if exists(select 1 from pg_proc p where p.oid='public.fan_board_media_allowed(uuid)'::regprocedure and(p.proacl is null or exists(select 1 from aclexplode(p.proacl) a where a.grantee=0)))then raise exception 'PUBLIC must not execute fan_board_media_allowed';end if;
 raise notice 'FAN_BOARD_MEDIA_OWNER_GRANT PASS';
end$$;
rollback;
