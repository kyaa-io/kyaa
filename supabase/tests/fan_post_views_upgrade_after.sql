\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
do $$declare o name:='fan_post_views_legacy_owner';fn text[]:=array['public.fan_web_post_json(uuid,uuid,public.content_locale)','public.fan_web_post_json_before_views(uuid,uuid,public.content_locale)','public.read_fan_post_before_views(uuid,uuid,public.content_locale)'];f text;r jsonb;begin
 if pg_get_userbyid((select proowner from pg_proc where oid='public.fan_web_post_json(uuid,uuid,public.content_locale)'::regprocedure))=o then raise exception 'New wrapper should not share the legacy owner';end if;
 -- The legacy-owned definer caller can run the new wrapper (this fails with permission denied without the owner grant).
 if not has_function_privilege(o,'public.fan_web_post_json(uuid,uuid,public.content_locale)','execute') then raise exception 'Legacy caller owner cannot execute the new fan_web_post_json';end if;
 r:=public._fan_post_views_probe('00000000-0000-4000-8000-0000000000ff');
 if r is not null then raise exception 'Probe should return null for a missing post';end if;
 -- API roles stay closed on all three helpers.
 foreach f in array fn loop
  if has_function_privilege('anon',f,'execute') or has_function_privilege('authenticated',f,'execute') or has_function_privilege('service_role',f,'execute') then raise exception 'API role can execute %',f;end if;
 end loop;
 if not has_function_privilege('service_role','public.read_fan_post(uuid,uuid,public.content_locale)','execute') then raise exception 'service_role lost read_fan_post';end if;
 raise notice 'PASS fan_post_views owner grants for a separately owned caller, API roles closed';
end $$;
rollback;
-- Restore the single-owner shape so the rest of the clean replay is unaffected.
drop function public._fan_post_views_probe(uuid);
drop owned by fan_post_views_legacy_owner;
drop role fan_post_views_legacy_owner;
