begin;
-- Same cause as 20261209130000: a security definer function runs as its owner, so a nested call to a function whose
-- ACL does not include that owner fails with "permission denied for function". These helpers are owned by one role
-- and the ACL names only that owner (and sometimes service_role), while their callers are owned by another role.
-- Grant execute to each owner of a function that calls a target, never to an API role. Existing ACL entries stay as they are.
do $$declare target regprocedure;owner_name name;target_owner name;begin
 foreach target in array array[
  'public.assert_channel_writer(uuid,uuid,uuid)'::regprocedure,
  'public.save_admin_managed_banner(uuid,uuid,uuid,uuid,integer,public.home_banner_kind,uuid,jsonb,text,text)'::regprocedure,
  'public.read_celebrity_notice_comments(text,text,uuid,timestamptz,uuid,integer,public.content_locale)'::regprocedure
 ] loop
  select pg_get_userbyid(proowner) into target_owner from pg_proc where oid=target;
  for owner_name in select distinct pg_get_userbyid(p.proowner) from pg_proc p
   where p.pronamespace='public'::regnamespace and p.oid<>target and p.prosrc ~* ('\m'||(select proname from pg_proc where oid=target)||'\s*\(') loop
   if owner_name in('anon','authenticated','service_role')then raise exception 'Unexpected definer owner % for %',owner_name,target;end if;
   if owner_name<>target_owner then execute format('grant execute on function %s to %I',target,owner_name);end if;
  end loop;
 end loop;
end$$;
commit;
