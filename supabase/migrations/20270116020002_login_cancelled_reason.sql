-- Preserve the event writer and its privileges while allowing explicit login cancellation.
do $$
declare
  definition text := pg_catalog.pg_get_functiondef(
    'public.record_product_event_v1(smallint,text,uuid,text,uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb)'::regprocedure
  );
  previous constant text := $reasons$'none','timeout','provider_error','session_error','verified_email_required','reauthentication_required','unknown'$reasons$;
begin
  if pg_catalog.strpos(definition, previous) = 0 then
    raise exception 'record_product_event_v1 login reason validation changed';
  end if;
  execute pg_catalog.replace(definition, previous, previous || ',''cancelled''');
end;
$$;
