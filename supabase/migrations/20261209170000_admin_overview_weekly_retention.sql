-- Adds activity.weeklyRetention: of the members active in the previous 7 KST days,
-- how many were active again in the current rolling 7 KST days (same windows and
-- tracked actions as activity.weekly). Existing fields, signature and grants are
-- unchanged. Group activity emits no product events and is not included.

create or replace function public.read_admin_overview(
  p_actor_app_user_id uuid,
  p_actor_admin_allowlist_id uuid,
  p_days integer default 30,
  p_as_of timestamptz default statement_timestamp()
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_today timestamptz;
  v_from timestamptz;
  v_previous_from timestamptz;
  v_week timestamptz;
  v_month timestamptz;
  v_result jsonb;
begin
  perform public.assert_blockchain_job_admin_actor(p_actor_app_user_id, p_actor_admin_allowlist_id, false);
  if p_days is null or p_days not in (7,30,90) or p_as_of is null
     or not isfinite(p_as_of) or p_as_of > statement_timestamp() + interval '1 minute' then
    raise exception 'invalid overview window' using errcode = '22023';
  end if;
  v_today := date_trunc('day', p_as_of at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  v_from := v_today - make_interval(days => p_days - 1);
  v_previous_from := v_from - (p_as_of - v_from);
  v_week := v_today - interval '6 days';
  v_month := v_today - interval '29 days';

  with daily as (
    select (u.created_at at time zone 'Asia/Seoul')::date as bucket_date, count(*)::integer n
    from public.app_users u where u.created_at >= v_from and u.created_at < p_as_of group by 1
  ), days as (
    select d::date as bucket_date from generate_series(
      (v_from at time zone 'Asia/Seoul')::date,
      (p_as_of at time zone 'Asia/Seoul')::date, interval '1 day') d
  ), member_events as materialized (
    select app_user_id, occurred_at from public.fan_product_events
    where app_user_id is not null and occurred_at >= v_month and occurred_at < p_as_of and created_at <= p_as_of
      and event_name in ('creator_page_view','live_page_view','live_cta_click','benefit_page_view',
        'reaction_completed','passport_issued','reservation_completed','attendance_completed',
        'mission_completed','journey_completed','collectible_claimed','benefit_entered')
  ), visible_lives as materialized (
    select e.*, public.live_effective_status_at(e.id,p_as_of)::text effective_status
    from public.live_events e join public.celebrities c on c.id=e.celebrity_id
    where e.publication_status='published' and e.archived_at is null
      and c.status='published' and c.archived_at is null and e.created_at < p_as_of
  ), failures as (
    select status,available_at,last_error_code from public.notification_delivery_outbox
    union all select status,available_at,last_error_code from public.external_notification_delivery_outbox
  )
  select jsonb_build_object(
    'asOf',p_as_of,'from',v_from,'previousFrom',v_previous_from,'days',p_days,
    'members',jsonb_build_object(
      'total',(select count(*) from public.app_users where created_at < p_as_of),
      'signups',jsonb_build_object(
        'current',(select count(*) from public.app_users where created_at >= v_from and created_at < p_as_of),
        'previous',(select count(*) from public.app_users where created_at >= v_previous_from and created_at < v_from)),
      'week',jsonb_build_object(
        'current',(select count(*) from public.app_users where created_at >= v_week and created_at < p_as_of),
        'previous',(select count(*) from public.app_users where created_at >= v_week-(p_as_of-v_week) and created_at < v_week)),
      'month',jsonb_build_object(
        'current',(select count(*) from public.app_users where created_at >= v_month and created_at < p_as_of),
        'previous',(select count(*) from public.app_users where created_at >= v_month-(p_as_of-v_month) and created_at < v_month))
    ),
    'activity',jsonb_build_object(
      'daily',(select count(distinct app_user_id) from member_events where occurred_at >= v_today),
      'weekly',(select count(distinct app_user_id) from member_events where occurred_at >= v_week),
      'weeklyRetention',jsonb_build_object(
        'previous',(select count(distinct app_user_id) from member_events
          where occurred_at >= v_week - interval '7 days' and occurred_at < v_week),
        'returned',(select count(distinct p.app_user_id) from member_events p
          where p.occurred_at >= v_week - interval '7 days' and p.occurred_at < v_week
            and exists (select 1 from member_events c where c.app_user_id = p.app_user_id and c.occurred_at >= v_week))
      ),
      'monthly',(select count(distinct app_user_id) from member_events),
      'measuredSince',(select min(created_at) from public.fan_product_events)
    ),
    'trend',(select coalesce(jsonb_agg(jsonb_build_object('date',days.bucket_date,'signups',coalesce(daily.n,0)) order by days.bucket_date),'[]'::jsonb) from days left join daily using(bucket_date)),
    'usage',jsonb_build_object(
      'passports',(select count(*) from public.fan_passports where issued_at >= v_from and issued_at < p_as_of),
      'reactions',(select count(*) from public.fan_reactions where completed_at >= v_from and completed_at < p_as_of),
      'reservations',(select count(*) from public.live_reservations where reserved_at >= v_from and reserved_at < p_as_of),
      'attendances',(select count(*) from public.live_attendances where attended_at >= v_from and attended_at < p_as_of),
      'entries',(select count(*) from public.benefit_ticket_entries where entered_at >= v_from and entered_at < p_as_of)
    ),
    'content',jsonb_build_object(
      'creators',(select count(*) from public.celebrities where status='published' and archived_at is null),
      'scheduled',(select count(*) from visible_lives where effective_status='scheduled'),
      'live',(select count(*) from visible_lives where effective_status='live'),
      'ended',(select count(*) from visible_lives where effective_status='ended'),
      'cancelled',(select count(*) from visible_lives where effective_status='cancelled'),
      'drafts',(select count(*) from public.live_events where publication_status='draft' and archived_at is null)
    ),
    'issues',jsonb_build_object(
      'certifications',(select count(*) from public.certification_submissions where status='pending'),
      'failedJobs',(select count(*) from public.blockchain_jobs where status='FAILED'),
      'failedNotifications',(select count(*) from failures where status='failed' and available_at='infinity'::timestamptz
        and coalesce(last_error_code,'') not in ('SCHEDULE_SUPERSEDED','LIVE_CANCELLED','EMAIL_KIND_SUPPRESSED','EMAIL_NOT_ELIGIBLE','CURRENT_STATE_INELIGIBLE'))
    ),
    'upcoming',coalesce((select jsonb_agg(to_jsonb(item) order by (item.status='live') desc,item."startsAt",item.id) from (
      select e.id,coalesce(ko.title,e.slug) title,coalesce(en.title,ko.title,e.slug) "titleEn",coalesce(c.name,'') creator,
        e.starts_at "startsAt",e.effective_status status,
        (select count(*) from public.live_reservations r where r.live_event_id=e.id and r.reserved_at<p_as_of) reservations
      from visible_lives e left join public.live_event_localizations ko on ko.live_event_id=e.id and ko.locale='ko'
        left join public.live_event_localizations en on en.live_event_id=e.id and en.locale='en'
        left join public.celebrity_localizations c on c.celebrity_id=e.celebrity_id and c.locale='ko'
      where e.effective_status in ('scheduled','live')
      order by (e.effective_status='live') desc,e.starts_at,e.id limit 5
    ) item),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

revoke all on function public.read_admin_overview(uuid,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.read_admin_overview(uuid,uuid,integer,timestamptz) to service_role;
comment on function public.read_admin_overview(uuid,uuid,integer,timestamptz) is
  'Admin-only counts; KST calendar dates including partial today; signup comparison is the preceding equal duration, while weeklyRetention compares the full 7-day window before the current rolling 7-day window. Activity (daily, rolling 7-day weekly with prior-week retention counts, 30-day monthly) is distinct authenticated owners of tracked user actions, not total site traffic. Current content/queue state is observed at read time.';
