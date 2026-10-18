do $$
declare recovered jsonb;
begin
  if not exists(
    select 1 from information_schema.columns
    where table_schema='public'and table_name='mobile_participation_events'and column_name='hero_url'
  )then raise exception'event presentation columns missing';end if;
  recovered:=public.read_owned_mobile_participation_post_request(
    '5c000000-0000-4000-8000-000000000001','5c000000-0000-4000-8000-000000000006'
  );
  if recovered->>'operation'<>'create'or recovered->>'id'<>'5c000000-0000-4000-8000-000000000005'
    or recovered->>'replayed'<>'true'then
    raise exception'existing post request was not backfilled: %',recovered;
  end if;
end$$;
