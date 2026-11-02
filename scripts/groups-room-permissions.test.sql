\set ON_ERROR_STOP on
\ir seed-groups-pencil-dev.test.sql
begin;
insert into public.admin_allowlist(id,email,role) values('f1810000-0000-4000-8000-000000000001','room-permissions@example.test','admin');
do $$declare actor uuid;result jsonb;again jsonb;room uuid:='f1650000-0000-4000-8000-000000000003';page uuid:='f1630000-0000-4000-8000-000000000003';begin
 -- Hobby fixture room is readonly; owner and manager retain posting, ordinary members do not.
 foreach actor in array array['f1610000-0000-4000-8000-000000000001'::uuid,'f1610000-0000-4000-8000-000000000003'::uuid] loop
  if not public.group_room_can_send(actor,room)then raise exception 'Readonly operator denied';end if;
  perform public.groups_content_dispatch('message',actor,page,room,jsonb_build_object('body','operator message','requestId',gen_random_uuid()));
 end loop;
 actor:='f1610000-0000-4000-8000-000000000002';
 if public.group_room_can_send(actor,room)then raise exception 'Readonly member allowed';end if;
 result:=public.groups_content_dispatch('messages',actor,page,room,'{}');
 if (result->>'canSend')::boolean is distinct from false then raise exception 'Missing explicit readonly permission';end if;
 begin
  perform public.groups_content_dispatch('message',actor,page,room,jsonb_build_object('body','denied','requestId',gen_random_uuid()));
  raise exception 'Readonly member wrote';
 exception when raise_exception then if sqlerrm not in('GROUPS_NOT_FOUND','GROUPS_FORBIDDEN')then raise;end if;end;
 insert into public.group_artist_bindings(page_id,app_user_id,verified_by)values('f1630000-0000-4000-8000-000000000004',actor,'f1810000-0000-4000-8000-000000000001');
 if public.group_room_can_send(actor,room)then raise exception 'Cross-page artist allowed';end if;
 insert into public.group_artist_bindings(page_id,app_user_id,verified_by)values(page,actor,'f1810000-0000-4000-8000-000000000001');
 if not public.group_room_can_send(actor,room)then raise exception 'Bound artist denied';end if;
 result:=public.groups_content_dispatch('message',actor,page,room,'{"body":"artist message","requestId":"f1820000-0000-4000-8000-000000000001"}');
 again:=public.groups_content_dispatch('message',actor,page,room,'{"body":"artist message","requestId":"f1820000-0000-4000-8000-000000000001"}');
 if result<>again or (select count(*)from public.group_messages where room_id=room and body='artist message')<>1 then raise exception 'Retry duplicated message';end if;
 delete from public.group_artist_bindings where page_id=page and app_user_id=actor;
 if public.group_room_can_send(actor,room)then raise exception 'Unbound artist retained permission';end if;
 update public.group_memberships set role='member' where page_id=page and app_user_id='f1610000-0000-4000-8000-000000000003';
 if public.group_room_can_send('f1610000-0000-4000-8000-000000000003',room)then raise exception 'Former manager retained permission';end if;
 result:=public.groups_content_dispatch('messages',actor,page,room,'{}');
 if (result->>'canSend')::boolean is distinct from false then raise exception 'Unbound artist context still allows sending';end if;
 begin
  perform public.groups_content_dispatch('message',actor,page,room,jsonb_build_object('body','unbound','requestId',gen_random_uuid()));
  raise exception 'Unbound artist sent message';
 exception when raise_exception then if sqlerrm not in('GROUPS_NOT_FOUND','GROUPS_FORBIDDEN')then raise;end if;end;
 actor:='f1610000-0000-4000-8000-000000000001';
 update public.group_rooms set status='closed' where id=room;
 if public.group_room_can_send(actor,room)then raise exception 'Closed room allowed';end if;
 update public.group_rooms set status='open',closes_at=now()-interval '1 second' where id=room;
 if public.group_room_can_send(actor,room)then raise exception 'Expired room allowed';end if;
 begin
  perform public.groups_content_dispatch('message',actor,page,room,jsonb_build_object('body','expired','requestId',gen_random_uuid()));
  raise exception 'Expired room accepted message';
 exception when raise_exception then if sqlerrm not in('GROUPS_NOT_FOUND','GROUPS_FORBIDDEN')then raise;end if;end;
 if public.group_room_can_send('f1610000-0000-4000-8000-000000000001','f1650000-0000-4000-8000-000000000001')then raise exception 'Fan owner bypassed passport/tier';end if;
 insert into public.group_artist_bindings(page_id,app_user_id,verified_by)values('f1630000-0000-4000-8000-000000000001',actor,'f1810000-0000-4000-8000-000000000001');
 update public.group_rooms set status='readonly' where id='f1650000-0000-4000-8000-000000000001';
 perform public.groups_content_dispatch('message',actor,'f1630000-0000-4000-8000-000000000001','f1650000-0000-4000-8000-000000000001',jsonb_build_object('body','verified fan artist','requestId',gen_random_uuid()));
 if has_function_privilege('anon','public.group_room_can_send(uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','public.group_room_can_send(uuid,uuid)','EXECUTE') or has_function_privilege('service_role','public.group_room_can_send(uuid,uuid)','EXECUTE')then raise exception 'Helper exposed';end if;
end $$;
rollback;
