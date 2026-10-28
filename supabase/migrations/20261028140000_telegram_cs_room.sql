-- Independent customer inquiry room; activation never backfills existing messages.
create table public.telegram_cs_alert_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  chat_id text check (chat_id ~ '^-[0-9]{1,19}$'),
  activation_id uuid not null default gen_random_uuid(),
  activated_at timestamptz not null default clock_timestamp(),
  next_send_at timestamptz not null default '-infinity',
  batch_id uuid,
  lease_expires_at timestamptz,
  check (not enabled or chat_id is not null)
);
insert into public.telegram_cs_alert_settings(singleton) values(true);

create table public.telegram_cs_alert_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('cs_inquiry_created','cs_user_replied')),
  source_id uuid not null,
  activation_id uuid not null,
  chat_id text not null check (chat_id ~ '^-[0-9]{1,19}$'),
  creator_name text check (char_length(creator_name)<=120),
  live_title text check (char_length(live_title)<=200),
  winner_count integer check (winner_count>0),
  occurred_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  status text not null default 'pending' check (status in ('pending','claimed','sending','sent','failed','delivery_unknown','skipped')),
  batch_id uuid,
  lease_expires_at timestamptz,
  available_at timestamptz not null default clock_timestamp(),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  provider_message_id bigint,
  last_error text check (last_error in ('THROTTLED','REJECTED','DELIVERY_UNKNOWN')),
  finished_at timestamptz,
  unique(kind,source_id)
);
create index telegram_cs_alert_outbox_pending_idx on public.telegram_cs_alert_outbox(available_at,created_at,id) where status='pending';
create index telegram_cs_alert_outbox_batch_idx on public.telegram_cs_alert_outbox(batch_id) where batch_id is not null;
alter table public.telegram_cs_alert_settings enable row level security;
alter table public.telegram_cs_alert_settings force row level security;
alter table public.telegram_cs_alert_outbox enable row level security;
alter table public.telegram_cs_alert_outbox force row level security;
revoke all on public.telegram_cs_alert_settings,public.telegram_cs_alert_outbox from public,anon,authenticated,service_role;

create function public.configure_telegram_cs_alerts(p_chat_id text,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare cfg public.telegram_cs_alert_settings;
begin
  if p_enabled is null or (p_enabled and (p_chat_id is null or p_chat_id !~ '^-[0-9]{1,19}$')) then
    raise exception 'TELEGRAM_CONFIG_INVALID';
  end if;
  select * into cfg from public.telegram_cs_alert_settings where singleton for update;
  if cfg.enabled=p_enabled and cfg.chat_id is not distinct from p_chat_id then return; end if;
  -- A request that has already entered sending may still arrive. Keep its
  -- uncertain state and room throttle; never reassign it to a different room.
  update public.telegram_cs_alert_outbox set status='skipped',finished_at=clock_timestamp(),lease_expires_at=null
    where status in ('pending','claimed');
  update public.telegram_cs_alert_settings set enabled=p_enabled,chat_id=p_chat_id,
    activation_id=gen_random_uuid(),activated_at=clock_timestamp(),batch_id=null,lease_expires_at=null
    where singleton;
end $$;

create function public.maintain_telegram_cs_alerts() returns void
language plpgsql security definer set search_path='' as $$
declare cfg public.telegram_cs_alert_settings; t timestamptz:=clock_timestamp();
begin
  -- All queue/control mutations use this lock order: settings, then outbox.
  select * into cfg from public.telegram_cs_alert_settings where singleton for update;
  update public.telegram_cs_alert_outbox set status='delivery_unknown',last_error='DELIVERY_UNKNOWN',finished_at=t,lease_expires_at=null
    where status='sending' and lease_expires_at<=t;
  update public.telegram_cs_alert_outbox set status='pending',batch_id=null,lease_expires_at=null
    where status='claimed' and lease_expires_at<=t;
  update public.telegram_cs_alert_outbox set status='skipped',finished_at=t,lease_expires_at=null
    where status in ('pending','claimed') and
      (not cfg.enabled or activation_id<>cfg.activation_id or chat_id is distinct from cfg.chat_id or created_at<t-interval '1 day');
  update public.telegram_cs_alert_settings set batch_id=null,lease_expires_at=null
    where singleton and lease_expires_at<=t;
  delete from public.telegram_cs_alert_outbox where finished_at<t-interval '30 days';
end $$;

create function public.begin_telegram_cs_alert_send(p_batch_id uuid,p_chat_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare cfg public.telegram_cs_alert_settings; t timestamptz:=clock_timestamp(); n integer;
begin
  select * into cfg from public.telegram_cs_alert_settings where singleton for update;
  if not cfg.enabled or cfg.chat_id is distinct from p_chat_id or cfg.batch_id is distinct from p_batch_id
    or cfg.lease_expires_at is null or cfg.lease_expires_at<=t or cfg.next_send_at>t then return false; end if;
  update public.telegram_cs_alert_outbox set status='sending',attempt_count=attempt_count+1,lease_expires_at=t+interval '120 seconds'
    where batch_id=p_batch_id and status='claimed' and lease_expires_at>t
      and activation_id=cfg.activation_id and chat_id=cfg.chat_id and attempt_count<3;
  get diagnostics n=row_count;
  if n=0 then return false; end if;
  update public.telegram_cs_alert_settings set next_send_at=t+interval '60 seconds',lease_expires_at=t+interval '120 seconds' where singleton;
  return true;
end $$;

create function public.finish_telegram_cs_alert_batch(p_batch_id uuid,p_outcome text,p_provider_message_id bigint default null,p_retry_after integer default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare cfg public.telegram_cs_alert_settings; t timestamptz:=clock_timestamp(); delay_seconds integer; n integer; destination text;
begin
  if p_outcome is null or p_outcome not in ('sent','throttled','rejected','unknown')
    or (p_outcome='sent' and (p_provider_message_id is null or p_provider_message_id<=0)) then raise exception 'TELEGRAM_OUTCOME_INVALID'; end if;
  delay_seconds:=greatest(60,least(coalesce(p_retry_after,60),86400));
  select * into cfg from public.telegram_cs_alert_settings where singleton for update;
  select chat_id into destination from public.telegram_cs_alert_outbox where batch_id=p_batch_id and status='sending' limit 1;
  update public.telegram_cs_alert_outbox set
    status=case when p_outcome='sent' then 'sent' when p_outcome='throttled' and attempt_count<3 then 'pending' when p_outcome='unknown' then 'delivery_unknown' else 'failed' end,
    last_error=case p_outcome when 'throttled' then 'THROTTLED' when 'rejected' then 'REJECTED' when 'unknown' then 'DELIVERY_UNKNOWN' else null end,
    provider_message_id=case when p_outcome='sent' then p_provider_message_id else null end,
    available_at=case when p_outcome='throttled' then t+make_interval(secs=>delay_seconds) else available_at end,
    lease_expires_at=null,
    finished_at=case when p_outcome='throttled' and attempt_count<3 then null else t end
    where batch_id=p_batch_id and status='sending' and lease_expires_at>t;
  get diagnostics n=row_count;
  if n=0 then return false; end if;
  if p_outcome='throttled' and destination=cfg.chat_id then
    update public.telegram_cs_alert_settings set next_send_at=greatest(next_send_at,t+make_interval(secs=>delay_seconds)) where singleton;
  end if;
  update public.telegram_cs_alert_settings set batch_id=null,lease_expires_at=null where singleton and batch_id=p_batch_id;
  return true;
end $$;

create function public.claim_telegram_cs_alert_batch(p_chat_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.telegram_cs_alert_settings; token uuid:=gen_random_uuid(); result jsonb; t timestamptz:=clock_timestamp();
begin
  perform public.maintain_telegram_cs_alerts();
  select * into cfg from public.telegram_cs_alert_settings where singleton for update;
  if not cfg.enabled or cfg.chat_id is distinct from p_chat_id or cfg.next_send_at>t
    or (cfg.lease_expires_at is not null and cfg.lease_expires_at>t) then return null; end if;
  with candidates as (
    select id from public.telegram_cs_alert_outbox where status='pending' and available_at<=t
      and activation_id=cfg.activation_id and chat_id=cfg.chat_id and attempt_count<3
      order by created_at,id for update skip locked limit 5
  ), claimed as (
    update public.telegram_cs_alert_outbox o set status='claimed',batch_id=token,lease_expires_at=t+interval '60 seconds'
      from candidates c where o.id=c.id returning o.*
  ) select jsonb_build_object('batch_id',token,'alerts',jsonb_agg(jsonb_build_object(
      'kind',c.kind,'creator_name',c.creator_name,'live_title',c.live_title,
      'winner_count',c.winner_count,'occurred_at',c.occurred_at,
      'actor_name',null,'actor_email',null,'inquiry_id',m.inquiry_id,'message_body',m.body
    ) order by c.created_at,c.id)) into result
    from claimed c join public.cs_messages m on m.id=c.source_id
    having count(*)>0;
  if result is null then return null; end if;
  update public.telegram_cs_alert_settings set batch_id=token,lease_expires_at=t+interval '60 seconds' where singleton;
  return result;
end $$;

create function public.capture_telegram_cs_room_message() returns trigger
language plpgsql security definer set search_path='' as $$
declare cfg public.telegram_cs_alert_settings; event_kind text;
begin
  if new.actor_admin_allowlist_id is not null then return new; end if;
  select * into cfg from public.telegram_cs_alert_settings where singleton;
  if not coalesce(cfg.enabled,false) or new.created_at<cfg.activated_at then return new; end if;
  event_kind:=case when new.operation='create' then 'cs_inquiry_created' else 'cs_user_replied' end;
  insert into public.telegram_cs_alert_outbox(kind,source_id,activation_id,chat_id,occurred_at)
    values(event_kind,new.id,cfg.activation_id,cfg.chat_id,new.created_at)
    on conflict(kind,source_id) do nothing;
  return new;
exception when others then
  raise log 'TELEGRAM_CS_CAPTURE_FAILED sqlstate=%',sqlstate;
  return new;
end $$;
revoke all on function public.capture_telegram_cs_room_message() from public,anon,authenticated,service_role;
create trigger cs_messages_telegram_cs_room_alert after insert on public.cs_messages
  for each row execute function public.capture_telegram_cs_room_message();


revoke all on function public.configure_telegram_cs_alerts(text,boolean) from public,anon,authenticated,service_role;

revoke all on function public.maintain_telegram_cs_alerts() from public,anon,authenticated,service_role;

revoke all on function public.begin_telegram_cs_alert_send(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.begin_telegram_cs_alert_send(uuid,text) to service_role;

revoke all on function public.finish_telegram_cs_alert_batch(uuid,text,bigint,integer) from public,anon,authenticated,service_role;
grant execute on function public.finish_telegram_cs_alert_batch(uuid,text,bigint,integer) to service_role;

revoke all on function public.claim_telegram_cs_alert_batch(text) from public,anon,authenticated,service_role;
grant execute on function public.claim_telegram_cs_alert_batch(text) to service_role;
