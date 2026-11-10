-- Deploy the notification worker that accepts sns_ingest_stale before this migration.
begin;

-- Machine SNS ingest: the only writer is POST /api/internal/sns-ingest (service role).
-- It may create artist_post drafts, restore its own never-published drafts and publish them.
-- It cannot touch published, archived, ever-published or non-ingest content.

create table public.sns_ingest_sources (
  id uuid not null unique default extensions.gen_random_uuid(),
  celebrity_id uuid not null references public.celebrities(id) on delete cascade,
  platform text not null check (platform in ('instagram','tiktok')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text check (last_error is null or last_error ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  last_alerted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  primary key (celebrity_id, platform)
);

create table public.sns_ingest_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  celebrity_id uuid not null references public.celebrities(id) on delete cascade,
  platform text not null check (platform in ('instagram','tiktok')),
  account_url text not null check (account_url ~ '^https://'),
  correlation_id uuid not null,
  collector_error text check (collector_error is null or collector_error ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  succeeded boolean,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items)='array')
);
create index sns_ingest_runs_source_idx on public.sns_ingest_runs (celebrity_id, platform, started_at desc);

create table public.sns_ingest_posts (
  notice_id uuid primary key references public.celebrity_notices(id) on delete restrict,
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  platform text not null check (platform in ('instagram','tiktok')),
  slug text not null check (slug ~ '^(instagram|tiktok)-[0-9a-f]{16}$'),
  source_url text not null check (source_url ~ '^https://'),
  source_published_at timestamptz not null,
  created_run_id uuid not null references public.sns_ingest_runs(id) on delete restrict,
  last_run_id uuid not null references public.sns_ingest_runs(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (celebrity_id, slug)
);

-- Images downloaded from the platform CDN, served by /api/public/notice-media/<id>
-- only while the notice is visible (see authorize_public_official_media_read).
create table public.sns_ingest_media (
  id uuid primary key,
  notice_id uuid not null references public.sns_ingest_posts(notice_id) on delete restrict,
  storage_path text not null unique check (storage_path ~ '^sns-ingest/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  thumbnail_path text not null unique check (thumbnail_path ~ '^sns-ingest/[0-9a-f-]{36}/[0-9a-f-]{36}-thumbnail\.webp$'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  byte_size integer not null check (byte_size between 1 and 8388608),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  source_host text not null,
  created_at timestamptz not null default clock_timestamp()
);

create table public.sns_ingest_stale_alerts (
  id uuid primary key default extensions.gen_random_uuid(),
  source_id uuid not null references public.sns_ingest_sources(id) on delete cascade,
  last_success_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

do $$ declare t text; begin
  foreach t in array array['sns_ingest_sources','sns_ingest_runs','sns_ingest_posts','sns_ingest_media','sns_ingest_stale_alerts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role', t);
  end loop;
end $$;

create function public.sns_ingest_source_context(p_celebrity_slug text, p_platform text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('celebrityId', c.id, 'accountUrl', l.url)
  from public.celebrities c
  join public.celebrity_social_links l on l.celebrity_id=c.id and l.platform::text=p_platform and l.active
  where c.slug=p_celebrity_slug and c.status='published' and c.archived_at is null
    and p_platform in ('instagram','tiktok');
$$;

create function public.sns_ingest_begin_run(p_celebrity_id uuid, p_platform text, p_account_url text, p_correlation_id uuid, p_collector_error text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; t timestamptz:=clock_timestamp();
begin
  if not exists(select 1 from public.celebrities c join public.celebrity_social_links l on l.celebrity_id=c.id
    where c.id=p_celebrity_id and c.status='published' and c.archived_at is null
      and l.platform::text=p_platform and l.active and l.url=p_account_url) then
    raise exception 'SNS_INGEST_SOURCE_NOT_REGISTERED' using errcode='P0002';
  end if;
  insert into public.sns_ingest_sources(celebrity_id,platform,last_attempt_at,last_error)
    values(p_celebrity_id,p_platform,t,p_collector_error)
    on conflict(celebrity_id,platform) do update set last_attempt_at=t,last_error=excluded.last_error;
  insert into public.sns_ingest_runs(celebrity_id,platform,account_url,correlation_id,collector_error,started_at)
    values(p_celebrity_id,p_platform,p_account_url,p_correlation_id,p_collector_error,t) returning id into v_id;
  return v_id;
end $$;

-- Creates a draft, or rewrites a draft this path created that was never published.
create function public.sns_ingest_save_draft(
  p_run_id uuid, p_slug text, p_source_url text, p_source_published_at timestamptz,
  p_title text, p_body jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.sns_ingest_runs; n public.celebrity_notices; v_id uuid; v_src text; v_media uuid; v_status text;
begin
  select * into r from public.sns_ingest_runs where id=p_run_id and finished_at is null;
  if not found then raise exception 'SNS_INGEST_RUN_NOT_FOUND' using errcode='P0002'; end if;
  if p_slug !~ ('^'||r.platform||'-[0-9a-f]{16}$') then raise exception 'SNS_INGEST_INVALID_SLUG' using errcode='22023'; end if;
  select * into n from public.celebrity_notices where celebrity_id=r.celebrity_id and slug=p_slug for update;
  if found then
    if n.publication_status='published' then
      return jsonb_build_object('status','duplicate','noticeId',n.id,'revision',n.revision);
    end if;
    if n.archived_at is not null or n.ever_published_at is not null or n.post_type<>'artist_post'
      or n.visibility<>'public' or n.notice_kind<>'standard' or n.pinned then
      return jsonb_build_object('status','blocked','noticeId',n.id,'revision',n.revision);
    end if;
    v_id:=n.id; v_status:='restored';
  else
    v_id:=extensions.gen_random_uuid(); v_status:='created';
  end if;
  -- Body images must be this notice's own ingested media.
  for v_src in select value#>>'{}' from jsonb_path_query(p_body,'strict $.**.attrs.src') x(value) loop
    if v_src !~ '^/api/public/notice-media/[0-9a-f-]{36}$' then raise exception 'SNS_INGEST_INVALID_MEDIA' using errcode='22023'; end if;
    v_media:=substring(v_src from '[0-9a-f-]{36}$')::uuid;
    if not exists(select 1 from public.sns_ingest_media where id=v_media and notice_id=v_id) then
      raise exception 'SNS_INGEST_INVALID_MEDIA' using errcode='22023';
    end if;
  end loop;
  if v_status='created' then
    insert into public.celebrity_notices(id,celebrity_id,slug,pinned,post_type,visibility)
      values(v_id,r.celebrity_id,p_slug,false,'artist_post','public');
  else
    update public.celebrity_notices set revision=revision+1 where id=v_id;
  end if;
  insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json) values
    (v_id,'ko',p_title,p_body),(v_id,'en',p_title,p_body)
    on conflict(notice_id,locale) do update set title=excluded.title,body_json=excluded.body_json;
  insert into public.sns_ingest_posts(notice_id,celebrity_id,platform,slug,source_url,source_published_at,created_run_id,last_run_id)
    values(v_id,r.celebrity_id,r.platform,p_slug,p_source_url,p_source_published_at,p_run_id,p_run_id)
    on conflict(notice_id) do update set source_url=excluded.source_url,source_published_at=excluded.source_published_at,last_run_id=p_run_id;
  insert into public.audit_logs(action,entity_type,entity_id,correlation_id,before_after_summary)
    values(case when v_status='created' then 'notice.sns_ingest.created' else 'notice.sns_ingest.restored' end,
      'celebrity_notice',v_id::text,r.correlation_id,jsonb_build_object('runId',p_run_id,'slug',p_slug,'celebrityId',r.celebrity_id));
  return jsonb_build_object('status',v_status,'noticeId',v_id,'revision',(select revision from public.celebrity_notices where id=v_id));
end $$;

create function public.sns_ingest_register_media(
  p_run_id uuid, p_notice_id uuid, p_media_id uuid, p_storage_path text, p_thumbnail_path text,
  p_width integer, p_height integer, p_byte_size integer, p_sha256 text, p_source_host text
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.sns_ingest_posts p join public.celebrity_notices n on n.id=p.notice_id
    where p.notice_id=p_notice_id and p.last_run_id=p_run_id and n.publication_status='draft'
      and n.archived_at is null and n.ever_published_at is null) then
    raise exception 'SNS_INGEST_NOTICE_NOT_WRITABLE' using errcode='P0002';
  end if;
  -- The body references at most two; retries of a held draft may register replacements.
  if (select count(*) from public.sns_ingest_media where notice_id=p_notice_id)>=10 then
    raise exception 'SNS_INGEST_TOO_MANY_MEDIA' using errcode='22023';
  end if;
  insert into public.sns_ingest_media(id,notice_id,storage_path,thumbnail_path,width,height,byte_size,sha256,source_host)
    values(p_media_id,p_notice_id,p_storage_path,p_thumbnail_path,p_width,p_height,p_byte_size,p_sha256,p_source_host);
end $$;

create function public.sns_ingest_read_draft(p_notice_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('revision',n.revision,'publicationStatus',n.publication_status,
    'localizations',jsonb_object_agg(l.locale,jsonb_build_object('title',l.title,'body',l.body_json)))
  from public.sns_ingest_posts p
  join public.celebrity_notices n on n.id=p.notice_id
  join public.celebrity_notice_localizations l on l.notice_id=n.id
  where p.notice_id=p_notice_id
  group by n.id;
$$;

create function public.sns_ingest_publish(p_run_id uuid, p_notice_id uuid, p_expected_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare n public.celebrity_notices; r public.sns_ingest_runs;
begin
  select * into r from public.sns_ingest_runs where id=p_run_id and finished_at is null;
  if not found then raise exception 'SNS_INGEST_RUN_NOT_FOUND' using errcode='P0002'; end if;
  select n0.* into n from public.celebrity_notices n0 join public.sns_ingest_posts p on p.notice_id=n0.id
    where n0.id=p_notice_id and p.last_run_id=p_run_id for update of n0;
  if not found or n.publication_status<>'draft' or n.archived_at is not null or n.ever_published_at is not null
    or n.post_type<>'artist_post' or n.visibility<>'public' then
    raise exception 'SNS_INGEST_NOTICE_NOT_WRITABLE' using errcode='P0002';
  end if;
  if n.revision<>p_expected_revision then raise exception 'SNS_INGEST_REVISION_CONFLICT' using errcode='40001'; end if;
  update public.celebrity_notices set publication_status='published',published_at=now(),
    ever_published_at=now(),revision=revision+1 where id=p_notice_id;
  insert into public.audit_logs(action,entity_type,entity_id,correlation_id,before_after_summary)
    values('notice.sns_ingest.published','celebrity_notice',p_notice_id::text,r.correlation_id,jsonb_build_object('runId',p_run_id));
end $$;

create function public.sns_ingest_finish_run(p_run_id uuid, p_items jsonb, p_succeeded boolean)
returns void language plpgsql security definer set search_path='' as $$
declare r public.sns_ingest_runs; t timestamptz:=clock_timestamp();
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>50 then
    raise exception 'SNS_INGEST_INVALID_ITEMS' using errcode='22023';
  end if;
  update public.sns_ingest_runs set finished_at=t,succeeded=p_succeeded,items=p_items
    where id=p_run_id and finished_at is null returning * into r;
  if not found then raise exception 'SNS_INGEST_RUN_NOT_FOUND' using errcode='P0002'; end if;
  update public.sns_ingest_sources set
      last_success_at=case when p_succeeded then t else last_success_at end,
      last_error=case when p_succeeded then null else coalesce(r.collector_error,'INGEST_FAILED') end
    where celebrity_id=r.celebrity_id and platform=r.platform;
end $$;

create or replace function public.authorize_public_official_media_read(p_asset_id uuid,p_variant text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((
    select jsonb_build_object(
      'storagePath',case when p_variant='thumbnail'then a.thumbnail_path else a.storage_path end,
      'contentType',case when p_variant='thumbnail'then'image/webp'else a.content_type end)
    from public.mobile_media_assets a
    where a.id=p_asset_id and p_variant in('original','thumbnail') and a.kind in('image','video')
      and a.state='ready'and a.storage_deleted_at is null and a.cleanup_requested_at is null
      and a.attached_type='notice'and a.access_scope='notice'
      and public.fan_web_content_visible(null,'notice',a.attached_id)),(
    select jsonb_build_object(
      'storagePath',case when p_variant='thumbnail'then m.thumbnail_path else m.storage_path end,
      'contentType','image/webp')
    from public.sns_ingest_media m
    where m.id=p_asset_id and p_variant in('original','thumbnail')
      and public.fan_web_content_visible(null,'notice',m.notice_id)));
$$;

-- 24-hour stale source alert, at most once a day per source, from the hourly maintenance task.
alter table public.telegram_alert_outbox drop constraint telegram_alert_outbox_kind_check;
alter table public.telegram_alert_outbox add constraint telegram_alert_outbox_kind_check
  check(kind in ('member_joined','fan_joined','live_reserved','live_attended','draw_published','cs_inquiry_created','cs_user_replied','campaign_visited','raffle_entered','benefit_claimed','reaction_completed','mission_submitted','journey_completed','collectible_claimed','invite_redeemed','certification_approved','certification_rejected','fulfillment_updated','fulfillment_unclaimed','business_received','business_failed','mint_completed','mint_failed','delivery_failed','live_published','live_cancelled','live_rescheduled','campaign_outbound','fan_post_created','fan_post_commented','fan_post_liked','fan_lounge_posted','notice_commented','daily_checked_in','byus_day_rsvp_received','content_report_created','youtube_live_started','sns_ingest_stale'));

create or replace function public.maintain_telegram_alerts() returns void
language plpgsql security definer set search_path='' as $$
declare cfg public.telegram_alert_settings; t timestamptz:=clock_timestamp(); s public.sns_ingest_sources; alert uuid;
begin
  -- All queue/control mutations use this lock order: settings, then outbox.
  select * into cfg from public.telegram_alert_settings where singleton for update;
  update public.telegram_alert_outbox set status='delivery_unknown',last_error='DELIVERY_UNKNOWN',finished_at=t,lease_expires_at=null
    where status='sending' and lease_expires_at<=t;
  update public.telegram_alert_outbox set status='pending',batch_id=null,lease_expires_at=null
    where status='claimed' and lease_expires_at<=t;
  update public.telegram_alert_outbox set status='skipped',finished_at=t,lease_expires_at=null
    where status in ('pending','claimed') and
      (not cfg.enabled or activation_id<>cfg.activation_id or chat_id is distinct from cfg.chat_id or created_at<t-interval '1 day');
  update public.telegram_alert_settings set batch_id=null,lease_expires_at=null
    where singleton and lease_expires_at<=t;
  delete from public.telegram_alert_outbox where finished_at<t-interval '30 days';
  if coalesce(cfg.enabled,false) then
    for s in select src.* from public.sns_ingest_sources src
      join public.celebrities c on c.id=src.celebrity_id and c.status='published' and c.archived_at is null
      where exists(select 1 from public.celebrity_social_links l where l.celebrity_id=src.celebrity_id and l.platform::text=src.platform and l.active)
        and coalesce(src.last_success_at,src.created_at)<=t-interval '24 hours'
        and (src.last_alerted_at is null or src.last_alerted_at<=t-interval '24 hours')
      order by src.celebrity_id,src.platform for update of src skip locked loop
      insert into public.sns_ingest_stale_alerts(source_id,last_success_at) values(s.id,s.last_success_at) returning id into alert;
      insert into public.telegram_alert_outbox(kind,source_id,activation_id,chat_id,occurred_at)
        values('sns_ingest_stale',alert,cfg.activation_id,cfg.chat_id,t);
      update public.sns_ingest_sources set last_alerted_at=t where id=s.id;
    end loop;
  end if;
end $$;

-- Same as 20261208010000 plus the sns_ingest_stale payload.
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

revoke all on function public.sns_ingest_source_context(text,text),
  public.sns_ingest_begin_run(uuid,text,text,uuid,text),
  public.sns_ingest_save_draft(uuid,text,text,timestamptz,text,jsonb),
  public.sns_ingest_register_media(uuid,uuid,uuid,text,text,integer,integer,integer,text,text),
  public.sns_ingest_read_draft(uuid),
  public.sns_ingest_publish(uuid,uuid,integer),
  public.sns_ingest_finish_run(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.sns_ingest_source_context(text,text),
  public.sns_ingest_begin_run(uuid,text,text,uuid,text),
  public.sns_ingest_save_draft(uuid,text,text,timestamptz,text,jsonb),
  public.sns_ingest_register_media(uuid,uuid,uuid,text,text,integer,integer,integer,text,text),
  public.sns_ingest_read_draft(uuid),
  public.sns_ingest_publish(uuid,uuid,integer),
  public.sns_ingest_finish_run(uuid,jsonb,boolean) to service_role;

commit;
