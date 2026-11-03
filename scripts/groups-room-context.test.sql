\set ON_ERROR_STOP on
\ir seed-groups-pencil-dev.test.sql
begin;
insert into public.admin_allowlist(id,email,role) values('f1810000-0000-4000-8000-000000000001','room-context@example.test','admin');
insert into public.group_artist_bindings(page_id,app_user_id,verified_by)values('f1630000-0000-4000-8000-000000000003','f1610000-0000-4000-8000-000000000001','f1810000-0000-4000-8000-000000000001');
do $$declare result jsonb;begin
 result:=public.groups_content_dispatch('messages','f1610000-0000-4000-8000-000000000002','f1630000-0000-4000-8000-000000000003','f1650000-0000-4000-8000-000000000003','{}');
 if jsonb_array_length(result->'items')<>1 or not (result->'items'->0->>'artist')::boolean or result->'items'->0->>'avatarUrl' is null then raise exception 'Missing artist message projection';end if;
 if jsonb_array_length(result->'participants')<>1 or result->'participants'->0->>'profileId'<>'f1610000-0000-4000-8000-000000000002' then raise exception 'Participants must be actual readers and exclude artist';end if;
 insert into public.group_room_reads(room_id,app_user_id)values('f1650000-0000-4000-8000-000000000003','f1610000-0000-4000-8000-000000000003');
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values('f1610000-0000-4000-8000-000000000002','f1610000-0000-4000-8000-000000000003');
 result:=public.groups_content_dispatch('messages','f1610000-0000-4000-8000-000000000002','f1630000-0000-4000-8000-000000000003','f1650000-0000-4000-8000-000000000003','{}');
 if exists(select 1 from jsonb_array_elements(result->'participants')p where p->>'profileId'='f1610000-0000-4000-8000-000000000003')then raise exception 'Blocked reader was exposed';end if;
 delete from public.group_memberships where page_id='f1630000-0000-4000-8000-000000000003' and app_user_id='f1610000-0000-4000-8000-000000000002';
 begin
  perform public.groups_content_dispatch('messages','f1610000-0000-4000-8000-000000000002','f1630000-0000-4000-8000-000000000003','f1650000-0000-4000-8000-000000000003','{}');
  raise exception 'Nonmember received room context';
 exception when raise_exception then if sqlerrm not in('GROUPS_NOT_FOUND','GROUPS_FORBIDDEN')then raise;end if;end;
 if has_function_privilege('anon','public.group_room_context(uuid,uuid,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.group_room_context(uuid,uuid,jsonb)','EXECUTE') or has_function_privilege('service_role','public.group_room_context(uuid,uuid,jsonb)','EXECUTE') then raise exception 'Private projection helper is directly exposed';end if;
end $$;
rollback;
