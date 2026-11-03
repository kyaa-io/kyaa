\set ON_ERROR_STOP on
\ir seed-groups-pencil-dev.test.sql
begin;
do $$declare actor uuid:='f1610000-0000-4000-8000-000000000002';page uuid:='f1630000-0000-4000-8000-000000000003';event uuid:='f1670000-0000-4000-8000-000000000003';result jsonb;begin
 result:=public.group_activities_dispatch('event-ticket',actor,page,event);
 if result->>'participantName' is distinct from(select nickname from public.user_profiles where app_user_id=actor)or result->>'status'<>'valid' then raise exception 'Ticket participant projection differs';end if;
 if result->>'qrPayload'not like 'kyaa-event:%' then raise exception 'Ticket payload missing';end if;
 begin
  perform public.group_activities_dispatch('event-ticket','f1610000-0000-4000-8000-000000000001',page,event);
  raise exception 'Owner read another participant ticket';
 exception when raise_exception then if sqlerrm<>'GROUP_ACTIVITY_FORBIDDEN' then raise;end if;end;
 update public.group_event_registrations set checked_in_at=now()where event_id=event and app_user_id=actor;
 result:=public.group_activities_dispatch('event-ticket',actor,page,event);
 if result->>'status'<>'checked_in' then raise exception 'Checked-in ticket status missing';end if;
 update public.group_events set state='cancelled'where id=event;
 begin
  perform public.group_activities_dispatch('event-ticket',actor,page,event);
  raise exception 'Cancelled event still issued ticket';
 exception when raise_exception then if sqlerrm<>'GROUP_ACTIVITY_FORBIDDEN' then raise;end if;end;
end $$;
rollback;
