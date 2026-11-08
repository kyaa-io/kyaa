-- Funnel events in the self ledger (funnel-audit A-3, A-5, A-7, A-8).
--   page_view          client, one per screen: kind of screen + coarse context, no path or query. Owned by the member
--                      when signed in, otherwise by the anonymous tab session. A visit (tab session) is its single
--                      entry=true event, so a tab that signs in midway is still one visit.
--   share_completed    client, member or anonymous: share method and content kind only.
--   fan_verification_started / fan_verification_submitted, daily_checkin_completed, post_created,
--   comment_created, cheer_completed: projected from the business row on commit (server.commit_projection), keyed by
--   the row id so retries and replays are recorded once. post_created covers fan board and group posts (property
--   board). cheer_completed is once per member, creator and KST day: enough to find a first activity.
-- Limits: page_view at most 500 per owner (tab session or member) per KST day, and 300 events a minute per client IP
-- together with the anonymous session or the member (consume_product_event_rate_budget, HMAC-keyed bucket). The route
-- drops anything over a limit with 204. Page views and shares are counted and reported by created_at (server time);
-- the client's occurred_at is only stored.
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
  )) not valid;
alter table public.fan_product_events validate constraint fan_product_events_event_name_check;

create index if not exists fan_product_events_page_view_occurred_idx
  on public.fan_product_events (created_at)
  include (anonymous_session_hash)
  where event_name = 'page_view';
-- Daily page_view cap per owner.
create index if not exists fan_product_events_page_view_owner_idx
  on public.fan_product_events ((coalesce(anonymous_session_hash, app_user_id::text)), created_at)
  where event_name = 'page_view';
-- Funnel first-activity checks.
create index if not exists fan_product_events_share_member_idx
  on public.fan_product_events (app_user_id, created_at)
  where event_name = 'share_completed' and app_user_id is not null;
create index if not exists group_creator_attendance_member_created_idx
  on public.group_creator_attendance (app_user_id, created_at);
create index if not exists group_posts_author_created_idx on public.group_posts (author_id, created_at);
create index if not exists fan_passports_owner_issued_idx on public.fan_passports (app_user_id, issued_at);
create index if not exists fan_passports_issued_idx on public.fan_passports (issued_at);

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
    p_celebrity_id is not null or p_live_event_id is not null
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
  if p_event_name = 'page_view' and (
    select count(*) from (
      select 1 from public.fan_product_events event
      where event.event_name = 'page_view'
        and coalesce(event.anonymous_session_hash, event.app_user_id::text) = coalesce(p_anonymous_session_hash, p_app_user_id::text)
        and event.created_at >= (pg_catalog.date_trunc('day', statement_timestamp() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
      limit 500
    ) today
  ) >= 500 then
    raise exception 'PRODUCT_EVENT_RATE_LIMITED' using errcode = '54000';
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
       or (p_celebrity_id is null and not (p_event_name = 'post_created' and p_properties->>'board' = 'group'))
       or p_live_event_id is not null or p_mission_id is not null or p_benefit_id is not null
       or p_source <> 'server.commit_projection'
       or p_idempotency_key <> 'server:' || p_event_name || ':' || (case when p_event_name = 'cheer_completed'
            then p_app_user_id::text || ':' || coalesce(p_celebrity_id::text, '') || ':'
              || pg_catalog.to_char((p_occurred_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')
            else funnel_entity_id::text end)
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
         (p_properties - array['businessEntityId','category','board']::text[]) <> '{}'::jsonb
         or not (
           (p_properties->>'board' = 'fan' and exists (select 1 from public.fan_posts source_record
             where source_record.id = funnel_entity_id and source_record.app_user_id = p_app_user_id
               and source_record.celebrity_id = p_celebrity_id
               and source_record.category = p_properties->>'category'))
           or (p_properties->>'board' = 'group' and exists (select 1 from public.group_posts source_record
             join public.group_pages page on page.id = source_record.page_id
             where source_record.id = funnel_entity_id and source_record.author_id = p_app_user_id
               and page.celebrity_id is not distinct from p_celebrity_id
               and source_record.category = p_properties->>'category'))
         )
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
  v_owner uuid;
  v_celebrity uuid;
  v_occurred timestamptz;
  v_properties jsonb := '{}'::jsonb;
  v_key text;
begin
  if tg_table_name = 'group_posts' then
    v_owner := new.author_id;
  else
    v_owner := new.app_user_id;
  end if;
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
    v_properties := pg_catalog.jsonb_build_object('category', new.category, 'board', 'fan');
  elsif tg_table_name = 'group_posts' then
    v_event := 'post_created'; v_occurred := new.created_at;
    v_properties := pg_catalog.jsonb_build_object('category', new.category, 'board', 'group');
  elsif tg_table_name = 'fan_post_comments' then
    v_event := 'comment_created'; v_occurred := new.created_at;
    v_properties := pg_catalog.jsonb_build_object('reply', new.parent_id is not null);
  elsif tg_table_name = 'fan_lounge_messages' then
    if new.reply_to_id is not null then return new; end if;
    v_event := 'cheer_completed'; v_celebrity := new.celebrity_id; v_occurred := new.created_at;
  else
    return new;
  end if;
  v_properties := v_properties || pg_catalog.jsonb_build_object('businessEntityId', new.id);
  -- Every table read sits inside this block: a lock wait past lock_timeout (55P03) or any other failure skips only the
  -- event and never reaches the business transaction.
  begin
    if tg_table_name = 'group_posts' then
      select page.celebrity_id into v_celebrity from public.group_pages page where page.id = new.page_id;
    elsif tg_table_name = 'fan_post_comments' then
      select post.celebrity_id into v_celebrity from public.fan_posts post where post.id = new.post_id;
    end if;
    if v_event = 'cheer_completed' then
      v_key := 'server:cheer_completed:' || v_owner::text || ':' || coalesce(v_celebrity::text, '') || ':'
        || pg_catalog.to_char((v_occurred at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD');
      -- Later cheers of the day end here, before the ledger's advisory lock and validation.
      if exists (select 1 from public.fan_product_events event where event.schema_version = 1 and event.idempotency_key = v_key) then
        return new;
      end if;
    else
      v_key := 'server:' || v_event || ':' || new.id::text;
    end if;
    perform public.record_product_event_v1(1::smallint, v_event, v_owner, null, v_celebrity, null, null, null,
      'server.commit_projection', v_key, v_occurred, v_properties);
  exception when others then
    raise warning 'product event projection skipped: % %', v_event, sqlstate;
  end;
  return new;
end;
$$;

-- A projection waits at most 1s for a lock; past that only the event is skipped (warning) and the business write goes on.
alter function public.project_funnel_activity_event_v1() set lock_timeout = '1s';
revoke all on function public.project_funnel_activity_event_v1() from public, anon, authenticated, service_role;

create trigger quiz_attempts_funnel_event_insert after insert on public.quiz_attempts
  for each row execute function public.project_funnel_activity_event_v1();
create trigger quiz_attempts_funnel_event_update after update of status on public.quiz_attempts
  for each row execute function public.project_funnel_activity_event_v1();
create trigger group_creator_attendance_funnel_event after insert on public.group_creator_attendance
  for each row execute function public.project_funnel_activity_event_v1();
create trigger fan_posts_funnel_event after insert on public.fan_posts
  for each row execute function public.project_funnel_activity_event_v1();
create trigger group_posts_funnel_event after insert on public.group_posts
  for each row execute function public.project_funnel_activity_event_v1();
create trigger fan_post_comments_funnel_event after insert on public.fan_post_comments
  for each row execute function public.project_funnel_activity_event_v1();
create trigger fan_lounge_messages_funnel_event after insert on public.fan_lounge_messages
  for each row execute function public.project_funnel_activity_event_v1();

-- /admin/traffic visits, from the ledger's page_view instead of Vercel Web Analytics.
-- Visitors are tab sessions: one entry=true page_view each, whether the tab was signed in or not. Breakdown rows count
-- distinct owners (anonymous session or member), so a tab that signed in midway can appear twice inside one row only.
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
    select coalesce(event.anonymous_session_hash, event.app_user_id::text) as owner,
      event.created_at as occurred_at, event.properties as p, (event.properties->>'entry')::boolean as entry
    from public.fan_product_events event
    where event.event_name = 'page_view' and event.created_at >= v_from and event.created_at < v_to
  ), by_day as (
    select (occurred_at at time zone 'UTC')::date as day, count(*) filter (where entry) as visitors, count(*) as pageviews
    from views group by 1
  ), breakdown as (
    select dimension, label,
      case when dimension = 'referrers' then count(*) else count(distinct owner) end as visitors, count(*) as pageviews
    from views cross join lateral (values
      ('pages', p->>'pageKind'),
      ('referrers', case when entry then p->>'channel' end),
      ('devices', p->>'device'),
      ('browsers', p->>'browser'),
      ('operatingSystems', p->>'os')
    ) d(dimension, label)
    where label is not null
    group by dimension, label
  )
  select pg_catalog.jsonb_build_object(
    'days', p_days, 'from', v_from, 'to', v_to, 'fetchedAt', v_now,
    'totals', (select pg_catalog.jsonb_build_object('visitors', count(*) filter (where entry), 'pageviews', count(*)) from views),
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
--   visitors: tab sessions (entry page views); accounts: app_users created; verified: members whose first passport
--   was issued; first activity: members whose first check-in, fan board or group post, comment, cheer or signed-in
--   share happened. visitedMembers follows one cohort instead: members with a signed-in page view in the period, and
--   how many of them signed up, got a first passport and made a first activity in the same period. Counts only.
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
  v_steps jsonb;
  v_members jsonb;
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, false);
  if p_days is null or p_days not in (7,30,90) then
    raise exception 'FUNNEL_ANALYTICS_INVALID_DAYS' using errcode = '22023';
  end if;
  v_to := (pg_catalog.date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC') + interval '1 day';
  v_from := v_to - pg_catalog.make_interval(days => p_days);

  select count(*) into v_visitors
  from public.fan_product_events event
  where event.event_name = 'page_view' and event.created_at >= v_from and event.created_at < v_to
    and event.properties->>'entry' = 'true';

  select min(event.created_at) into v_page_views_since
  from public.fan_product_events event where event.event_name = 'page_view';

  with accounts as (
    select member.id as app_user_id from public.app_users member
    where member.created_at >= v_from and member.created_at < v_to
  ), verified as (
    -- Candidates: passports issued in the period; kept only without an earlier passport.
    select distinct passport.app_user_id from public.fan_passports passport
    where passport.issued_at >= v_from and passport.issued_at < v_to
      and not exists (select 1 from public.fan_passports earlier
        where earlier.app_user_id = passport.app_user_id and earlier.issued_at < v_from)
  ), candidates as (
    select app_user_id from public.group_creator_attendance where created_at >= v_from and created_at < v_to
    union select app_user_id from public.fan_posts where created_at >= v_from and created_at < v_to
    union select author_id from public.group_posts where created_at >= v_from and created_at < v_to
    union select app_user_id from public.fan_post_comments where created_at >= v_from and created_at < v_to
    union select app_user_id from public.fan_lounge_messages
      where reply_to_id is null and created_at >= v_from and created_at < v_to
    union select app_user_id from public.fan_product_events
      where event_name = 'share_completed' and app_user_id is not null and created_at >= v_from and created_at < v_to
  ), activated as (
    select candidate.app_user_id from candidates candidate
    where not exists (select 1 from public.group_creator_attendance x where x.app_user_id = candidate.app_user_id and x.created_at < v_from)
      and not exists (select 1 from public.fan_posts x where x.app_user_id = candidate.app_user_id and x.created_at < v_from)
      and not exists (select 1 from public.group_posts x where x.author_id = candidate.app_user_id and x.created_at < v_from)
      and not exists (select 1 from public.fan_post_comments x where x.app_user_id = candidate.app_user_id and x.created_at < v_from)
      and not exists (select 1 from public.fan_lounge_messages x
        where x.app_user_id = candidate.app_user_id and x.reply_to_id is null and x.created_at < v_from)
      and not exists (select 1 from public.fan_product_events x where x.event_name = 'share_completed'
        and x.app_user_id = candidate.app_user_id and x.created_at < v_from)
  ), visited as (
    select distinct event.app_user_id from public.fan_product_events event
    where event.event_name = 'page_view' and event.app_user_id is not null
      and event.created_at >= v_from and event.created_at < v_to
  )
  select
    pg_catalog.jsonb_build_object(
      'visitors', v_visitors,
      'accountCreated', (select count(*) from accounts),
      'fanVerified', (select count(*) from verified),
      'firstActivity', (select count(*) from activated)),
    pg_catalog.jsonb_build_object(
      'visited', (select count(*) from visited),
      'accountCreated', (select count(*) from visited join accounts using (app_user_id)),
      'fanVerified', (select count(*) from visited join verified using (app_user_id)),
      'firstActivity', (select count(*) from visited join activated using (app_user_id)))
  into v_steps, v_members;

  return pg_catalog.jsonb_build_object(
    'days', p_days, 'from', v_from, 'to', v_to,
    'pageViewsSince', v_page_views_since,
    'steps', v_steps,
    'visitedMembers', v_members);
end;
$$;

revoke all on function public.read_admin_web_traffic(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.read_admin_web_traffic(uuid,uuid,integer) to service_role;
revoke all on function public.read_admin_funnel_analytics(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.read_admin_funnel_analytics(uuid,uuid,integer) to service_role;

-- Rate budget for /api/events: 300 events a minute per bucket. A bucket is the edge-set client IP together with the
-- anonymous session (signed out) or the member (signed in), so many people behind one carrier NAT do not share a budget.
-- The route sends only an HMAC of the bucket, keyed from a server-only secret; the IP itself never reaches the database.
create table public.product_event_rate_budgets (
  bucket_hash text not null check (bucket_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  used integer not null default 0,
  primary key (bucket_hash, window_start)
);
alter table public.product_event_rate_budgets enable row level security;
revoke all on table public.product_event_rate_budgets from public, anon, authenticated, service_role;

create function public.consume_product_event_rate_budget(p_bucket_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := pg_catalog.date_trunc('minute', statement_timestamp());
  v_used integer;
begin
  if p_bucket_hash is null or p_bucket_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'PRODUCT_EVENT_INVALID' using errcode = '22023';
  end if;
  insert into public.product_event_rate_budgets as budget (bucket_hash, window_start, used) values (p_bucket_hash, v_window, 1)
  on conflict (bucket_hash, window_start) do update set used = budget.used + 1
  returning used into v_used;
  if pg_catalog.random() < 0.01 then
    delete from public.product_event_rate_budgets where window_start < v_window - interval '10 minutes';
  end if;
  return v_used <= 300;
end;
$$;
revoke all on function public.consume_product_event_rate_budget(text) from public, anon, authenticated;
grant execute on function public.consume_product_event_rate_budget(text) to service_role;

-- owner-policy-begin (review REVIEW-FUNNEL H1)
-- The readers and the projector above belong to the applying role, and record_product_event_v1 (patched above) keeps its
-- own owner. In dev the applier (byus_admin) is not a superuser and some of these tables have FORCE row security with no
-- policy for it: reads would answer 0 rows without an error. Same remedy as 20261215060000: select and a policy for that
-- role alone, only where row security applies to it, then fail the migration if any read is still blocked.
-- A superuser or BYPASSRLS role (local) needs nothing. Probe: supabase/tests/funnel_nonsuper_apply.sh.
do $$
declare
  r record;
  t text;
  gaps text[] := '{}';
begin
  for r in select distinct role.oid, role.rolname from pg_catalog.pg_roles role
      where role.rolname in (current_user,
        pg_catalog.pg_get_userbyid((select proowner from pg_catalog.pg_proc
          where oid = 'public.record_product_event_v1(smallint,text,uuid,text,uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb)'::regprocedure)))
        and not role.rolsuper and not role.rolbypassrls loop
    foreach t in array array['fan_product_events','fan_post_comments','fan_lounge_messages','fan_posts','fan_passports',
        'app_users','group_creator_attendance','group_posts','group_pages','quiz_attempts'] loop
      execute pg_catalog.format('grant select on table public.%I to %I', t, r.rolname);
      if exists (select 1 from pg_catalog.pg_class c where c.oid = ('public.' || t)::regclass and c.relrowsecurity
            and (c.relforcerowsecurity or c.relowner <> r.oid))
         and not exists (select 1 from pg_catalog.pg_policy pol where pol.polrelid = ('public.' || t)::regclass
            and pol.polcmd in ('r','*') and r.oid = any(pol.polroles)) then
        execute pg_catalog.format('create policy %I on public.%I for select to %I using (true)', 'p3_fn_owner_' || r.rolname, t, r.rolname);
      end if;
      if not pg_catalog.has_table_privilege(r.oid, ('public.' || t)::regclass, 'select')
         or (exists (select 1 from pg_catalog.pg_class c where c.oid = ('public.' || t)::regclass and c.relrowsecurity
               and (c.relforcerowsecurity or c.relowner <> r.oid))
             and not exists (select 1 from pg_catalog.pg_policy pol where pol.polrelid = ('public.' || t)::regclass
               and pol.polcmd in ('r','*') and r.oid = any(pol.polroles))) then
        gaps := gaps || (r.rolname || ':' || t);
      end if;
    end loop;
  end loop;
  if pg_catalog.cardinality(gaps) > 0 then
    raise exception 'FUNNEL_EVENTS_OWNER_READ_BLOCKED: %', pg_catalog.array_to_string(gaps, ', ');
  end if;
end $$;
-- owner-policy-end

commit;
