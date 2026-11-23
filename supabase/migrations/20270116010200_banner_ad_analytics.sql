begin;
set local lock_timeout = '5s';

alter table public.fan_product_events
  drop constraint fan_product_events_event_name_check,
  add constraint fan_product_events_event_name_check check (event_name in (
    'creator_page_view','live_page_view','live_cta_click','benefit_page_view',
    'reaction_completed','passport_issued','reservation_completed',
    'attendance_completed','mission_completed','ticket_credited','ticket_debited',
    'journey_completed','collectible_claimed','benefit_entered','benefit_won',
    'fulfillment_completed','signup_guide_view','signup_guide_cta','login_started',
    'login_result','account_created','profile_completed','outbound_link_click',
    'browser_handoff','ad_impression','page_view','share_completed','fan_verification_started','fan_verification_submitted',
    'daily_checkin_completed','post_created','comment_created','cheer_completed'
  )) not valid;
alter table public.fan_product_events validate constraint fan_product_events_event_name_check;



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
      and (properties - array['adId','advertiser','destinationHost','campaign','placement','linkKind']::text[]) = '{}'::jsonb
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


alter table public.fan_product_events add constraint fan_ad_properties check (
  (event_name <> 'ad_impression' and not (event_name = 'outbound_link_click' and properties ?| array['adId','advertiser']))
  or (source = 'web.outbound' and app_user_id is null and anonymous_session_hash is not null
    and celebrity_id is null and live_event_id is null and mission_id is null and benefit_id is null
    and (event_name <> 'ad_impression' or properties - array['adId','advertiser'] = '{}'::jsonb)
    and coalesce((properties->>'adId',properties->>'advertiser') in (
      ('05cc6f49-d624-4cdb-ad65-475194d4af80','beepio'),('a002b205-c7ff-4bc9-b067-fb8d69e81be2','beepio'),
      ('51a0830e-406e-4fb6-9895-0bb84d70b9d1','chillsa'),('586383c4-bcb2-4910-bd33-d9e558c93a21','chillsa')),false))
);

do $$
declare
  body text := pg_get_functiondef('public.record_product_event_v1(smallint,text,uuid,text,uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb)'::regprocedure);
begin
  if position('''browser_handoff'',''login_result''' in body) = 0
    or position($old$p_properties - array['destinationHost','campaign','placement','linkKind']$old$ in body) = 0 then
    raise exception 'Ad analytics RPC shape changed';
  end if;
  body := replace(body,'''browser_handoff'',''login_result''','''ad_impression'',''browser_handoff'',''login_result''');
  execute replace(body,$old$p_properties - array['destinationHost','campaign','placement','linkKind']$old$,
    $new$p_properties - array['adId','advertiser','destinationHost','campaign','placement','linkKind']$new$);
end $$;

create unique index fan_ad_session_impression on public.fan_product_events
  (anonymous_session_hash, (properties->>'adId')) where event_name='ad_impression';

create function public.read_admin_banner_month(p_actor uuid,p_allowlist uuid,p_month date)
returns table(ad_id uuid, advertiser text, impressions bigint, clicks bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_active_admin(p_actor,p_allowlist,false);
  return query
  with ads(id,slug) as (values
    ('05cc6f49-d624-4cdb-ad65-475194d4af80'::uuid,'beepio'),('a002b205-c7ff-4bc9-b067-fb8d69e81be2'::uuid,'beepio'),
    ('51a0830e-406e-4fb6-9895-0bb84d70b9d1'::uuid,'chillsa'),('586383c4-bcb2-4910-bd33-d9e558c93a21'::uuid,'chillsa'))
  select ads.id,ads.slug,count(distinct e.anonymous_session_hash) filter(where e.event_name='ad_impression'),
    count(*) filter(where e.event_name='outbound_link_click')
  from ads left join public.fan_product_events e on e.properties->>'adId'=ads.id::text
    and e.event_name in ('ad_impression','outbound_link_click')
    and e.occurred_at >= (p_month::timestamp at time zone 'Asia/Seoul')
    and e.occurred_at < ((p_month + interval '1 month') at time zone 'Asia/Seoul')
  where exists(select 1 from public.home_banners b where b.id=ads.id) or e.event_name is not null
  group by ads.id,ads.slug order by ads.slug,ads.id;
end $$;
revoke all on function public.read_admin_banner_month(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.read_admin_banner_month(uuid,uuid,date) to service_role;
commit;
