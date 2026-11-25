create index fan_product_events_signup_source_idx
  on public.fan_product_events(app_user_id, created_at, id)
  where app_user_id is not null and source in ('acquisition.identified_handoff', 'acquisition.session_landing');

-- Read the earliest member-owned landing event recorded around account creation.
create function public.signup_source_snapshot(p_user_id uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('touch', touch.properties, 'inviter', invite.nickname)
  from public.app_users u
  left join lateral (
    select f.properties
    from public.fan_product_events f
    where f.app_user_id = u.id
      and f.source in ('acquisition.identified_handoff', 'acquisition.session_landing')
      and f.created_at between u.created_at and u.created_at + interval '10 minutes'
      and f.occurred_at between u.created_at - interval '1 day' and u.created_at + interval '1 minute'
    order by f.created_at, f.id limit 1
  ) touch on true
  left join lateral (
    select left(p.nickname, 48) as nickname
    from public.community_stamp_invite_redemptions r
    join public.user_profiles p on p.app_user_id = r.inviter_app_user_id
    where r.invitee_app_user_id = u.id
      and r.redeemed_at between u.created_at and u.created_at + interval '10 minutes'
    order by r.redeemed_at, r.id limit 1
  ) invite on true
  where u.id = p_user_id
$$;

create function public.signup_source_site(p_touch jsonb) returns text
language sql immutable set search_path='' as $$
  select case
    when (p_touch->>'referrerHost') in ('t.co','x.com','www.x.com','twitter.com','www.twitter.com') then 'X'
    when (p_touch->>'referrerHost') in ('instagram.com','www.instagram.com','l.instagram.com') then '인스타그램'
    when (p_touch->>'referrerHost') in ('koreapas.com','www.koreapas.com') then '고파스'
    when (p_touch->>'referrerHost') in ('reddit.com','www.reddit.com','old.reddit.com','redd.it') then '레딧'
    when (p_touch->>'referrerHost') in ('threads.net','www.threads.net','threads.com','www.threads.com') then '스레드'
    when p_touch ? 'referrerHost' then p_touch->>'referrerHost'
    else case p_touch->>'utmSource'
      when 'x' then 'X' when 'instagram' then '인스타그램' when 'koreapas' then '고파스'
      when 'reddit' then '레딧' when 'threads' then '스레드' when 'email' then '이메일'
      else p_touch->>'utmSource' end
  end
$$;

create function public.signup_source_alert_line(p_user_id uuid) returns text
language sql stable set search_path='' as $$
  select concat_ws(' · ',
    '유입: ' || coalesce(public.signup_source_site(touch) ||
      case when touch ? 'referrerHost' and public.signup_source_site(touch) <> touch->>'referrerHost'
        then '(' || (touch->>'referrerHost') || ')' else '' end,
      case touch->>'channel' when 'search' then '검색' when 'social' then 'SNS'
        when 'email' then '이메일' when 'paid' then '광고' when 'referral' then '다른 사이트' end, '직접 방문'),
    'utm ' || nullif(concat_ws('/', touch->>'utmSource', touch->>'utmMedium', touch->>'utmCampaign', touch->>'utmContent'), ''),
    '초대: ' || nullif(btrim(regexp_replace(snapshot->>'inviter', '[[:space:][:cntrl:]]+', ' ', 'g')), '')
  )
  from (select public.signup_source_snapshot(p_user_id) as snapshot) s
  cross join lateral (select snapshot->'touch' as touch) t
$$;

revoke all on function public.signup_source_snapshot(uuid), public.signup_source_site(jsonb),
  public.signup_source_alert_line(uuid) from public, anon, authenticated;
grant execute on function public.signup_source_snapshot(uuid), public.signup_source_site(jsonb),
  public.signup_source_alert_line(uuid) to service_role;

create or replace function public.claim_telegram_alert_batch_with_signup_source(p_chat_id text) returns jsonb
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
    order by created_at,id for update skip locked limit 20 loop
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
    elsif c.kind='sns_ingest_stale' then
      select jsonb_build_object('kind',c.kind,'creator_name',left(coalesce(k.name,e.name,a.slug),120),
        'live_title',null,'winner_count',null,'occurred_at',c.occurred_at,
        'actor_name',null,'actor_email',null,'sns_platform',src.platform,'sns_last_success_at',x.last_success_at) into payload
        from public.sns_ingest_stale_alerts x
        join public.sns_ingest_sources src on src.id=x.source_id
        join public.celebrities a on a.id=src.celebrity_id and a.status='published'
        left join public.celebrity_localizations k on k.celebrity_id=a.id and k.locale='ko'
        left join public.celebrity_localizations e on e.celebrity_id=a.id and e.locale='en'
        where x.id=c.source_id;
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
    if c.kind in ('member_joined','raffle_entered') then
      payload := payload || jsonb_build_object('signup_source_line',
        public.signup_source_alert_line(coalesce((payload #>> '{detail,actor_id}')::uuid,
          case when c.kind = 'member_joined' then c.source_id end)));
    end if;
    -- JSON escaping plus 2x code points bounds UTF-16 text and quote prefixes.
    -- An oversized first post is rendered as an explicit linked preview by worker.
    cost:=case when payload ? 'detail' or payload ? 'signup_source_line' then 2*char_length(payload::text)+300
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
revoke all on function public.claim_telegram_alert_batch_with_signup_source(text) from public,anon,authenticated;
grant execute on function public.claim_telegram_alert_batch_with_signup_source(text) to service_role;
