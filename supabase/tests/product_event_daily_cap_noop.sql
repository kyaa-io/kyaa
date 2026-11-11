\set ON_ERROR_STOP on
-- Run only on a disposable migrated test database. No production connection.
begin;
do $$
declare
  owner_hash text := encode(extensions.gen_random_bytes(32), 'hex');
  result jsonb;
  n integer;
begin
  for i in 1..501 loop
    result := public.record_product_event_v1(
      1::smallint, 'page_view', null, owner_hash, null, null, null, null,
      'web.page_view', 'page-view:' || extensions.gen_random_uuid()::text,
      statement_timestamp(),
      '{"pageKind":"home","entry":false,"channel":"internal","device":"desktop","browser":"chrome","os":"other"}'::jsonb);
    if i <= 500 and result->>'id' is null then
      raise exception 'Event % unexpectedly dropped: %', i, result;
    end if;
  end loop;
  if result is distinct from '{"skipped":true,"reason":"daily_cap"}'::jsonb then
    raise exception '501st event must be a successful no-op: %', result;
  end if;
  select count(*) into n from public.fan_product_events where anonymous_session_hash = owner_hash;
  if n <> 500 then raise exception 'Expected 500 rows, got %', n; end if;
end $$;
rollback;
