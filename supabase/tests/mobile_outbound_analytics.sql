\set ON_ERROR_STOP on
begin;

do $$
declare
  properties jsonb := '{"destinationHost":"tickets.example.com","campaign":"byus","placement":"content","linkKind":"external"}';
  first_result jsonb;
  replay_result jsonb;
  invalid jsonb;
  rejected boolean;
begin
  first_result := public.record_product_event_v1(1::smallint,'outbound_link_click',null,repeat('e',64),null,null,null,null,
    'mobile.outbound','outbound:mobile-20261012',statement_timestamp(),properties);
  replay_result := public.record_product_event_v1(1::smallint,'outbound_link_click',null,repeat('e',64),null,null,null,null,
    'mobile.outbound','outbound:mobile-20261012',statement_timestamp(),properties);
  if first_result->>'id' is distinct from replay_result->>'id' or not (replay_result->>'replayed')::boolean then
    raise exception 'MOBILE_OUTBOUND_REPLAY_FAILED';
  end if;
  perform public.record_product_event_v1(1::smallint,'outbound_link_click',null,repeat('f',64),null,null,null,null,
    'web.outbound','outbound:web-after-mobile-20261012',statement_timestamp(),properties);

  foreach invalid in array array[
    properties || '{"url":"https://tickets.example.com/?token=secret"}'::jsonb,
    properties || '{"campaign":"private@example.com"}'::jsonb,
    properties || '{"destinationHost":"example.com/private"}'::jsonb
  ] loop
    rejected := false;
    begin
      perform public.record_product_event_v1(1::smallint,'outbound_link_click',null,repeat('e',64),null,null,null,null,
        'mobile.outbound','outbound:invalid-mobile-20261012',statement_timestamp(),invalid);
    exception when sqlstate '22023' then rejected := true;
    end;
    if not rejected then raise exception 'MOBILE_OUTBOUND_PRIVATE_METADATA_ACCEPTED'; end if;
  end loop;

  rejected := false;
  begin
    perform public.record_product_event_v1(1::smallint,'outbound_link_click',null,repeat('e',64),'95600000-0000-4000-8000-000000000001',null,null,null,
      'mobile.outbound','outbound:identified-mobile-20261012',statement_timestamp(),properties);
  exception when sqlstate '22023' then rejected := true;
  end;
  if not rejected then raise exception 'MOBILE_OUTBOUND_IDENTITY_ACCEPTED'; end if;
  raise notice 'MOBILE_OUTBOUND anonymous identity, private metadata rejection, replay and legacy web: PASS';
end $$;

rollback;
