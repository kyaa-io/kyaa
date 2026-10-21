begin;
alter table public.kyaa_wave_participants add column name_fingerprint text check(name_fingerprint ~ '^[a-f0-9]{64}$');
-- NOT VALID tolerates historical rows but rejects writes from an in-flight legacy function.
alter table public.kyaa_wave_participants add constraint kyaa_wave_participants_name_fingerprint_required check(name_fingerprint is not null) not valid;
create index kyaa_wave_participants_name_idx on public.kyaa_wave_participants(event_key,name_fingerprint);

create table public.kyaa_wave_participation_name_exceptions (
 id uuid not null unique default extensions.gen_random_uuid(),
 event_key text not null default 'kyaa-wave-2026' check(event_key='kyaa-wave-2026') references public.kyaa_wave_participation_config(event_key),
 app_user_id uuid not null references public.app_users(id) on delete cascade,
 name_fingerprint text not null check(name_fingerprint ~ '^[a-f0-9]{64}$'),
 consumed_at timestamptz,
 primary key(event_key,app_user_id,name_fingerprint)
);
alter table public.kyaa_wave_participation_name_exceptions enable row level security;
alter table public.kyaa_wave_participation_name_exceptions force row level security;
revoke all on public.kyaa_wave_participation_name_exceptions from public,anon,authenticated,service_role;

-- Remove the old overload atomically: omitted fingerprints use the guarded default below.
drop function public.submit_kyaa_wave_participation(uuid,uuid,text,text,text);
create function public.submit_kyaa_wave_participation(p_app_user_id uuid,p_request_id uuid,p_code_hash text,p_payload_hmac text,p_name_encrypted text,p_name_fingerprint text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.kyaa_wave_participation_requests%rowtype; participant public.kyaa_wave_participants%rowtype; config public.kyaa_wave_participation_config%rowtype; quota public.kyaa_wave_participation_attempts%rowtype;
begin
 -- Same first lock as account disable/deletion; no private write can survive erasure.
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_request_id is null or p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' or p_payload_hmac is null or p_payload_hmac !~ '^[a-f0-9]{64}$' or p_name_encrypted is null or length(p_name_encrypted) not between 40 and 1024 or p_name_encrypted !~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$' then
  return jsonb_build_object('error',jsonb_build_object('code','PARTICIPATION_INVALID'));
 end if;
 select * into prior from public.kyaa_wave_participation_requests where app_user_id=p_app_user_id and request_id=p_request_id;
 if found then
  if prior.payload_hmac<>p_payload_hmac then return jsonb_build_object('error',jsonb_build_object('code','PARTICIPATION_IDEMPOTENCY_CONFLICT')); end if;
  return public.read_owned_kyaa_wave_participation(p_app_user_id);
 end if;
 select * into config from public.kyaa_wave_participation_config where event_key='kyaa-wave-2026' for share;
 if not coalesce(config.enabled,false) then return jsonb_build_object('error',jsonb_build_object('code','PARTICIPATION_CLOSED')); end if;
 select * into quota from public.kyaa_wave_participation_attempts where app_user_id=p_app_user_id;
 if found and quota.window_started_at>clock_timestamp()-interval '15 minutes' and quota.attempts>=10 then
  return jsonb_build_object('error',jsonb_build_object('code','PARTICIPATION_RATE_LIMITED'));
 end if;
 insert into public.kyaa_wave_participation_attempts(app_user_id,window_started_at,attempts) values(p_app_user_id,clock_timestamp(),1)
 on conflict(app_user_id) do update set
 attempts=case when kyaa_wave_participation_attempts.window_started_at<=clock_timestamp()-interval '15 minutes' then 1 else kyaa_wave_participation_attempts.attempts+1 end,
 window_started_at=case when kyaa_wave_participation_attempts.window_started_at<=clock_timestamp()-interval '15 minutes' then clock_timestamp() else kyaa_wave_participation_attempts.window_started_at end;
 -- Return errors instead of raising: invalid-code attempts must commit.
 if config.code_hash is distinct from p_code_hash and config.manual_code_hash is distinct from p_code_hash then return jsonb_build_object('error',jsonb_build_object('code','PARTICIPATION_CODE_INVALID')); end if;
 select * into participant from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and app_user_id=p_app_user_id;
 if not found then
  if p_name_fingerprint is null then
   return jsonb_build_object('error',jsonb_build_object('code','PARTICIPATION_REVIEW_REQUIRED'));
  end if;
  if p_name_fingerprint !~ '^[a-f0-9]{64}$' then
   return jsonb_build_object('error',jsonb_build_object('code','PARTICIPATION_INVALID'));
  end if;
  -- The user lock always precedes the event/name lock, including operator exceptions.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kyaa-wave-participation-name:kyaa-wave-2026:'||p_name_fingerprint,0));
  -- Unknown historical names cannot safely be compared; exceptions never bypass backfill.
  if exists(select 1 from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and name_fingerprint is null)
   or (exists(select 1 from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and name_fingerprint=p_name_fingerprint)
    and not exists(select 1 from public.kyaa_wave_participation_name_exceptions where event_key='kyaa-wave-2026' and app_user_id=p_app_user_id and name_fingerprint=p_name_fingerprint and consumed_at is null)) then
   return jsonb_build_object('error',jsonb_build_object('code','PARTICIPATION_REVIEW_REQUIRED'));
  end if;
  insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint) values(p_app_user_id,p_name_encrypted,p_name_fingerprint);
  update public.kyaa_wave_participation_name_exceptions set consumed_at=clock_timestamp()
   where event_key='kyaa-wave-2026' and app_user_id=p_app_user_id and name_fingerprint=p_name_fingerprint and consumed_at is null;
 end if;
 select * into participant from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and app_user_id=p_app_user_id;
 insert into public.kyaa_wave_participation_requests(app_user_id,request_id,payload_hmac,participation_id) values(p_app_user_id,p_request_id,p_payload_hmac,participant.id);
 return jsonb_build_object('participation',jsonb_build_object('id',participant.id,'createdAt',participant.created_at));
end $$;
revoke all on function public.submit_kyaa_wave_participation(uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_kyaa_wave_participation(uuid,uuid,text,text,text,text) to service_role;

create function public.grant_kyaa_wave_participation_name_exception(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_app_user_id uuid,p_name_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare exception_id uuid;
begin
 begin perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
 exception when others then raise exception 'PARTICIPATION_ADMIN_FORBIDDEN' using errcode='42501'; end;
 if p_correlation_id is null or p_name_fingerprint is null or p_name_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'PARTICIPATION_INVALID'; end if;
 perform public.fan_web_lock_active_user(p_app_user_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kyaa-wave-participation-name:kyaa-wave-2026:'||p_name_fingerprint,0));
 if exists(select 1 from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and app_user_id=p_app_user_id)
  or not exists(select 1 from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and name_fingerprint=p_name_fingerprint) then raise exception 'PARTICIPATION_INVALID'; end if;
 insert into public.kyaa_wave_participation_name_exceptions(app_user_id,name_fingerprint) values(p_app_user_id,p_name_fingerprint)
  on conflict(event_key,app_user_id,name_fingerprint) do nothing returning id into exception_id;
 if exception_id is null then raise exception 'PARTICIPATION_IDEMPOTENCY_CONFLICT'; end if;
 insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)
 values(p_actor_app_user_id,p_actor_admin_allowlist_id,'kyaa_wave.participation_name_exception_granted','kyaa_wave_participation_name_exception',exception_id::text,p_correlation_id,jsonb_build_object('eventKey','kyaa-wave-2026','approved',true));
 return jsonb_build_object('approved',true);
end $$;
revoke all on function public.grant_kyaa_wave_participation_name_exception(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.grant_kyaa_wave_participation_name_exception(uuid,uuid,uuid,uuid,text) to service_role;

create or replace function public.scrub_kyaa_wave_participation_on_disable()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='disabled' and old.status is distinct from new.status then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:'||new.id::text,0));
  delete from public.kyaa_wave_draw_requests where actor_id=new.id and operation='preferences';
  delete from public.kyaa_wave_participation_name_exceptions where app_user_id=new.id;
  delete from public.kyaa_wave_participation_requests where app_user_id=new.id;
  delete from public.kyaa_wave_participation_attempts where app_user_id=new.id;
  delete from public.kyaa_wave_participants where app_user_id=new.id;
 end if;
 return new;
end $$;

commit;
