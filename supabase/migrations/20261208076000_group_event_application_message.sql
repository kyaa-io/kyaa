begin;
-- Registration identity remains the authenticated member; the organizer note is optional.
alter table public.group_event_registrations add column application_message text not null default ''check(length(application_message)<=1000);
-- Patch the receipt-bearing insert, not a post-dispatch wrapper, keeping original OIDs.
do $migration$declare f record;body text;old text;next text;begin
 select p.oid,p.prosrc into f from pg_proc p where p.oid='public.group_activities_dispatch_before_operations(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure and p.prosecdef and p.proconfig @>array['search_path=""'];
 if f.oid is null then raise exception 'GROUP_APPLICATION_CORE_CHANGED';end if;body:=f.prosrc;
 old:=$old$ when 'event-apply'then
  if role is null then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;$old$;
 next:=$next$ when 'event-apply'then
  if role is null then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if p_input?'applicationMessage'and(jsonb_typeof(p_input->'applicationMessage')is distinct from'string'or length(p_input->>'applicationMessage')>1000)then raise exception 'GROUP_ACTIVITY_INVALID';end if;$next$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_APPLICATION_VALIDATION_CHANGED';end if;body:=replace(body,old,next);
 old:=$old$   insert into public.group_event_registrations(event_id,app_user_id,status)values(e.id,p_actor,case when e.requires_approval then'pending'else'confirmed'end)on conflict(event_id,app_user_id)do update set status=excluded.status,ticket_token=extensions.gen_random_bytes(32),checked_in_at=null,checked_in_by=null returning *into r;$old$;
 next:=$next$   insert into public.group_event_registrations(event_id,app_user_id,status,application_message)values(e.id,p_actor,case when e.requires_approval then'pending'else'confirmed'end,coalesce(p_input->>'applicationMessage',''))on conflict(event_id,app_user_id)do update set status=excluded.status,application_message=excluded.application_message,ticket_token=extensions.gen_random_bytes(32),checked_in_at=null,checked_in_by=null returning *into r;$next$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_APPLICATION_INSERT_CHANGED';end if;body:=replace(body,old,next);
 old:=$old$  if r.id is not null and r.status in('pending','confirmed')then result:=jsonb_build_object('status',r.status,'eventId',e.id);$old$;
 next:=$next$  if r.id is not null and r.status in('pending','confirmed')then
   if p_input?'applicationMessage'and r.application_message is distinct from p_input->>'applicationMessage'then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
   result:=jsonb_build_object('status',r.status,'eventId',e.id);$next$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_APPLICATION_ACTIVE_CHANGED';end if;body:=replace(body,old,next);
 old:=$old$'checkedInAt',r.checked_in_at),'canApply'$old$;
 next:=$next$'checkedInAt',r.checked_in_at,'participantName',case when p_actor is not null then coalesce(nullif(btrim((select nickname from public.user_profiles where app_user_id=p_actor)),''),'회원')end),'canApply'$next$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_APPLICATION_NAME_CHANGED';end if;body:=replace(body,old,next);
 execute replace(pg_get_functiondef(f.oid),f.prosrc,body);
 -- The operations override owns real participant pagination/search and manager checks.
 select p.oid,p.prosrc into f from pg_proc p where p.oid='public.group_activities_dispatch_before_group_images(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure and p.prosecdef and p.proconfig @>array['search_path=""'];
 if f.oid is null then raise exception 'GROUP_APPLICATION_OPERATIONS_CHANGED';end if;body:=f.prosrc;
 old:=$old$'status',r.status,'checkedInAt',r.checked_in_at)order by r.id)$old$;
 next:=$next$'status',r.status,'checkedInAt',r.checked_in_at,'applicationMessage',r.application_message)order by r.id)$next$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_APPLICATION_PARTICIPANTS_CHANGED';end if;body:=replace(body,old,next);
 execute replace(pg_get_functiondef(f.oid),f.prosrc,body);
end $migration$;
commit;
