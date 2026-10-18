begin;

-- Direct ledger reads remain denied to service_role; this RPC returns bounded aggregates only.
create function public.read_admin_acquisition_analytics(
  p_actor_app_user_id uuid,
  p_actor_admin_allowlist_id uuid,
  p_days integer
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_to timestamptz := statement_timestamp();
  v_from timestamptz;
  v_totals jsonb;
  v_rows jsonb;
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
  if p_days is null or p_days not in (7,30,90) then
    raise exception 'ACQUISITION_ANALYTICS_INVALID_DAYS' using errcode = '22023';
  end if;
  v_from := (pg_catalog.date_trunc('day',v_to at time zone 'UTC') at time zone 'UTC')
    - pg_catalog.make_interval(days => p_days - 1);

  with first_acquisitions as (
    -- The first identified touch inside this period; anonymous sessions are never joined.
    select distinct on (event.app_user_id)
      event.app_user_id,event.occurred_at,
      event.properties->>'channel' as channel,event.properties->>'landing' as landing
    from public.fan_product_events event
    where event.app_user_id is not null
      and event.event_name = 'creator_page_view'
      and event.source in ('acquisition.session_landing','acquisition.identified_handoff')
      and event.properties->>'channel' in ('direct','search','social','email','paid','referral','internal')
      and event.properties->>'landing' in ('home','creator_directory','creator','live_directory','live','benefit','fan_guide')
      and event.occurred_at >= v_from and event.occurred_at <= v_to
    order by event.app_user_id,event.occurred_at,event.id
  ), per_user as (
    select acquisition.app_user_id,acquisition.channel,acquisition.landing,
      bool_or(event.event_name = 'account_created') as account_created,
      bool_or(event.event_name = 'profile_completed') as profile_completed,
      bool_or(event.event_name = 'reservation_completed') as reservation_completed,
      bool_or(event.event_name = 'benefit_entered') as benefit_entered
    from first_acquisitions acquisition
    left join public.fan_product_events event
      on event.app_user_id = acquisition.app_user_id
      and event.source = 'server.commit_projection'
      and event.event_name in ('account_created','profile_completed','reservation_completed','benefit_entered')
      and event.occurred_at >= v_from and event.occurred_at >= acquisition.occurred_at and event.occurred_at <= v_to
    group by acquisition.app_user_id,acquisition.channel,acquisition.landing
  ), grouped as (
    select channel,landing,count(*) as acquisitions,
      count(*) filter (where account_created) as account_created,
      count(*) filter (where profile_completed) as profile_completed,
      count(*) filter (where reservation_completed) as reservation_completed,
      count(*) filter (where benefit_entered) as benefit_entered
    from per_user group by channel,landing
  ), cells as (
    select grouped.channel,grouped.landing,metric.key,metric.value
    from grouped cross join lateral (values
      ('acquisitions',grouped.acquisitions),('accountCreated',grouped.account_created),
      ('profileCompleted',grouped.profile_completed),('reservationCompleted',grouped.reservation_completed),
      ('benefitEntered',grouped.benefit_entered)
    ) metric(key,value)
  ), row_metrics as (
    select channel,landing,jsonb_object_agg(key,jsonb_build_object(
      'state',case when value between 1 and 4 then 'suppressed' else 'available' end,
      'value',case when value between 1 and 4 then null else value end,
      'reason',case when value between 1 and 4 then 'SMALL_COHORT_LT_5' else null end,
      'source','fan_product_events'
    )) as metrics from cells group by channel,landing
  ), total_values as (
    select keys.key,coalesce(sum(cells.value),0) as value,
      coalesce(bool_or(cells.value between 1 and 4),false) as hidden
    from (values ('acquisitions'),('accountCreated'),('profileCompleted'),('reservationCompleted'),('benefitEntered')) keys(key)
    left join cells on cells.key = keys.key group by keys.key
  )
  select
    (select jsonb_object_agg(key,jsonb_build_object(
      'state',case when hidden then 'suppressed' else 'available' end,
      'value',case when hidden then null else value end,
      'reason',case when hidden then 'SMALL_COHORT_LT_5' else null end,
      'source','fan_product_events'
    )) from total_values),
    (select coalesce(jsonb_agg(jsonb_build_object('channel',channel,'landing',landing) || metrics
      order by channel,landing),'[]'::jsonb) from row_metrics)
  into v_totals,v_rows;

  return jsonb_build_object('days',p_days,'from',v_from,'to',v_to,'totals',v_totals,'rows',v_rows);
end;
$$;

revoke all on function public.read_admin_acquisition_analytics(uuid,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.read_admin_acquisition_analytics(uuid,uuid,integer) to service_role;

commit;
