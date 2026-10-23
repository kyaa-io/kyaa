-- Contact and entry commit together. Delivery retains references, never private payloads.
create table public.runmusic_telegram_deliveries(
 id uuid primary key default extensions.gen_random_uuid(),
 app_user_id uuid not null unique references public.app_users(id) on delete cascade,
 entered_at timestamptz not null default clock_timestamp(),
 state text not null default 'pending' check(state in('pending','claimed','sending','sent','failed','unknown','skipped')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 next_retry_at timestamptz not null default clock_timestamp(),
 claim_token uuid, lease_until timestamptz, chat_id text, message_id bigint check(message_id>0),
 finished_at timestamptz,
 reason text check(reason in('sent','rate_limited','provider_rejected','delivery_unknown','invalid_contact','ineligible'))
);
alter table public.runmusic_telegram_deliveries enable row level security;
alter table public.runmusic_telegram_deliveries force row level security;
revoke all on public.runmusic_telegram_deliveries from public,anon,authenticated,service_role;
create index runmusic_telegram_due on public.runmusic_telegram_deliveries(next_retry_at) where state in('pending','claimed','sending');

create function public.submit_owned_runmusic_v3(p_app_user_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.runmusic_campaign%rowtype;k uuid;h text;old_hash text;ts timestamptz;new_entry boolean;
begin
 select * into c from public.runmusic_campaign for update;
 perform public.fan_web_lock_active_user(p_app_user_id);
 ts:=clock_timestamp();
 if not c.published then raise exception 'RUNMUSIC_NOT_FOUND';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object'
   or (p_input-'action'-'requestKey'-'ciphertext'-'masked'-'fingerprint')<>'{}'::jsonb
   or p_input->>'action' is distinct from 'enter'
   or jsonb_typeof(p_input->'requestKey') is distinct from 'string'
   or (p_input->>'requestKey') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or jsonb_typeof(p_input->'ciphertext') is distinct from 'string'
   or length(coalesce(p_input->>'ciphertext','')) not between 1 and 1024
   or jsonb_typeof(p_input->'masked') is distinct from 'string'
   or length(coalesce(p_input->>'masked','')) not between 1 and 100
   or (p_input->>'masked') ~ '[[:cntrl:]]'
   or jsonb_typeof(p_input->'fingerprint') is distinct from 'string'
   or (p_input->>'fingerprint') !~ '^[0-9a-f]{64}$'
 then raise exception 'RUNMUSIC_INVALID_REQUEST';end if;
 k:=(p_input->>'requestKey')::uuid;
 h:=encode(extensions.digest(jsonb_build_object('action','enter_with_contact','fingerprint',p_input->>'fingerprint')::text,'sha256'),'hex');
 select input_hash into old_hash from public.runmusic_requests where app_user_id=p_app_user_id and request_key=k;
 if found then
  if old_hash<>h then raise exception 'RUNMUSIC_CONFLICT';end if;
  return public.read_owned_runmusic_v2(p_app_user_id);
 end if;
 new_entry:=not public.runmusic_entered(p_app_user_id);
 if new_entry then
  if c.draw_id is not null or ts<c.registration_opens_at or ts>=c.entry_closes_at then raise exception 'RUNMUSIC_CLOSED';end if;
  if not public.runmusic_liked(p_app_user_id) then raise exception 'RUNMUSIC_LIKE_REQUIRED';end if;
  insert into public.runmusic_registrations(app_user_id) values(p_app_user_id);
 elsif c.results_published and not exists(select 1 from public.runmusic_draw_entries
   where draw_id=c.draw_id and app_user_id=p_app_user_id and winner
    and coalesce(received_at,c.drawn_at)+interval'30 days'>ts) then raise exception 'RUNMUSIC_CLOSED';
 end if;
 insert into public.runmusic_contacts(app_user_id,ciphertext,masked,fingerprint) values
  (p_app_user_id,p_input->>'ciphertext',p_input->>'masked',p_input->>'fingerprint')
 on conflict(app_user_id) do update set ciphertext=excluded.ciphertext,masked=excluded.masked,
  fingerprint=excluded.fingerprint,updated_at=ts;
 if new_entry then
  insert into public.runmusic_telegram_deliveries(app_user_id,entered_at) values(p_app_user_id,ts);
 end if;
 insert into public.runmusic_requests values(p_app_user_id,k,h);
 return public.read_owned_runmusic_v2(p_app_user_id);
end $$;

create function public.claim_runmusic_telegram_delivery(p_app_user_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.runmusic_telegram_deliveries%rowtype;ts timestamptz:=clock_timestamp();
begin
 -- A crash after begin may have reached Telegram: never retry that ambiguity.
 update public.runmusic_telegram_deliveries set state='unknown',reason='delivery_unknown',finished_at=ts,
  claim_token=null,lease_until=null where state='sending' and lease_until<=ts;
 select * into d from public.runmusic_telegram_deliveries
  where (p_app_user_id is null or app_user_id=p_app_user_id) and attempts<5
   and ((state='pending' and next_retry_at<=ts) or (state='claimed' and lease_until<=ts))
  order by next_retry_at,id for update skip locked limit 1;
 if not found then return null;end if;
 update public.runmusic_telegram_deliveries set state='claimed',claim_token=extensions.gen_random_uuid(),
  lease_until=ts+interval'60 seconds' where id=d.id returning * into d;
 return jsonb_build_object('id',d.id,'claimToken',d.claim_token);
end $$;

create function public.begin_runmusic_telegram_delivery(p_delivery_id uuid,p_claim_token uuid,p_chat_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.runmusic_campaign%rowtype;d public.runmusic_telegram_deliveries%rowtype;
 owner_id uuid;email text;secret text;ts timestamptz;
begin
 if p_chat_id is null or p_chat_id !~ '^-[0-9]{1,20}$' then raise exception 'RUNMUSIC_INVALID_REQUEST';end if;
 select * into c from public.runmusic_campaign for update;
 select app_user_id into owner_id from public.runmusic_telegram_deliveries where id=p_delivery_id;
 if not found then return null;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:'||owner_id::text,0));
 select * into d from public.runmusic_telegram_deliveries where id=p_delivery_id for update;
 ts:=clock_timestamp();
 if not found or d.state<>'claimed' or d.claim_token is distinct from p_claim_token or d.lease_until<=ts then return null;end if;
 select u.verified_email,x.ciphertext into email,secret from public.app_users u
  join public.runmusic_contacts x on x.app_user_id=u.id
  where u.id=owner_id and u.status='active' and nullif(btrim(u.verified_email),'') is not null
  and (not c.results_published or exists(select 1 from public.runmusic_draw_entries e
   where e.draw_id=c.draw_id and e.app_user_id=owner_id and e.winner
    and coalesce(e.received_at,c.drawn_at)+interval'30 days'>ts));
 if email is null or secret is null then
  update public.runmusic_telegram_deliveries set state='skipped',reason='ineligible',finished_at=ts,
   claim_token=null,lease_until=null where id=d.id;
  return null;
 end if;
 update public.runmusic_telegram_deliveries set state='sending',attempts=attempts+1,
  chat_id=p_chat_id,lease_until=ts+interval'60 seconds' where id=d.id;
 return jsonb_build_object('appUserId',owner_id,'email',email,'ciphertext',secret,'enteredAt',d.entered_at);
end $$;

create function public.finish_runmusic_telegram_delivery(p_delivery_id uuid,p_claim_token uuid,p_outcome text,
 p_message_id bigint default null,p_retry_after integer default null,p_reason text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare d public.runmusic_telegram_deliveries%rowtype;ts timestamptz:=clock_timestamp();new_state text;new_reason text;
begin
 if p_outcome is null or p_outcome not in('sent','throttled','rejected','unknown','invalid_contact')
  or (p_outcome='sent' and (p_message_id is null or p_message_id<=0))
  or (p_reason is not null and p_reason not in('sent','rate_limited','provider_rejected','delivery_unknown','invalid_contact'))
 then raise exception 'RUNMUSIC_INVALID_REQUEST';end if;
 select * into d from public.runmusic_telegram_deliveries where id=p_delivery_id for update;
 if not found or d.state<>'sending' or d.claim_token is distinct from p_claim_token then return false;end if;
 if d.lease_until<=ts then
  update public.runmusic_telegram_deliveries set state='unknown',reason='delivery_unknown',finished_at=ts,
   claim_token=null,lease_until=null where id=d.id;
  return false;
 end if;
 new_state:=case p_outcome when 'sent' then 'sent' when 'throttled' then case when d.attempts<5 then 'pending' else 'failed' end
  when 'unknown' then 'unknown' else 'failed' end;
 new_reason:=case p_outcome when 'sent' then 'sent' when 'throttled' then 'rate_limited'
  when 'rejected' then 'provider_rejected' when 'unknown' then 'delivery_unknown' else 'invalid_contact' end;
 update public.runmusic_telegram_deliveries set state=new_state,reason=new_reason,
  message_id=case when p_outcome='sent' then p_message_id end,
  next_retry_at=case when new_state='pending' then ts+make_interval(secs=>greatest(1,least(coalesce(p_retry_after,60),86400))) else next_retry_at end,
  finished_at=case when new_state<>'pending' then ts end,claim_token=null,lease_until=null where id=d.id;
 return true;
end $$;

revoke all on function public.submit_owned_runmusic_v3(uuid,jsonb),public.claim_runmusic_telegram_delivery(uuid),
 public.begin_runmusic_telegram_delivery(uuid,uuid,text),public.finish_runmusic_telegram_delivery(uuid,uuid,text,bigint,integer,text)
 from public,anon,authenticated,service_role;
grant execute on function public.submit_owned_runmusic_v3(uuid,jsonb),public.claim_runmusic_telegram_delivery(uuid),
 public.begin_runmusic_telegram_delivery(uuid,uuid,text),public.finish_runmusic_telegram_delivery(uuid,uuid,text,bigint,integer,text) to service_role;
