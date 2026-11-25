-- Extend the same channel allowlist in event ingestion and reporting.
do $$
declare
  target regprocedure;
  definition text;
  original constant text := $channels$'direct','search','social','email','paid','referral','internal'$channels$;
begin
  foreach target in array array[
    'public.record_product_event_v1(smallint,text,uuid,text,uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb)'::regprocedure,
    'public.read_admin_acquisition_analytics(uuid,uuid,integer)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    if strpos(definition, original) = 0 then
      raise exception 'Missing channel allowlist in %', target;
    end if;
    execute replace(definition, original, original || $channels$,'community','kol'$channels$);
  end loop;
end $$;
