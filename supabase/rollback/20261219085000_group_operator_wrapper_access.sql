-- Rollback of 20261219085000_group_operator_wrapper_access.sql: put back the R6 definition (the pairs 20261218030000 created).
-- Roll this back before 20261219084000, 20261219082000 and 20261219080000, whose wrappers it names.
begin;
create or replace function public.list_facts_wrapper_access()
returns void language plpgsql set search_path='' as $$
declare r record;gaps text[]:='{}';
begin
 for r in select w.proowner::regrole::text wrapper_owner,w.proowner,callee
  from (values('public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.groups_dispatch_before_directory_facts(text,uuid,uuid,uuid,jsonb,uuid)'),
   ('public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.group_directory_facts(jsonb)'),
   ('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.groups_content_dispatch_before_reply_count(text,uuid,uuid,uuid,jsonb,uuid)'),
   ('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.group_comment_reply_counts(uuid,jsonb)')) v(wrapper,callee)
  join pg_catalog.pg_proc w on w.oid=v.wrapper::regprocedure
 loop
  if not pg_catalog.has_function_privilege(r.proowner,r.callee,'execute') then
   begin execute format('grant execute on function %s to %s',r.callee,r.wrapper_owner);exception when insufficient_privilege then null;end;
   if not pg_catalog.has_function_privilege(r.proowner,r.callee,'execute') then gaps:=gaps||format('%s cannot execute %s',r.wrapper_owner,r.callee);end if;
  end if;
 end loop;
 if cardinality(gaps)>0 then raise exception 'LIST_FACTS_WRAPPER_GAP: %',array_to_string(gaps,'; ');end if;
end $$;
revoke all on function public.list_facts_wrapper_access() from public,anon,authenticated,service_role;
commit;
