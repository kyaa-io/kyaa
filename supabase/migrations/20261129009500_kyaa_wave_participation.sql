-- Printed event entry only: no RSVP matching, attendance claim or prize issuance.
create table public.kyaa_wave_participation_config (
 event_key text primary key check(event_key='kyaa-wave-2026'),
 code_hash text check(code_hash ~ '^[a-f0-9]{64}$'),
 enabled boolean not null default false,
 check(not enabled or code_hash is not null)
);
insert into public.kyaa_wave_participation_config(event_key) values('kyaa-wave-2026');
create table public.kyaa_wave_participants (
 id uuid primary key default extensions.gen_random_uuid(),
 event_key text not null default 'kyaa-wave-2026' references public.kyaa_wave_participation_config(event_key),
 app_user_id uuid not null references public.app_users(id) on delete cascade,
 name_encrypted text not null check(length(name_encrypted) between 40 and 1024 and name_encrypted ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'),
 created_at timestamptz not null default clock_timestamp(),
 unique(event_key,app_user_id)
);
create index kyaa_wave_participants_page_idx on public.kyaa_wave_participants(created_at desc,id desc);
create table public.kyaa_wave_participation_requests (
 app_user_id uuid not null references public.app_users(id) on delete cascade,
 request_id uuid not null,
 payload_hmac text not null check(payload_hmac ~ '^[a-f0-9]{64}$'),
 participation_id uuid not null references public.kyaa_wave_participants(id) on delete cascade,
 primary key(app_user_id,request_id)
);
create table public.kyaa_wave_participation_attempts (
 app_user_id uuid primary key references public.app_users(id) on delete cascade,
 window_started_at timestamptz not null,
 attempts integer not null check(attempts between 1 and 10)
);

create function public.read_owned_kyaa_wave_participation(p_app_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 select jsonb_build_object('id',id,'createdAt',created_at) into result from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and app_user_id=p_app_user_id;
 return jsonb_build_object('participation',result);
end $$;

create function public.submit_kyaa_wave_participation(p_app_user_id uuid,p_request_id uuid,p_code_hash text,p_payload_hmac text,p_name_encrypted text)
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
 if config.code_hash<>p_code_hash then return jsonb_build_object('error',jsonb_build_object('code','PARTICIPATION_CODE_INVALID')); end if;
 insert into public.kyaa_wave_participants(app_user_id,name_encrypted) values(p_app_user_id,p_name_encrypted) on conflict(event_key,app_user_id) do nothing;
 select * into participant from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and app_user_id=p_app_user_id;
 insert into public.kyaa_wave_participation_requests(app_user_id,request_id,payload_hmac,participation_id) values(p_app_user_id,p_request_id,p_payload_hmac,participant.id);
 return jsonb_build_object('participation',jsonb_build_object('id',participant.id,'createdAt',participant.created_at));
end $$;

create function public.list_admin_kyaa_wave_participants(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_before_at timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 begin perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
 exception when others then raise exception 'PARTICIPATION_ADMIN_FORBIDDEN' using errcode='42501'; end;
 if (p_before_at is null)<>(p_before_id is null) then raise exception 'PARTICIPATION_INVALID'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'appUserId',p.app_user_id,'nameEncrypted',p.name_encrypted,'createdAt',p.created_at) order by p.created_at desc,p.id desc)
 from (select * from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and (p_before_at is null or (created_at,id)<(p_before_at,p_before_id)) order by created_at desc,id desc limit 51) p),'[]'::jsonb);
end $$;

create function public.scrub_kyaa_wave_participation_on_disable()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='disabled' and old.status is distinct from new.status then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:'||new.id::text,0));
  delete from public.kyaa_wave_participation_requests where app_user_id=new.id;
  delete from public.kyaa_wave_participation_attempts where app_user_id=new.id;
  delete from public.kyaa_wave_participants where app_user_id=new.id;
 end if;
 return new;
end $$;
create trigger app_users_scrub_kyaa_wave_on_disable after update of status on public.app_users for each row execute function public.scrub_kyaa_wave_participation_on_disable();

alter table public.kyaa_wave_participation_config enable row level security;
alter table public.kyaa_wave_participation_config force row level security;
alter table public.kyaa_wave_participants enable row level security;
alter table public.kyaa_wave_participants force row level security;
alter table public.kyaa_wave_participation_requests enable row level security;
alter table public.kyaa_wave_participation_requests force row level security;
alter table public.kyaa_wave_participation_attempts enable row level security;
alter table public.kyaa_wave_participation_attempts force row level security;
revoke all on public.kyaa_wave_participation_config,public.kyaa_wave_participants,public.kyaa_wave_participation_requests,public.kyaa_wave_participation_attempts from public,anon,authenticated,service_role;
revoke all on function public.scrub_kyaa_wave_participation_on_disable(),public.read_owned_kyaa_wave_participation(uuid),public.submit_kyaa_wave_participation(uuid,uuid,text,text,text),public.list_admin_kyaa_wave_participants(uuid,uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_owned_kyaa_wave_participation(uuid),public.submit_kyaa_wave_participation(uuid,uuid,text,text,text),public.list_admin_kyaa_wave_participants(uuid,uuid,timestamptz,uuid) to service_role;
