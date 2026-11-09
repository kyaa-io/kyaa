-- Keep the wrapper-owner access check in sync after the operator-mark and edited-at wrappers.
-- Content chain: groups_content_dispatch (edited-at) -> before_edited_at (operator-mark)
-- -> before_operator_mark (notice-broadcast) -> before_notice_broadcast (reply counts)
-- -> before_reply_count. 20261220070000 only adds weekly analytics; it does not wrap a dispatcher.
-- Preserve all existing access relationships at their current function names. Grant only each
-- wrapper owner's missing EXECUTE privileges; do not open internal helpers to client roles.
-- Rollback: supabase/rollback/20261220081000_group_wrapper_access_after_edited.sql.
begin;
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
   -- 080000: edited-at wrapper and its result helper.
   ('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.groups_content_dispatch_before_edited_at(text,uuid,uuid,uuid,jsonb,uuid)'),
   ('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.group_post_edited_items(jsonb)'),
   -- 060000: operator-mark wrapper, renamed by 080000, and its result helper.
   ('public.groups_content_dispatch_before_edited_at(text,uuid,uuid,uuid,jsonb,uuid)','public.groups_content_dispatch_before_operator_mark(text,uuid,uuid,uuid,jsonb,uuid)'),
   ('public.groups_content_dispatch_before_edited_at(text,uuid,uuid,uuid,jsonb,uuid)','public.group_operator_mark_items(uuid,jsonb)'),
   -- The notice-broadcast wrapper now lives at before_operator_mark.
   ('public.groups_content_dispatch_before_operator_mark(text,uuid,uuid,uuid,jsonb,uuid)','public.groups_content_dispatch_before_notice_broadcast(text,uuid,uuid,uuid,jsonb,uuid)'),
   ('public.groups_content_dispatch_before_operator_mark(text,uuid,uuid,uuid,jsonb,uuid)','public.group_operator_role(uuid,uuid)'),
   ('public.groups_content_dispatch_before_operator_mark(text,uuid,uuid,uuid,jsonb,uuid)','public.group_operator_require(uuid,uuid)'),
   ('public.groups_content_dispatch_before_operator_mark(text,uuid,uuid,uuid,jsonb,uuid)','public.group_notice_broadcast_enabled()'),
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
