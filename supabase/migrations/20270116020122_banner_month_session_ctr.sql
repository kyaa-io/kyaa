begin;
set local lock_timeout = '5s';

create function public.read_admin_banner_month_v2(p_actor uuid,p_allowlist uuid,p_month date)
returns table(ad_id uuid, advertiser text, impressions bigint, clicks bigint, clicked_sessions bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_active_admin(p_actor,p_allowlist,false);
  return query
  with ads(id,slug) as (values
    ('05cc6f49-d624-4cdb-ad65-475194d4af80'::uuid,'beepio'),('a002b205-c7ff-4bc9-b067-fb8d69e81be2'::uuid,'beepio'),
    ('51a0830e-406e-4fb6-9895-0bb84d70b9d1'::uuid,'chillsa'),('586383c4-bcb2-4910-bd33-d9e558c93a21'::uuid,'chillsa')),
  sessions as (
    select ads.id, e.anonymous_session_hash,
      bool_or(e.event_name = 'ad_impression') as exposed,
      count(*) filter (where e.event_name = 'outbound_link_click') as clicks
    from ads join public.fan_product_events e on e.properties->>'adId' = ads.id::text
      and e.event_name in ('ad_impression', 'outbound_link_click')
      and e.occurred_at >= (p_month::timestamp at time zone 'Asia/Seoul')
      and e.occurred_at < ((p_month + interval '1 month') at time zone 'Asia/Seoul')
    group by ads.id, e.anonymous_session_hash
  )
  select ads.id, ads.slug,
    count(*) filter (where sessions.exposed),
    coalesce(sum(sessions.clicks), 0)::bigint,
    count(*) filter (where sessions.exposed and sessions.clicks > 0)
  from ads left join sessions on sessions.id = ads.id
  where exists(select 1 from public.home_banners b where b.id=ads.id) or sessions.id is not null
  group by ads.id,ads.slug order by ads.slug,ads.id;
end $$;
revoke all on function public.read_admin_banner_month_v2(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.read_admin_banner_month_v2(uuid,uuid,date) to service_role;
commit;
