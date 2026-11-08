-- Rollback of 20261219010000_funnel_events.sql.
-- Ledger rows are append-only, so funnel events already recorded stay. The event-name check is restored NOT VALID
-- (new rows with the funnel names are rejected; existing rows are kept). The select grants and p3_fn_owner_<role> policies
-- of the owner-policy block stay: the same names are shared with earlier migrations and cannot be told apart.
begin;
set local lock_timeout = '5s';

drop trigger if exists quiz_attempts_funnel_event_insert on public.quiz_attempts;
drop trigger if exists quiz_attempts_funnel_event_update on public.quiz_attempts;
drop trigger if exists group_creator_attendance_funnel_event on public.group_creator_attendance;
drop trigger if exists fan_posts_funnel_event on public.fan_posts;
drop trigger if exists group_posts_funnel_event on public.group_posts;
drop trigger if exists fan_post_comments_funnel_event on public.fan_post_comments;
drop trigger if exists fan_lounge_messages_funnel_event on public.fan_lounge_messages;
drop function if exists public.project_funnel_activity_event_v1();
drop function if exists public.read_admin_web_traffic(uuid,uuid,integer);
drop function if exists public.read_admin_funnel_analytics(uuid,uuid,integer);
drop index if exists public.fan_product_events_page_view_occurred_idx;
drop index if exists public.group_posts_author_created_idx;
drop index if exists public.fan_product_events_page_view_owner_idx;
drop index if exists public.fan_product_events_share_member_idx;
drop index if exists public.group_creator_attendance_member_created_idx;
drop index if exists public.fan_passports_owner_issued_idx;
drop index if exists public.fan_passports_issued_idx;
drop function if exists public.consume_product_event_rate_budget(text,text);
drop table if exists public.product_event_rate_budgets;

do $patch$
declare
  definition text := pg_catalog.pg_get_functiondef(
    'public.record_product_event_v1(smallint,text,uuid,text,uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb)'::regprocedure);
  names_patched text := $a$'login_result','account_created','profile_completed','outbound_link_click',
       'page_view','share_completed','fan_verification_started','fan_verification_submitted',
       'daily_checkin_completed','post_created','comment_created','cheer_completed'$a$;
  names_original text := $a$'login_result','account_created','profile_completed','outbound_link_click'$a$;
  declare_patched text := $a$  wallet_reconciliation_ms numeric;
  funnel_entity_id uuid;
$a$;
  declare_original text := $a$  wallet_reconciliation_ms numeric;
$a$;
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
  rules_original text := $a$  if p_event_name in ('ticket_credited', 'ticket_debited') then$a$;
  anchor text;
begin
  foreach anchor in array array[names_patched, declare_patched, rules_patched] loop
    if (pg_catalog.length(definition) - pg_catalog.length(pg_catalog.replace(definition, anchor, '')))
       / pg_catalog.length(anchor) <> 1 then
      raise exception 'PRODUCT_EVENT_FUNNEL_ROLLBACK_SHAPE_CHANGED: %', pg_catalog.left(anchor, 40);
    end if;
  end loop;
  definition := pg_catalog.replace(definition, rules_patched, rules_original);
  definition := pg_catalog.replace(definition, declare_patched, declare_original);
  definition := pg_catalog.replace(definition, names_patched, names_original);
  execute definition;
end $patch$;

alter table public.fan_product_events
  drop constraint fan_product_events_event_name_check,
  add constraint fan_product_events_event_name_check check (event_name in (
    'creator_page_view','live_page_view','live_cta_click','benefit_page_view',
    'reaction_completed','passport_issued','reservation_completed',
    'attendance_completed','mission_completed','ticket_credited','ticket_debited',
    'journey_completed','collectible_claimed','benefit_entered','benefit_won',
    'fulfillment_completed','signup_guide_view','signup_guide_cta','login_started',
    'login_result','account_created','profile_completed','outbound_link_click'
  )) not valid;

commit;
