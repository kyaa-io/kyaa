do $$
declare p public.mobile_event_web_upgrade_proof%rowtype;current_projection jsonb;
begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local byus_clean required';end if;
  select*into strict p from public.mobile_event_web_upgrade_proof;
  if p.event_row is distinct from(select to_jsonb(e)from public.mobile_participation_events e where id='7b200000-0000-4000-8000-000000000003')
    or p.rsvp_row is distinct from(select to_jsonb(r)from public.byus_day_rsvps r where id='7b200000-0000-4000-8000-000000000004')then raise exception 'Existing web/event data changed';end if;
  current_projection:=public.read_owned_mobile_participation_event_v2('7b200000-0000-4000-8000-000000000001','7b200000-0000-4000-8000-000000000003','ko')->'event';
  if current_projection-'webApplication' is distinct from p.old_projection then raise exception 'Existing event projection changed';end if;
  if current_projection#>>'{webApplication,status}'<>'not_linked' or exists(select 1 from public.mobile_event_applications)then raise exception 'Existing anonymous RSVP was automatically linked';end if;
end$$;
drop table public.mobile_event_web_upgrade_proof;
