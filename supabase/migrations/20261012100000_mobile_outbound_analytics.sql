begin;

alter table public.fan_product_events
  drop constraint fan_product_events_outbound_link_contract,
  add constraint fan_product_events_outbound_link_contract check (
    event_name <> 'outbound_link_click' or (
      app_user_id is null
      and anonymous_session_hash is not null
      and celebrity_id is null
      and live_event_id is null
      and mission_id is null
      and benefit_id is null
      and source in ('web.outbound','mobile.outbound')
      and jsonb_typeof(properties) = 'object'
      and properties ?& array['destinationHost','campaign','placement','linkKind']
      and (properties - array['destinationHost','campaign','placement','linkKind']::text[]) = '{}'::jsonb
      and jsonb_typeof(properties->'destinationHost') = 'string'
      and char_length(properties->>'destinationHost') between 1 and 253
      and properties->>'destinationHost' ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
      and jsonb_typeof(properties->'campaign') = 'string'
      and char_length(properties->>'campaign') between 1 and 80
      and properties->>'campaign' ~ '^[a-z0-9]+([-_][a-z0-9]+)*$'
      and jsonb_typeof(properties->'placement') = 'string'
      and properties->>'placement' in ('fanpage_hero','header','footer','content')
      and jsonb_typeof(properties->'linkKind') = 'string'
      and properties->>'linkKind' in ('ticket','website','social','external')
    )
  );

do $$
declare
  definition text := pg_catalog.pg_get_functiondef(
    'public.record_product_event_v1(smallint,text,uuid,text,uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb)'::regprocedure);
  old_check text := $patch$p_source <> 'web.outbound'$patch$;
begin
  if (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_check,''))) / pg_catalog.length(old_check) <> 1 then
    raise exception 'PRODUCT_EVENT_MOBILE_OUTBOUND_SHAPE_CHANGED';
  end if;
  execute pg_catalog.replace(definition,old_check,$patch$p_source not in ('web.outbound','mobile.outbound')$patch$);
end $$;

commit;
