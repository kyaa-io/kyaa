-- Funnel events in the self ledger (funnel-audit A-3, A-5, A-7, A-8).
--   page_view          client, anonymous only, one per screen: kind of screen + coarse context, no path or query.
--   share_completed    client, member or anonymous: share method and content kind only.
--   fan_verification_started / fan_verification_submitted, daily_checkin_completed, post_created,
--   comment_created, cheer_completed: projected from the business row on commit (server.commit_projection),
--   keyed by the row id, so retries and replays are recorded once.
-- record_product_event_v1 is patched in place (same pattern as 20261012100000) so earlier rules stay intact.
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
    'page_view','share_completed','fan_verification_started','fan_verification_submitted',
    'daily_checkin_completed','post_created','comment_created','cheer_completed'
  ));

create index if not exists fan_product_events_page_view_occurred_idx
  on public.fan_product_events (occurred_at)
  include (anonymous_session_hash)
  where event_name = 'page_view';

do $patch$
declare
  definition text := pg_catalog.pg_get_functiondef(
    'public.record_product_event_v1(smallint,text,uuid,text,uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb)'::regprocedure);
  names_anchor text := $a$'login_result','account_created','profile_completed','outbound_link_click'$a$;
  names_patched text := $a$'login_result','account_created','profile_completed','outbound_link_click',
       'page_view','share_completed','fan_verification_started','fan_verification_submitted',
       'daily_checkin_completed','post_created','comment_created','cheer_completed'$a$;
  declare_anchor text := $a$  wallet_reconciliation_ms numeric;
$a$;
  declare_patched text := $a$  wallet_reconciliation_ms numeric;
  funnel_entity_id uuid;
$a$;
  rules_anchor text := $a$  if p_event_name in ('ticket_credited', 'ticket_debited') then$a$;
  rules_patched text := $a$  -- funnel events (20261219010000)
  if p_event_name = 'page_view' and (
    p_app_user_id is not null
    or p_anonymous_session_hash is null
    or p_celebrity_id is not null or p_live_event_id is not null
    or p_mission_id is not null or p_benefit_id is not null
    or p_source <> 'web.page_view'
    or p_idempotency_key !~ '^page-view:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or not (p_properties ?& array['pageKind','entry','channel','device','browser','os'])
    or (p_properties - array['pageKind','entry','channel','device','browser','os']::text[]) <> '{}'::jsonb
    or jsonb_typeof(p_properties->'pageKind') <> 'string'
    or jsonb_typeof(p_properties->'entry') <> 'boolean'
    or jsonb_typeof(p_properties->'channel') <> 'string'
    or jsonb_typeof(p_properties->'device') <> 'string'
    or jsonb_typeof(p_properties->'browser') <> 'string'
    or jsonb_typeof(p_properties->'os') <> 'string'
    or p_properties->>'pageKind' not in ('home','creator_directory','creator','live_directory','live','benefit',
      'fan_guide','community','login','onboarding','my','passport','verification','other')
    or p_properties->>'channel' not in ('direct','search','social','email','paid','referral','internal')
    or (p_properties->>'entry' = 'false' and p_properties->>'channel' <> 'internal')
    or p_properties->>'device' not in ('mobile','tablet','desktop')
    or p_properties->>'browser' not in ('instagram','kakao','safari','chrome','other')
    or p_properties->>'os' not in ('ios','android','other')
  ) then
    raise exception 'PRODUCT_EVENT_INVALID' using errcode = '22023';
  end if;

  if p_event_name = 'share_completed' and (
    p_celebrity_id is not null or p_live_event_id is not null
    or p_mission_id is not null or p_benefit_id is not null
    or p_source <> 'web.share'
    or p_idempotency_key !~ '^share:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:completed$'
    or not (p_properties ?& array['method','contentType'])
    or (p_properties - array['method','contentType']::text[]) <> '{}'::jsonb
    or jsonb_typeof(p_properties->'method') <> 'string'
    or jsonb_typeof(p_properties->'contentType') <> 'string'
    or p_properties->>'method' not in ('native','copy')
    or p_properties->>'contentType' not in ('post','notice','passport','jjinfan','share_proof')
  ) then
    raise exception 'PRODUCT_EVENT_INVALID' using errcode = '22023';
  end if;

  if p_event_name in ('fan_verification_started','fan_verification_submitted','daily_checkin_completed',
                      'post_created','comment_created','cheer_completed') then
    if jsonb_typeof(p_properties->'businessEntityId') is distinct from 'string' then
      raise exception 'PRODUCT_EVENT_COMMIT_SOURCE_INVALID' using errcode = '23514';
    end if;
    begin
      funnel_entity_id := (p_properties->>'businessEntityId')::uuid;
    exception when others then
      raise exception 'PRODUCT_EVENT_COMMIT_SOURCE_INVALID' using errcode = '23514';
    end;
    if p_app_user_id is null
       or p_anonymous_session_hash is not null
       or p_celebrity_id is null
       or p_live_event_id is not null or p_mission_id is not null or p_benefit_id is not null
       or p_source <> 'server.commit_projection'
       or p_idempotency_key <> 'server:' || p_event_name || ':' || funnel_entity_id::text
       or (p_event_name = 'fan_verification_started' and (
         (p_properties - 'businessEntityId') <> '{}'::jsonb
         or not exists (select 1 from public.quiz_attempts source_record
           where source_record.id = funnel_entity_id and source_record.app_user_id = p_app_user_id
             and source_record.celebrity_id = p_celebrity_id)
       ))
       or (p_event_name = 'fan_verification_submitted' and (
         (p_properties - array['businessEntityId','outcome','reason','score']::text[]) <> '{}'::jsonb
         or not (p_properties ?& array['outcome','reason','score'])
         or jsonb_typeof(p_properties->'score') <> 'number'
         or not (
           (p_properties->>'outcome' = 'passed' and p_properties->>'reason' = 'none')
           or (p_properties->>'outcome' = 'failed' and p_properties->>'reason' = 'score_below_pass')
         )
         or not exists (select 1 from public.quiz_attempts source_record
           where source_record.id = funnel_entity_id and source_record.app_user_id = p_app_user_id
             and source_record.celebrity_id = p_celebrity_id
             and source_record.status::text = p_properties->>'outcome'
             and source_record.score::text = p_properties->>'score')
       ))
       or (p_event_name = 'daily_checkin_completed' and (
         (p_properties - array['businessEntityId','streak']::text[]) <> '{}'::jsonb
         or jsonb_typeof(p_properties->'streak') <> 'number'
         or not exists (select 1 from public.group_creator_attendance source_record
           where source_record.id = funnel_entity_id and source_record.app_user_id = p_app_user_id
             and source_record.celebrity_id = p_celebrity_id
             and source_record.streak::text = p_properties->>'streak')
       ))
       or (p_event_name = 'post_created' and (
         (p_properties - array['businessEntityId','category']::text[]) <> '{}'::jsonb
         or not exists (select 1 from public.fan_posts source_record
           where source_record.id = funnel_entity_id and source_record.app_user_id = p_app_user_id
             and source_record.celebrity_id = p_celebrity_id
             and source_record.category = p_properties->>'category')
       ))
       or (p_event_name = 'comment_created' and (
         (p_properties - array['businessEntityId','reply']::text[]) <> '{}'::jsonb
         or jsonb_typeof(p_properties->'reply') <> 'boolean'
         or not exists (select 1 from public.fan_post_comments source_record
           join public.fan_posts post on post.id = source_record.post_id
           where source_record.id = funnel_entity_id and source_record.app_user_id = p_app_user_id
             and post.celebrity_id = p_celebrity_id
             and (source_record.parent_id is not null)::text = p_properties->>'reply')
       ))
       or (p_event_name = 'cheer_completed' and (
         (p_properties - 'businessEntityId') <> '{}'::jsonb
         or not exists (select 1 from public.fan_lounge_messages source_record
           where source_record.id = funnel_entity_id and source_record.app_user_id = p_app_user_id
             and source_record.celebrity_id = p_celebrity_id and source_record.reply_to_id is null)
       )) then
      raise exception 'PRODUCT_EVENT_COMMIT_SOURCE_INVALID' using errcode = '23514';
    end if;
  end if;

  if p_event_name in ('ticket_credited', 'ticket_debited') then$a$;
  anchor text;
begin
  foreach anchor in array array[names_anchor, declare_anchor, rules_anchor] loop
    if (pg_catalog.length(definition) - pg_catalog.length(pg_catalog.replace(definition, anchor, '')))
       / pg_catalog.length(anchor) <> 1 then
      raise exception 'PRODUCT_EVENT_FUNNEL_SHAPE_CHANGED: %', pg_catalog.left(anchor, 40);
    end if;
  end loop;
  definition := pg_catalog.replace(definition, names_anchor, names_patched);
  definition := pg_catalog.replace(definition, declare_anchor, declare_patched);
  definition := pg_catalog.replace(definition, rules_anchor, rules_patched);
  execute definition;
end $patch$;

-- One projector for the funnel tables. A failed projection never blocks the business write.
create function public.project_funnel_activity_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text;
  v_owner uuid := new.app_user_id;
  v_celebrity uuid;
  v_occurred timestamptz;
  v_properties jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'quiz_attempts' then
    v_celebrity := new.celebrity_id;
    if tg_op = 'INSERT' then
      if new.status::text <> 'open' then return new; end if;
      v_event := 'fan_verification_started'; v_occurred := new.created_at;
    else
      if old.status::text <> 'open' or new.status::text not in ('passed','failed') then return new; end if;
      v_event := 'fan_verification_submitted'; v_occurred := new.submitted_at;
      v_properties := pg_catalog.jsonb_build_object(
        'outcome', new.status::text,
        'reason', case when new.status::text = 'passed' then 'none' else 'score_below_pass' end,
        'score', new.score);
    end if;
  elsif tg_table_name = 'group_creator_attendance' then
    v_event := 'daily_checkin_completed'; v_celebrity := new.celebrity_id; v_occurred := new.created_at;
    v_properties := pg_catalog.jsonb_build_object('streak', new.streak);
  elsif tg_table_name = 'fan_posts' then
    v_event := 'post_created'; v_celebrity := new.celebrity_id; v_occurred := new.created_at;
    v_properties := pg_catalog.jsonb_build_object('category', new.category);
  elsif tg_table_name = 'fan_post_comments' then
    v_event := 'comment_created'; v_occurred := new.created_at;
    select post.celebrity_id into v_celebrity from public.fan_posts post where post.id = new.post_id;
    v_properties := pg_catalog.jsonb_build_object('reply', new.parent_id is not null);
  elsif tg_table_name = 'fan_lounge_messages' then
    if new.reply_to_id is not null then return new; end if;
    v_event := 'cheer_completed'; v_celebrity := new.celebrity_id; v_occurred := new.created_at;
  else
    return new;
  end if;
  v_properties := v_properties || pg_catalog.jsonb_build_object('businessEntityId', new.id);
  begin
    perform public.record_product_event_v1(1::smallint, v_event, v_owner, null, v_celebrity, null, null, null,
      'server.commit_projection', 'server:' || v_event || ':' || new.id::text, v_occurred, v_properties);
  exception when others then
    raise warning 'product event projection skipped: % %', v_event, sqlstate;
  end;
  return new;
end;
$$;

revoke all on function public.project_funnel_activity_event_v1() from public, anon, authenticated, service_role;

create trigger quiz_attempts_funnel_event_insert after insert on public.quiz_attempts
  for each row execute function public.project_funnel_activity_event_v1();
create trigger quiz_attempts_funnel_event_update after update of status on public.quiz_attempts
  for each row execute function public.project_funnel_activity_event_v1();
create trigger group_creator_attendance_funnel_event after insert on public.group_creator_attendance
  for each row execute function public.project_funnel_activity_event_v1();
create trigger fan_posts_funnel_event after insert on public.fan_posts
  for each row execute function public.project_funnel_activity_event_v1();
create trigger fan_post_comments_funnel_event after insert on public.fan_post_comments
  for each row execute function public.project_funnel_activity_event_v1();
create trigger fan_lounge_messages_funnel_event after insert on public.fan_lounge_messages
  for each row execute function public.project_funnel_activity_event_v1();

-- /admin/traffic visits, from the ledger's page_view instead of Vercel Web Analytics.
create function public.read_admin_web_traffic(
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
  v_now timestamptz := statement_timestamp();
  v_to timestamptz;
  v_from timestamptz;
  v_result jsonb;
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, false);
  if p_days is null or p_days not in (7,30,90) then
    raise exception 'WEB_TRAFFIC_INVALID_DAYS' using errcode = '22023';
  end if;
  v_to := (pg_catalog.date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC') + interval '1 day';
  v_from := v_to - pg_catalog.make_interval(days => p_days);

  with views as (
    select event.anonymous_session_hash as session, event.occurred_at, event.properties as p
    from public.fan_product_events event
    where event.event_name = 'page_view' and event.occurred_at >= v_from and event.occurred_at < v_to
  ), by_day as (
    select (occurred_at at time zone 'UTC')::date as day, count(distinct session) as visitors, count(*) as pageviews
    from views group by 1
  ), breakdown as (
    select dimension, label, count(distinct session) as visitors, count(*) as pageviews
    from views cross join lateral (values
      ('pages', p->>'pageKind'),
      ('referrers', case when p->>'entry' = 'true' then p->>'channel' end),
      ('devices', p->>'device'),
      ('browsers', p->>'browser'),
      ('operatingSystems', p->>'os')
    ) d(dimension, label)
    where label is not null
    group by dimension, label
  )
  select pg_catalog.jsonb_build_object(
    'days', p_days, 'from', v_from, 'to', v_to, 'fetchedAt', v_now,
    'totals', (select pg_catalog.jsonb_build_object('visitors', count(distinct session), 'pageviews', count(*)) from views),
    'trend', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'date', day.value::text,
        'visitors', coalesce(by_day.visitors, 0),
        'pageviews', coalesce(by_day.pageviews, 0)) order by day.value)
      from (select ((v_from at time zone 'UTC')::date + offs) as value
            from pg_catalog.generate_series(0, p_days - 1) offs) day
      left join by_day on by_day.day = day.value),
    'breakdowns', (select pg_catalog.jsonb_build_object(
        'pages', coalesce(pg_catalog.jsonb_agg(row_json order by pageviews desc, label) filter (where dimension = 'pages'), '[]'::jsonb),
        'referrers', coalesce(pg_catalog.jsonb_agg(row_json order by pageviews desc, label) filter (where dimension = 'referrers'), '[]'::jsonb),
        'devices', coalesce(pg_catalog.jsonb_agg(row_json order by pageviews desc, label) filter (where dimension = 'devices'), '[]'::jsonb),
        'browsers', coalesce(pg_catalog.jsonb_agg(row_json order by pageviews desc, label) filter (where dimension = 'browsers'), '[]'::jsonb),
        'operatingSystems', coalesce(pg_catalog.jsonb_agg(row_json order by pageviews desc, label) filter (where dimension = 'operatingSystems'), '[]'::jsonb))
      from (select dimension, label, pageviews,
              pg_catalog.jsonb_build_object('label', label, 'visitors', visitors, 'pageviews', pageviews) as row_json
            from breakdown) rows)
  ) into v_result;
  return v_result;
end;
$$;

-- Four steps in one UTC period. Steps are period counts, not one cohort followed through:
--   visitors: sessions with a page_view; accounts: app_users created; verified: members whose first passport
--   was issued; first activity: members whose first check-in, post, comment, cheer or signed-in share happened.
create function public.read_admin_funnel_analytics(
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
  v_now timestamptz := statement_timestamp();
  v_to timestamptz;
  v_from timestamptz;
  v_visitors bigint;
  v_page_views_since timestamptz;
  v_accounts bigint;
  v_verified bigint;
  v_first_activity bigint;
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, false);
  if p_days is null or p_days not in (7,30,90) then
    raise exception 'FUNNEL_ANALYTICS_INVALID_DAYS' using errcode = '22023';
  end if;
  v_to := (pg_catalog.date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC') + interval '1 day';
  v_from := v_to - pg_catalog.make_interval(days => p_days);

  select count(distinct event.anonymous_session_hash) into v_visitors
  from public.fan_product_events event
  where event.event_name = 'page_view' and event.occurred_at >= v_from and event.occurred_at < v_to;

  select min(event.occurred_at) into v_page_views_since
  from public.fan_product_events event where event.event_name = 'page_view';

  select count(*) into v_accounts from public.app_users member
  where member.created_at >= v_from and member.created_at < v_to;

  select count(*) into v_verified from (
    select passport.app_user_id from public.fan_passports passport
    group by passport.app_user_id
    having min(passport.issued_at) >= v_from and min(passport.issued_at) < v_to
  ) firsts;

  select count(*) into v_first_activity from (
    select activity.app_user_id from (
      select app_user_id, created_at as at from public.group_creator_attendance
      union all select app_user_id, created_at from public.fan_posts
      union all select app_user_id, created_at from public.fan_post_comments
      union all select app_user_id, created_at from public.fan_lounge_messages where reply_to_id is null
      union all select app_user_id, occurred_at from public.fan_product_events
        where event_name = 'share_completed' and app_user_id is not null
    ) activity
    group by activity.app_user_id
    having min(activity.at) >= v_from and min(activity.at) < v_to
  ) firsts;

  return pg_catalog.jsonb_build_object(
    'days', p_days, 'from', v_from, 'to', v_to,
    'pageViewsSince', v_page_views_since,
    'steps', pg_catalog.jsonb_build_object(
      'visitors', v_visitors,
      'accountCreated', v_accounts,
      'fanVerified', v_verified,
      'firstActivity', v_first_activity));
end;
$$;

revoke all on function public.read_admin_web_traffic(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.read_admin_web_traffic(uuid,uuid,integer) to service_role;
revoke all on function public.read_admin_funnel_analytics(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.read_admin_funnel_analytics(uuid,uuid,integer) to service_role;

commit;
