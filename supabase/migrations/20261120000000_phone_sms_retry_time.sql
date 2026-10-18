-- Preserve enrollment locks, quotas and idempotency while returning a safe retry time.
create or replace function public.reserve_owned_phone_sms_challenge(
  p_app_user_id uuid,p_challenge_id uuid,p_request_id uuid,p_phone text,
  p_phone_rate_key text,p_otp_digest text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.phone_sms_verification_challenges%rowtype; now_at timestamptz:=pg_catalog.now();
  retry_at timestamptz; limit_at timestamptz; limit_code text;
begin
  if p_app_user_id is null or p_challenge_id is null or p_request_id is null
    or p_phone!~'^010[0-9]{8}$' or p_phone_rate_key!~'^[a-f0-9]{64}$'
    or p_otp_digest!~'^[a-f0-9]{64}$' then raise exception 'PHONE_SMS_REQUEST_INVALID'; end if;

  -- The only global SMS lock path always precedes the existing owner-row lock.
  perform pg_catalog.pg_advisory_xact_lock(7142,100);
  perform public.lock_kakao_notification_owner(p_app_user_id);

  select * into existing from public.phone_sms_verification_challenges
    where app_user_id=p_app_user_id and request_id=p_request_id for update;
  if found then
    if existing.phone_rate_key<>p_phone_rate_key
      or (existing.phone is not null and existing.phone<>p_phone) then
      raise exception 'PHONE_SMS_REQUEST_ID_COLLISION';
    end if;
    return jsonb_build_object('challengeId',existing.id,'destinationLabel',
      coalesce(public.phone_sms_mask(existing.phone),'010-****-****'),
      'expiresAt',existing.expires_at,'resendAt',existing.resend_at,
      'status',existing.send_status,'created',false);
  end if;
  if exists(select 1 from public.phone_sms_verification_challenges where id=p_challenge_id) then
    raise exception 'PHONE_SMS_CHALLENGE_ID_COLLISION';
  end if;
  select max(reserved_at)+interval '60 seconds' into retry_at
    from public.phone_sms_rate_limit_events
    where reserved_at>now_at-interval '60 seconds'
      and (app_user_id=p_app_user_id or phone_rate_key=p_phone_rate_key);
  if retry_at is not null then limit_code:='PHONE_SMS_COOLDOWN'; end if;

  -- Wait until every applicable quota has room; expose only the retry time.
  select greatest(
    (select reserved_at+interval '10 minutes' from public.phone_sms_rate_limit_events
      where app_user_id=p_app_user_id and reserved_at>now_at-interval '10 minutes'
      order by reserved_at desc offset 2 limit 1),
    (select reserved_at+interval '10 minutes' from public.phone_sms_rate_limit_events
      where phone_rate_key=p_phone_rate_key and reserved_at>now_at-interval '10 minutes'
      order by reserved_at desc offset 2 limit 1)) into limit_at;
  if limit_at is not null then
    retry_at:=greatest(retry_at,limit_at);
    limit_code:=coalesce(limit_code,'PHONE_SMS_RATE_LIMIT_10_MIN');
  end if;
  select greatest(
    (select reserved_at+interval '24 hours' from public.phone_sms_rate_limit_events
      where app_user_id=p_app_user_id and reserved_at>now_at-interval '24 hours'
      order by reserved_at desc offset 9 limit 1),
    (select reserved_at+interval '24 hours' from public.phone_sms_rate_limit_events
      where phone_rate_key=p_phone_rate_key and reserved_at>now_at-interval '24 hours'
      order by reserved_at desc offset 9 limit 1)) into limit_at;
  if limit_at is not null then
    retry_at:=greatest(retry_at,limit_at);
    limit_code:=coalesce(limit_code,'PHONE_SMS_RATE_LIMIT_24_HOUR');
  end if;
  select reserved_at+interval '24 hours' into limit_at
    from public.phone_sms_rate_limit_events
    where reserved_at>now_at-interval '24 hours'
    order by reserved_at desc offset 99 limit 1;
  if limit_at is not null then
    retry_at:=greatest(retry_at,limit_at);
    limit_code:=coalesce(limit_code,'PHONE_SMS_GLOBAL_BUDGET');
  end if;
  if retry_at is not null then
    raise exception using message=limit_code,
      detail=jsonb_build_object('retryAt',retry_at)::text;
  end if;

  update public.phone_sms_verification_challenges set cancelled_at=now_at,phone=null,otp_digest=null
    where app_user_id=p_app_user_id and consumed_at is null and cancelled_at is null and expired_at is null;
  insert into public.phone_sms_verification_challenges(
    id,app_user_id,request_id,phone,phone_rate_key,otp_digest,created_at,expires_at,resend_at)
  values(p_challenge_id,p_app_user_id,p_request_id,p_phone,p_phone_rate_key,p_otp_digest,
    now_at,now_at+interval '5 minutes',now_at+interval '60 seconds');
  insert into public.phone_sms_rate_limit_events(challenge_id,app_user_id,phone_rate_key,reserved_at)
    values(p_challenge_id,p_app_user_id,p_phone_rate_key,now_at);
  return jsonb_build_object('challengeId',p_challenge_id,'destinationLabel',public.phone_sms_mask(p_phone),
    'expiresAt',now_at+interval '5 minutes','resendAt',now_at+interval '60 seconds',
    'status','reserved','created',true);
end $$;

