begin;
alter table public.group_missions add constraint group_missions_page_id_id_key unique(page_id,id);
alter table public.group_events
 add column linked_mission_id uuid,
 add column cancellation_reason text check(cancellation_reason is null or length(cancellation_reason)<=1000),
 add constraint group_events_linked_mission_page_fkey foreign key(page_id,linked_mission_id)references public.group_missions(page_id,id);
-- Extend the existing receipt-bearing save branch; legacy receipt replay still precedes field validation.
do $migration$declare f record;body text;old text;next text;begin
 select p.oid,p.prosrc into f from pg_proc p where p.oid='public.group_activities_dispatch_before_operations(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure and p.prosecdef and p.proconfig @>array['search_path=""'];
 if f.oid is null then raise exception 'GROUP_EVENT_SOURCE_CORE_CHANGED';end if;body:=f.prosrc;
 old:=$old$  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-activity-page:'||p_page_id,0));$old$;
 next:=$next$  if p_operation='event-save'then
   select x.role into role from public.group_memberships x where page_id=p_page_id and app_user_id=p_actor for share;
   manager:=platform or coalesce(role in('owner','manager'),false);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-activity-page:'||p_page_id,0));$next$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_EVENT_SOURCE_LOCK_CHANGED';end if;body:=replace(body,old,next);
 old:=$old$ when 'event-save'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;$old$;
 next:=$next$ when 'event-save'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if p_input?'cancellationReason'and(jsonb_typeof(p_input->'cancellationReason')not in('string','null')or length(p_input->>'cancellationReason')>1000)then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  if p_input?'linkedMissionId'then
   if jsonb_typeof(p_input->'linkedMissionId')not in('string','null')then raise exception 'GROUP_ACTIVITY_INVALID';end if;
   begin perform(p_input->>'linkedMissionId')::uuid;exception when invalid_text_representation then raise exception 'GROUP_ACTIVITY_INVALID';end;
   if p_input->>'linkedMissionId'is not null and not exists(select 1 from public.group_missions where id=(p_input->>'linkedMissionId')::uuid and page_id=g.id)then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  end if;$next$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_EVENT_SOURCE_VALIDATION_CHANGED';end if;body:=replace(body,old,next);
 old:=$old$requires_approval,state,created_by)values(g.id$old$;
 next:=$next$requires_approval,state,created_by,linked_mission_id,cancellation_reason)values(g.id$next$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_EVENT_SOURCE_INSERT_COLUMNS_CHANGED';end if;body:=replace(body,old,next);
 old:=$old$p_input->>'state',p_actor)returning *into e;$old$;
 next:=$next$p_input->>'state',p_actor,(p_input->>'linkedMissionId')::uuid,p_input->>'cancellationReason')returning *into e;$next$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_EVENT_SOURCE_INSERT_VALUES_CHANGED';end if;body:=replace(body,old,next);
 old:=$old$requires_approval=(p_input->>'requiresApproval')::boolean,state=p_input->>'state',revision=revision+1$old$;
 next:=$next$requires_approval=(p_input->>'requiresApproval')::boolean,state=p_input->>'state',linked_mission_id=case when p_input?'linkedMissionId'then(p_input->>'linkedMissionId')::uuid else linked_mission_id end,cancellation_reason=case when p_input?'cancellationReason'then p_input->>'cancellationReason'else cancellation_reason end,revision=revision+1$next$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_EVENT_SOURCE_UPDATE_CHANGED';end if;body:=replace(body,old,next);
 execute replace(pg_get_functiondef(f.oid),f.prosrc,body);
end $migration$;
-- Keep the current projection chain and original OID; old persisted receipt JSON is never rewritten.
do $$declare source text;begin
 source:=pg_get_functiondef('public.group_event_json(uuid,uuid)'::regprocedure);
 if to_regprocedure('public.group_event_json_before_source_fields(uuid,uuid)')is not null then raise exception 'GROUP_EVENT_SOURCE_WRAPPER_EXISTS';end if;
 execute replace(source,'FUNCTION public.group_event_json(','FUNCTION public.group_event_json_before_source_fields(');
end $$;
create or replace function public.group_event_json(p_id uuid,p_actor uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select public.group_event_json_before_source_fields(p_id,p_actor)||jsonb_build_object('linkedMissionId',case when public.group_scope_visible(p_actor,e.page_id)and exists(select 1 from public.group_missions m where m.id=e.linked_mission_id and m.page_id=e.page_id and(m.state='published'or access.manager))then e.linked_mission_id end,'cancellationReason',case when access.manager or exists(select 1 from public.group_event_registrations r where r.event_id=e.id and r.app_user_id=p_actor)then e.cancellation_reason end)
 from public.group_events e cross join lateral(select exists(select 1 from public.group_memberships member where member.page_id=e.page_id and member.app_user_id=p_actor and member.role in('owner','manager'))as manager)access where e.id=p_id
$$;
revoke all on function public.group_event_json(uuid,uuid),public.group_event_json_before_source_fields(uuid,uuid)from public,anon,authenticated,service_role;
commit;
