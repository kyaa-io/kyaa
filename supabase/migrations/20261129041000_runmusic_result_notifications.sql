-- Results use the existing consent, account, Apple and release-gated email lifecycle.
alter type public.notification_kind add value if not exists 'runmusic_result';

-- Permit an explicit operations release without enabling or changing any current release.
alter table public.fan_notification_delivery_control drop constraint fan_delivery_allowed_kinds_valid;
alter table public.fan_notification_delivery_control add constraint fan_delivery_allowed_kinds_valid
  check(allowed_kinds is null or (
    array_ndims(allowed_kinds)=1 and cardinality(allowed_kinds) between 1 and 6
    and array_position(allowed_kinds,null) is null
    and allowed_kinds <@ array['live_reserved','live_24h','live_10m','live_changed','live_cancelled','runmusic_result']::text[]
  ));

do $$
declare previous text;
begin
  select pg_get_expr(conbin,conrelid) into strict previous from pg_constraint
    where conrelid='public.fan_notifications'::regclass and conname='fan_notifications_source_shape';
  alter table public.fan_notifications drop constraint fan_notifications_source_shape;
  execute 'alter table public.fan_notifications add constraint fan_notifications_source_shape check (('
    ||previous||') or (kind::text=''runmusic_result'' and live_event_id is null and benefit_id is null and celebrity_id is null and not web_only))';
end $$;

create function public.runmusic_notification_source_is_valid(p_notification_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.fan_notifications n
    join public.runmusic_draw_entries e on e.app_user_id=n.app_user_id
      and n.source_key='runmusic_result:'||e.draw_id::text||':'||e.app_user_id::text
    join public.runmusic_campaign c on c.draw_id=e.draw_id and c.results_published
    where n.id=p_notification_id and n.kind::text='runmusic_result'
  )
$$;

-- Extend the original CASE, preserving every eligibility wrapper added since it.
create or replace function public.email_notification_delivery_is_eligible_base(
  p_notification_id uuid,
  p_channel_id uuid,
  p_at timestamptz default pg_catalog.now()
) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    notification.kind::text not in ('live_24h','live_cancelled')
    and notification.scheduled_for<=p_at
    and notification.superseded_at is null
    and app_user.status='active'
    and channel.app_user_id=notification.app_user_id
    and channel.kind='email'
    and channel.status='eligible'
    and channel.consented_at is not null
    and channel.consent_revoked_at is null
    and channel.verified_at is not null
    and (
      notification.live_event_id is null or exists (
        select 1 from public.live_events current_live
        where current_live.id=notification.live_event_id
          and current_live.publication_status='published'
          and current_live.archived_at is null
      )
    )
    and case
      when notification.kind::text in ('live_reserved','live_changed') then
        coalesce(preference.live_reminders,true)
        and public.live_effective_status_at(notification.live_event_id,p_at)='scheduled'
        and exists (
          select 1 from public.live_reservations reservation
          where reservation.app_user_id=notification.app_user_id
            and reservation.live_event_id=notification.live_event_id
        )
      when notification.kind::text='live_10m' then
        coalesce(preference.live_reminders,true)
        and public.live_effective_status_at(notification.live_event_id,p_at)='scheduled'
      when notification.kind::text='survey_reminder' then
        coalesce(preference.survey_reminders,true)
        and public.live_effective_status_at(notification.live_event_id,p_at)='ended'
        and exists (
          select 1 from public.live_surveys survey
          where survey.live_event_id=notification.live_event_id
            and survey.publication_status='published'
            and survey.lifecycle_status='published'
            and survey.legacy_contract
            and survey.archived_at is null
        )
        and not exists (
          select 1 from public.live_survey_responses response
          where response.app_user_id=notification.app_user_id
            and response.live_event_id=notification.live_event_id
            and response.status='submitted'
            and response.legacy_contract
        )
      when notification.kind::text in ('benefit_available','benefit_unlocked') then
        coalesce(preference.benefit_notifications,true)
        and exists (
          select 1 from public.benefits benefit
          where benefit.id=notification.benefit_id
            and benefit.publication_status='published'
            and benefit.archived_at is null
            and p_at>=benefit.claim_opens_at and p_at<benefit.claim_closes_at
            and not exists (
              select 1 from public.benefit_claims claim
              where claim.benefit_id=benefit.id
                and claim.app_user_id=notification.app_user_id
            )
        )
      when notification.kind::text='benefit_won' then
        coalesce(preference.benefit_notifications,true)
        and exists (
          select 1 from public.benefit_draw_winners winner
          where winner.benefit_id=notification.benefit_id
            and winner.app_user_id=notification.app_user_id
        )
      when notification.kind::text='recipient_information_required' then
        coalesce(preference.benefit_notifications,true)
        and exists (
          select 1
          from public.benefit_draw_winners winner
          join public.benefit_fulfillments fulfillment on fulfillment.winner_id=winner.id
          where winner.benefit_id=notification.benefit_id
            and winner.app_user_id=notification.app_user_id
            and fulfillment.status='information_required'
            and not exists (
              select 1 from public.benefit_recipient_private recipient
              where recipient.winner_id=winner.id
            )
        )
      when notification.kind::text='fulfillment_meaningful_update' then
        coalesce(preference.benefit_notifications,true)
        and exists (
          select 1
          from public.benefit_draw_winners winner
          join public.benefit_fulfillments fulfillment on fulfillment.winner_id=winner.id
          left join public.benefit_fulfillment_events event
            on notification.source_key=(
              'fulfillment_meaningful_update:'||event.fulfillment_id::text||':'||event.id::text
            )
          where winner.benefit_id=notification.benefit_id
            and winner.app_user_id=notification.app_user_id
            and fulfillment.status::text=coalesce(
              notification.payload->>'fulfillmentStatus',event.to_status::text,fulfillment.status::text
            )
        )
      when notification.kind::text in ('collectible_claim_available','collectible_claim_expiring') then
        coalesce(preference.live_reminders,true)
        and exists (
          select 1
          from public.live_journey_completions completion
          join public.live_journey_requirement_revisions requirement
            on requirement.id=completion.requirement_revision_id
          join public.live_collectible_claim_windows claim_window
            on claim_window.live_event_id=completion.live_event_id
          where completion.app_user_id=notification.app_user_id
            and completion.live_event_id=notification.live_event_id
            and p_at>=claim_window.opens_at
            and p_at<claim_window.opens_at+pg_catalog.make_interval(hours=>requirement.claim_window_duration_hours)
            and not exists (
              select 1 from public.live_collectible_claims claim
              where claim.app_user_id=notification.app_user_id
                and claim.live_event_id=notification.live_event_id
            )
        )
      when notification.kind::text='level_up' then
        exists (
          select 1 from public.fan_level_events level_event
          where level_event.id=notification.source_event_id
            and level_event.app_user_id=notification.app_user_id
            and level_event.celebrity_id=notification.celebrity_id
        )
      when notification.kind::text='runmusic_result' then
        coalesce(preference.benefit_notifications,true)
        and public.runmusic_notification_source_is_valid(notification.id)
      else false
    end
  from public.fan_notifications notification
  join public.app_users app_user on app_user.id=notification.app_user_id
  join public.fan_notification_channels channel on channel.id=p_channel_id
  left join public.notification_preferences preference
    on preference.app_user_id=notification.app_user_id
  where notification.id=p_notification_id
$$;


-- The latest locale-aware planner is preserved; this kind never selects Kakao.
create or replace function public.create_external_notification_plan_before_fan_web(
  p_notification_id uuid,p_now timestamptz default pg_catalog.now()
)
returns uuid language plpgsql security definer set search_path='' as $$
declare n public.fan_notifications%rowtype; locale text; primary_channel public.fan_notification_channels%rowtype;
  fallback_channel uuid; plan_id uuid; notification_payload jsonb;
begin
  select id into plan_id from public.notification_delivery_plans where notification_id=p_notification_id;
  if found then return plan_id; end if;
  select notification.* into n from public.fan_notifications notification
    join public.app_users u on u.id=notification.app_user_id and u.status='active'
    where notification.id=p_notification_id;
  if not found then return null; end if;
  select case when coalesce(preferred_locale,'ko')='ko' then 'ko' else 'en' end
    into strict locale from public.app_users where id=n.app_user_id;
  notification_payload:=public.build_external_notification_payload(n.id,locale);
  select c.* into primary_channel from public.fan_notification_channels c
    where c.app_user_id=n.app_user_id and c.status='eligible' and c.verified_at is not null
      and c.consented_at is not null and c.consent_revoked_at is null
      and ((c.kind='email' and n.kind::text not in('live_24h','live_cancelled'))
        or (c.kind='kakao' and n.kind::text<>'runmusic_result' and public.kakao_channel_supports_notification(c.id,n.kind::text,notification_payload,locale)))
    order by case c.kind when 'kakao' then 1 else 2 end,c.priority,c.id limit 1;
  if not found then return null; end if;
  if primary_channel.kind='kakao' and n.kind::text not in('live_24h','live_cancelled') then
    select id into fallback_channel from public.fan_notification_channels
      where app_user_id=n.app_user_id and kind='email' and status='eligible' and verified_at is not null
        and consented_at is not null and consent_revoked_at is null limit 1;
  end if;
  insert into public.notification_delivery_plans(notification_id,primary_channel_id,fallback_channel_id,email_locale,created_at,updated_at)
    values(n.id,primary_channel.id,fallback_channel,locale,p_now,p_now)
    on conflict(notification_id) do nothing returning id into plan_id;
  if not found then
    select id into plan_id from public.notification_delivery_plans where notification_id=n.id;
    return plan_id;
  end if;
  insert into public.external_notification_delivery_outbox(plan_id,notification_id,channel_id,channel,sequence,template_key,locale,available_at)
    values(plan_id,n.id,primary_channel.id,primary_channel.kind,1,n.kind::text,locale,greatest(n.scheduled_for,p_now));
  return plan_id;
end $$;

-- The shared trigger creates email plans, but RUNMUSIC does not enqueue push.
create or replace function public.phase5_enqueue_notification_deliveries()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not public.fan_web_notification_can_send(new.id) then return new; end if;
  if new.kind::text<>'runmusic_result' then
    insert into public.notification_delivery_outbox(notification_id,subscription_id,available_at)
      select new.id,s.id,greatest(new.scheduled_for,pg_catalog.now()) from public.push_subscriptions s
      where s.app_user_id=new.app_user_id and s.disabled_at is null
      on conflict(notification_id,subscription_id) do nothing;
  end if;
  perform public.create_external_notification_plan(new.id,pg_catalog.now());
  return new;
end $$;

create or replace function public.build_external_notification_payload(
  p_notification_id uuid,p_locale text
) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when notification.kind::text='runmusic_result' then jsonb_build_object(
    'title',case when p_locale='ko' then 'RUNMUSIC 추첨 결과가 나왔어요' else 'Your RUNMUSIC results are ready' end,
    'detail',case when p_locale='ko' then '참여한 이벤트의 추첨 결과를 확인해 주세요.' else 'Check the draw results for the event you entered.' end,
    'deepLink','/connect/runmusic/results',
    'context',jsonb_build_object('kind','runmusic_result','title','RUNMUSIC')
  ) else jsonb_build_object(
    'title',case when p_locale='ko'
      then coalesce(notification.payload->>'title','ByUs') else 'ByUs' end,
    'detail',case when p_locale='ko'
      then coalesce(notification.payload->>'detail','새 소식을 확인해 주세요.')
      else 'You have a new update.' end,
    'deepLink',coalesce(notification.deep_link,case
      when notification.kind::text='survey_reminder' then '/live/'||live.slug||'/survey'
      when notification.live_event_id is not null then '/live/'||live.slug
      when notification.benefit_id is not null then '/benefits/'||notification.benefit_id::text
      when notification.kind::text='level_up' then '/passports'
      else '/my' end),
    'context',jsonb_strip_nulls(jsonb_build_object(
      'kind',notification.kind::text,
      'title',coalesce(live_locale.title,benefit_locale.title),
      'artist',artist_locale.name,
      'imageUrl',coalesce(preview.landscape_poster_url,live.approved_hero_url,artist.image_url),
      'startsAt',live.starts_at,
      'actionAt',case
        when notification.kind::text in ('benefit_available','benefit_unlocked') then benefit.claim_closes_at
        when notification.kind::text in ('collectible_claim_available','collectible_claim_expiring') then collectible.action_at
        else null end,
      'fulfillmentStatus',coalesce(
        notification.payload->>'fulfillmentStatus',fulfillment.event_status,
        case when notification.kind::text='fulfillment_meaningful_update'
          then fulfillment.current_status end
      ),
      'newLevel',notification.payload->>'currentLevel'
    ))
  ) end
  from public.fan_notifications notification
  left join public.live_events live on live.id=notification.live_event_id
    and live.publication_status='published' and live.archived_at is null
  left join public.benefits benefit on benefit.id=notification.benefit_id
  left join public.celebrities artist on artist.id=coalesce(
    notification.celebrity_id,live.celebrity_id,benefit.celebrity_id
  )
  left join public.live_event_previews preview on preview.live_event_id=live.id
    and preview.publication_status='published' and preview.archived_at is null
  left join lateral (
    select localization.title from public.live_event_localizations localization
    where localization.live_event_id=live.id
    order by (localization.locale::text=p_locale) desc,
      (localization.locale::text='ko') desc limit 1
  ) live_locale on true
  left join lateral (
    select localization.title from public.benefit_localizations localization
    where localization.benefit_id=benefit.id
    order by (localization.locale::text=p_locale) desc,
      (localization.locale::text='ko') desc limit 1
  ) benefit_locale on true
  left join lateral (
    select localization.name from public.celebrity_localizations localization
    where localization.celebrity_id=artist.id
    order by (localization.locale::text=p_locale) desc,
      (localization.locale::text='ko') desc limit 1
  ) artist_locale on true
  left join lateral (
    select claim_window.opens_at+pg_catalog.make_interval(
      hours=>requirement.claim_window_duration_hours
    ) action_at
    from public.live_journey_completions completion
    join public.live_journey_requirement_revisions requirement
      on requirement.id=completion.requirement_revision_id
    join public.live_collectible_claim_windows claim_window
      on claim_window.live_event_id=completion.live_event_id
    where completion.app_user_id=notification.app_user_id
      and completion.live_event_id=notification.live_event_id
    order by completion.completed_at desc limit 1
  ) collectible on true
  left join lateral (
    select fulfillment.status::text current_status,event.to_status::text event_status
    from public.benefit_draw_winners winner
    join public.benefit_fulfillments fulfillment on fulfillment.winner_id=winner.id
    left join public.benefit_fulfillment_events event on notification.source_key=(
      'fulfillment_meaningful_update:'||event.fulfillment_id::text||':'||event.id::text
    )
    where winner.app_user_id=notification.app_user_id
      and winner.benefit_id=notification.benefit_id
    order by winner.selected_at desc limit 1
  ) fulfillment on true
  where notification.id=p_notification_id
$$;

create function public.enqueue_runmusic_results(p_draw_id uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare inserted_count integer;
begin
  if not exists(select 1 from public.runmusic_campaign where draw_id=p_draw_id and results_published) then
    return 0;
  end if;
  insert into public.fan_notifications(app_user_id,kind,source_key,scheduled_for,deep_link,payload)
    select e.app_user_id,'runmusic_result'::public.notification_kind,
      'runmusic_result:'||p_draw_id::text||':'||e.app_user_id::text,pg_catalog.now(),
      '/connect/runmusic/results',jsonb_build_object('schemaVersion',1)
    from public.runmusic_draw_entries e join public.app_users u on u.id=e.app_user_id and u.status='active'
    where e.draw_id=p_draw_id
    on conflict(app_user_id,source_key) do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end $$;

create function public.runmusic_delivery_stats(p_draw_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'pending',count(*) filter(where state='pending'),
    'sent',count(*) filter(where state='sent'),
    'failed',count(*) filter(where state='failed'),
    'skipped',count(*) filter(where state='skipped')
  ) from (
    select case
      when d.status='sent' then 'sent'
      when d.id is null then 'skipped'
      when d.status='failed' and d.last_error_code in ('EMAIL_NOT_ELIGIBLE','CURRENT_STATE_INELIGIBLE') then 'skipped'
      when d.status='failed' then 'failed'
      else 'pending' end state
    from public.fan_notifications n
    left join public.external_notification_delivery_outbox d on d.notification_id=n.id and d.channel='email' and d.sequence=1
    where n.kind::text='runmusic_result'
      and n.source_key='runmusic_result:'||p_draw_id::text||':'||n.app_user_id::text
  ) deliveries
$$;

revoke all on function public.runmusic_notification_source_is_valid(uuid),
  public.email_notification_delivery_is_eligible_base(uuid,uuid,timestamptz),
  public.create_external_notification_plan_before_fan_web(uuid,timestamptz),
  public.phase5_enqueue_notification_deliveries(),public.enqueue_runmusic_results(uuid),
  public.runmusic_delivery_stats(uuid),public.build_external_notification_payload(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.enqueue_runmusic_results(uuid),public.runmusic_delivery_stats(uuid),
  public.build_external_notification_payload(uuid,text) to service_role;
