begin;
-- fan_board_media_allowed is revoked from every API role, so only its owner could call it.
-- save_fan_post is a security definer function that can have a different owner (the role that created the
-- original function), which made every board post fail with "permission denied for function fan_board_media_allowed".
-- Grant execute to each owner of a function that calls it, never to an API role.
do $$declare owner_name name;begin
 for owner_name in select distinct pg_get_userbyid(proowner) from pg_proc
  where pronamespace='public'::regnamespace and prosrc like '%fan_board_media_allowed%' loop
  if owner_name in('anon','authenticated','service_role')then raise exception 'Unexpected board media definer owner';end if;
  execute format('grant execute on function public.fan_board_media_allowed(uuid) to %I',owner_name);
 end loop;
end$$;
commit;
