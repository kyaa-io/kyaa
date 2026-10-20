begin;

-- Keep already printed QR codes valid while issuing the shorter manual code.
alter table public.kyaa_wave_participation_config
 add column manual_code_hash text check(manual_code_hash ~ '^[a-f0-9]{64}$');

create or replace function public.submit_kyaa_wave_participation(p_app_user_id uuid,p_request_id uuid,p_code_hash text,p_payload_hmac text,p_name_encrypted text)
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
 insert into public.kyaa_wave_participants(app_user_id,name_encrypted) values(p_app_user_id,p_name_encrypted) on conflict(event_key,app_user_id) do nothing;
 select * into participant from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and app_user_id=p_app_user_id;
 insert into public.kyaa_wave_participation_requests(app_user_id,request_id,payload_hmac,participation_id) values(p_app_user_id,p_request_id,p_payload_hmac,participant.id);
 return jsonb_build_object('participation',jsonb_build_object('id',participant.id,'createdAt',participant.created_at));
end $$;


commit;
