begin;
-- B8 puts three more wrappers in front of the dispatchers (groups_dispatch, groups_content_dispatch, group_activities_dispatch) and renames the
-- dispatchers that stood there to *_before_operator_access / *_before_notice_broadcast / *_before_mission_stats. The wrapper-owner check from
-- 20261218030000 ("each wrapper owner can run what it calls, run it again after any owner change") knew only the R6 pairs, which now sit one
-- level down. Without the B8 pairs a wrapper whose owner differs from its callees' owners (AWS can give them different owners) stops with
-- "permission denied for function group_operator_role". This replaces the function with every pair in today's chain; nothing else changes.
create or replace function public.list_facts_wrapper_access()
returns void language plpgsql set search_path='' as $$
declare r record;gaps text[]:='{}';
begin
 for r in select w.proowner::regrole::text wrapper_owner,w.proowner,callee
  from (values
   ('public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.groups_dispatch_before_operator_access(text,uuid,uuid,uuid,jsonb,uuid)'),
   ('public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.group_operator_members_dispatch(text,uuid,uuid,jsonb)'),
   ('public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.group_operator_role(uuid,uuid)'),
   ('public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.group_operator_consume_read(uuid,uuid,text)'),
   ('public.groups_dispatch_before_operator_access(text,uuid,uuid,uuid,jsonb,uuid)','public.groups_dispatch_before_directory_facts(text,uuid,uuid,uuid,jsonb,uuid)'),
   ('public.groups_dispatch_before_operator_access(text,uuid,uuid,uuid,jsonb,uuid)','public.group_directory_facts(jsonb)'),
   ('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.groups_content_dispatch_before_notice_broadcast(text,uuid,uuid,uuid,jsonb,uuid)'),
   ('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.group_operator_role(uuid,uuid)'),
   ('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.group_operator_require(uuid,uuid)'),
   ('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.group_notice_broadcast_enabled()'),
   ('public.groups_content_dispatch_before_notice_broadcast(text,uuid,uuid,uuid,jsonb,uuid)','public.groups_content_dispatch_before_reply_count(text,uuid,uuid,uuid,jsonb,uuid)'),
   ('public.groups_content_dispatch_before_notice_broadcast(text,uuid,uuid,uuid,jsonb,uuid)','public.group_comment_reply_counts(uuid,jsonb)'),
   ('public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)','public.group_activities_dispatch_before_mission_stats(text,uuid,uuid,uuid,uuid,jsonb,uuid)'),
   ('public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)','public.group_mission_stats_read(uuid,uuid,jsonb)')
  ) v(wrapper,callee)
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
select public.list_facts_wrapper_access();
commit;
