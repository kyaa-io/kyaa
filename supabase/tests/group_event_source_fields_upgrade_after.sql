\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
do $$declare f public._group_event_source_upgrade_fixture;result jsonb;begin
 select *into strict f from public._group_event_source_upgrade_fixture;
 if not exists(select 1 from public.group_events where id=f.event and state='cancelled'and linked_mission_id is null and cancellation_reason is null)then raise exception 'Legacy cancelled row changed';end if;
 result:=public.group_activities_dispatch('event-save',f.actor,f.page,null,null,f.input);
 if result is distinct from f.response or result#>'{event,cancellationReason}'is not null or result#>'{event,linkedMissionId}'is not null then raise exception 'Legacy response was rewritten';end if;
 if not exists(select 1 from public.group_activity_receipts where actor_id=f.actor and request_id=f.request and response=f.response)then raise exception 'Legacy receipt changed';end if;
 if f.core_oid<>'public.group_activities_dispatch_before_operations(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure::oid or f.dispatch_oid<>'public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure::oid or f.projection_oid<>'public.group_event_json(uuid,uuid)'::regprocedure::oid then raise exception 'Function OID changed';end if;
 if f.projection_service_execute is distinct from has_function_privilege('service_role','public.group_event_json(uuid,uuid)','execute')or has_function_privilege('service_role','public.group_event_json_before_source_fields(uuid,uuid)','execute')then raise exception 'Projection grants changed';end if;
 -- Stored state may change later; the old immutable receipt must still replay its original JSON.
 update public.group_events set cancellation_reason='Later manager reason'where id=f.event;
 if public.group_activities_dispatch('event-save',f.actor,f.page,null,null,f.input)is distinct from f.response then raise exception 'Legacy replay now depends on new stored fields';end if;
 raise notice 'PASS existing cancelled rows, legacy exact receipt replay, original OIDs and private projection grants';
end $$;
rollback;
