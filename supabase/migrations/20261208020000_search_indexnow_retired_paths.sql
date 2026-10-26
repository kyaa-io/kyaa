-- Remove only retired public routes that the current publication no longer accepts.
do $$
declare
  cached public.search_indexnow_state%rowtype;
  retired_keys text[];
begin
  select * into cached from public.search_indexnow_state where id = 1 for update;
  if not found then return; end if;

  select array_agg('https://kyaa.io' || path || '?locale=' || locale)
    into retired_keys
    from unnest(array['/support', '/fandom', '/pages/live-dashboard']) as paths(path)
    cross join unnest(array['ko', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'id', 'vi', 'th', 'pt', 'fr']) as locales(locale);
  if not (cached.snapshot ?| retired_keys) then return; end if;
  if cached.lease_until > clock_timestamp() then
    raise exception 'INDEXNOW_CACHE_REPAIR_LEASE_ACTIVE';
  end if;
  update public.search_indexnow_state set snapshot = snapshot - retired_keys where id = 1;
end $$;
