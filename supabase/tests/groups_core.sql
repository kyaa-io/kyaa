-- Read-only contract checks; execute after applying groups_core to a disposable DB.
begin;
do $$
declare n integer; result jsonb;
begin
 if has_table_privilege('service_role','public.group_posts','SELECT') then raise exception 'direct private post access granted'; end if;
 if has_function_privilege('anon','public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','EXECUTE') then raise exception 'anon RPC access granted'; end if;
 if not has_function_privilege('service_role','public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','EXECUTE') then raise exception 'service RPC inaccessible'; end if;
 select count(*) into n from pg_class where oid in ('public.group_pages'::regclass,'public.group_memberships'::regclass,'public.group_applications'::regclass,'public.group_bookmarks'::regclass,'public.group_posts'::regclass,'public.group_rooms'::regclass,'public.group_messages'::regclass,'public.group_action_receipts'::regclass) and relrowsecurity and relforcerowsecurity;
 if n<>8 then raise exception 'RLS missing'; end if;
 result:=public.groups_dispatch('directory');
 if jsonb_typeof(result->'items')<>'array' then raise exception 'invalid directory envelope'; end if;
 begin perform public.groups_dispatch('apply'); raise exception 'anonymous application accepted'; exception when raise_exception or insufficient_privilege then if sqlerrm not in('GROUPS_FORBIDDEN','FAN_WEB_ACTIVE_ACCOUNT_REQUIRED') then raise; end if; end;
 begin perform public.groups_dispatch('review'); raise exception 'anonymous review accepted'; exception when raise_exception then if sqlerrm<>'GROUPS_FORBIDDEN' then raise; end if; end;
end $$;
rollback;
