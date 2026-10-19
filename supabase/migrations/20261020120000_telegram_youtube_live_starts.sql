-- Deploy the compatible notification worker before this migration and the web capture.
-- Outbox retention must never erase the broadcast's deduplication key.
create table public.telegram_youtube_live_starts (
  video_id text primary key check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  id uuid not null unique default gen_random_uuid(),
  celebrity_id uuid references public.celebrities(id) on delete set null,
  observed_at timestamptz not null
);
alter table public.telegram_youtube_live_starts enable row level security;
alter table public.telegram_youtube_live_starts force row level security;
revoke all on public.telegram_youtube_live_starts from public,anon,authenticated,service_role;

alter table public.telegram_alert_outbox drop constraint telegram_alert_outbox_kind_check;
alter table public.telegram_alert_outbox add constraint telegram_alert_outbox_kind_check
  check(kind in ('member_joined','fan_joined','live_reserved','live_attended','draw_published','cs_inquiry_created','cs_user_replied','campaign_visited','raffle_entered','benefit_claimed','reaction_completed','mission_submitted','journey_completed','collectible_claimed','invite_redeemed','certification_approved','certification_rejected','fulfillment_updated','fulfillment_unclaimed','business_received','business_failed','mint_completed','mint_failed','delivery_failed','live_published','live_cancelled','live_rescheduled','campaign_outbound','fan_post_created','fan_post_commented','fan_post_liked','fan_lounge_posted','notice_commented','daily_checked_in','byus_day_rsvp_received','content_report_created','youtube_live_started'));

create function public.capture_telegram_youtube_live_starts(p_observations jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare cfg public.telegram_alert_settings; observation jsonb; artist uuid; receipt uuid;
  observed timestamptz; moment timestamptz:=clock_timestamp(); inserted integer:=0;
begin
  if p_observations is null or jsonb_typeof(p_observations)<>'array' then
    raise exception 'YOUTUBE_LIVE_OBSERVATIONS_INVALID';
  end if;
  if jsonb_array_length(p_observations)>1000 then raise exception 'YOUTUBE_LIVE_OBSERVATIONS_INVALID'; end if;
  -- Same settings -> source -> outbox lock order as the existing queue controls.
  select * into cfg from public.telegram_alert_settings where singleton for share;
  if not coalesce(cfg.enabled,false) then return 0; end if;
  for observation in select value from jsonb_array_elements(p_observations) order by value->>'video_id' loop
    if jsonb_typeof(observation)<>'object'
      or coalesce(observation->>'video_id','') !~ '^[A-Za-z0-9_-]{11}$'
      or coalesce(observation->>'celebrity_slug','') !~ '^[a-z0-9][a-z0-9-]*$'
      or observation->>'observed_at' is null then
      raise exception 'YOUTUBE_LIVE_OBSERVATION_INVALID';
    end if;
    observed:=(observation->>'observed_at')::timestamptz;
    if observed>moment or observed<=moment-interval '5 minutes' then continue; end if;
    select c.id into artist from public.celebrities c
      where c.slug=observation->>'celebrity_slug' and c.status='published'
      and exists(select 1 from public.celebrity_social_links s
        where s.celebrity_id=c.id and s.platform='youtube' and s.active);
    if not found then continue; end if;
    insert into public.telegram_youtube_live_starts(video_id,celebrity_id,observed_at)
      values(observation->>'video_id',artist,observed)
      on conflict(video_id) do nothing returning id into receipt;
    if receipt is null then continue; end if;
    insert into public.telegram_alert_outbox(kind,source_id,activation_id,chat_id,occurred_at)
      values('youtube_live_started',receipt,cfg.activation_id,cfg.chat_id,observed);
    inserted:=inserted+1;
  end loop;
  return inserted;
end $$;
revoke all on function public.capture_telegram_youtube_live_starts(jsonb) from public,anon,authenticated;
grant execute on function public.capture_telegram_youtube_live_starts(jsonb) to service_role;

create or replace function public.claim_telegram_alert_batch_with_cs_content(p_chat_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.telegram_alert_settings; token uuid:=gen_random_uuid(); t timestamptz:=clock_timestamp();
  c public.telegram_alert_outbox; payload jsonb; detail jsonb; alerts jsonb:='[]'; used integer:=0; cost integer;
begin
  perform public.maintain_telegram_alerts();
  select * into cfg from public.telegram_alert_settings where singleton for update;
  if not cfg.enabled or cfg.chat_id is distinct from p_chat_id or cfg.next_send_at>t
    or (cfg.lease_expires_at is not null and cfg.lease_expires_at>t) then return null; end if;
  for c in select * from public.telegram_alert_outbox where status='pending' and available_at<=t
    and activation_id=cfg.activation_id and chat_id=cfg.chat_id and attempt_count<3
    order by created_at,id for update skip locked limit 5 loop
    if c.kind='youtube_live_started' then
      select jsonb_build_object('kind',c.kind,'creator_name',left(coalesce(k.name,e.name,a.slug),120),
        'live_title',null,'winner_count',null,'occurred_at',c.occurred_at,
        'actor_name',null,'actor_email',null,'youtube_video_id',s.video_id) into payload
        from public.telegram_youtube_live_starts s
        join public.celebrities a on a.id=s.celebrity_id and a.status='published'
        left join public.celebrity_localizations k on k.celebrity_id=a.id and k.locale='ko'
        left join public.celebrity_localizations e on e.celebrity_id=a.id and e.locale='en'
        where s.id=c.source_id and exists(select 1 from public.celebrity_social_links link
          where link.celebrity_id=a.id and link.platform='youtube' and link.active);
      if payload is null then
        update public.telegram_alert_outbox set status='skipped',finished_at=t where id=c.id;
        continue;
      end if;
    else
      select jsonb_build_object('kind',c.kind,'creator_name',c.creator_name,'live_title',c.live_title,
        'winner_count',c.winner_count,'occurred_at',c.occurred_at,'actor_name',p.nickname,'actor_email',u.verified_email)
        || case when c.kind in ('cs_inquiry_created','cs_user_replied')
          then jsonb_build_object('inquiry_id',m.inquiry_id,'message_body',m.body)
          when c.kind='campaign_visited' then jsonb_build_object('campaign_name',l.name,'campaign_channel',l.channel)
          when c.kind not in ('member_joined','fan_joined','live_reserved','live_attended','draw_published')
          then jsonb_build_object('activity_context',c.activity_context,'activity_quantity',c.activity_quantity)
          else '{}'::jsonb end
        || case when rsvp.id is not null then jsonb_build_object('rsvp',jsonb_build_object(
          'affiliation',rsvp.affiliation,'occupation',rsvp.occupation)) else '{}'::jsonb end into payload
        from (select 1) base
        left join public.byus_day_rsvps rsvp on c.kind='byus_day_rsvp_received' and rsvp.id=c.source_id
        left join public.campaign_visits v on c.kind='campaign_visited' and v.id=c.source_id
        left join public.campaign_tracking_links l on l.id=v.first_link_id
        left join public.cs_messages m on c.kind in ('cs_inquiry_created','cs_user_replied') and m.id=c.source_id
        left join public.fan_passports f on c.kind='fan_joined' and f.id=c.source_id
        left join public.live_reservations r on c.kind='live_reserved' and r.id=c.source_id
        left join public.live_attendances a on c.kind='live_attended' and a.id=c.source_id
        left join public.app_users u on u.id=case when c.kind='member_joined' then c.source_id else coalesce(f.app_user_id,r.app_user_id,a.app_user_id) end
        left join public.user_profiles p on p.app_user_id=u.id;
      -- Pre-migration generic rows have no reference; preserve their legacy payload.
      if c.kind in ('member_joined','fan_joined','live_reserved','live_attended') or c.activity_source_id is not null then
        detail:=public.telegram_fan_activity_detail(c);
        if detail is null then
          update public.telegram_alert_outbox set status='skipped',finished_at=t where id=c.id;
          continue;
        end if;
        payload:=payload||detail;
      end if;
    end if;
    -- JSON escaping plus 2x code points bounds UTF-16 text and quote prefixes.
    -- An oversized first post is rendered as an explicit linked preview by worker.
    cost:=case when payload ? 'detail' then 2*char_length(payload::text)+300
      when c.kind in ('cs_inquiry_created','cs_user_replied') then 800
      when c.kind='byus_day_rsvp_received' then 700
      when c.kind in ('member_joined','fan_joined','live_reserved','live_attended') then 650 else 500 end;
    if jsonb_array_length(alerts)>0 and used+cost>3600 then exit; end if;
    update public.telegram_alert_outbox set status='claimed',batch_id=token,lease_expires_at=t+interval '60 seconds' where id=c.id;
    alerts:=alerts||jsonb_build_array(payload); used:=used+cost;
  end loop;
  if jsonb_array_length(alerts)=0 then return null; end if;
  update public.telegram_alert_settings set batch_id=token,lease_expires_at=t+interval '60 seconds' where singleton;
  return jsonb_build_object('batch_id',token,'alerts',alerts);
end $$;
revoke all on function public.claim_telegram_alert_batch_with_cs_content(text) from public,anon,authenticated;
grant execute on function public.claim_telegram_alert_batch_with_cs_content(text) to service_role;
