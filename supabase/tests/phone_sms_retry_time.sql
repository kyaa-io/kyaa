-- Disposable database: retries reveal only the time and never permit another send early.
do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then
    raise exception 'Phone retry tests require disposable local byus_clean';
  end if;
end $$;
begin;
insert into public.app_users(id,privy_user_id,verified_email) values
 ('92100000-0000-4000-8000-000000000001','did:privy:sms-retry','sms-retry@example.invalid'),
 ('92100000-0000-4000-8000-000000000002','did:privy:sms-retry-peer','sms-retry-peer@example.invalid');

do $$
declare owner_id uuid:='92100000-0000-4000-8000-000000000001';
  phone_key text:=repeat('c',64); response jsonb; details text; retry_at timestamptz;
  base timestamptz:=pg_catalog.now(); index integer; challenge_id uuid;
begin
  response:=public.reserve_owned_phone_sms_challenge(owner_id,
    '92100000-0000-4000-8000-000000000101','92100000-0000-4000-8000-000000000201',
    '01077778888',phone_key,repeat('d',64));
  begin
    perform public.reserve_owned_phone_sms_challenge(owner_id,
      '92100000-0000-4000-8000-000000000102','92100000-0000-4000-8000-000000000202',
      '01077778888',phone_key,repeat('d',64));
    raise exception 'PHONE_RETRY_TEST: cooldown allowed';
  exception when others then
    if sqlerrm<>'PHONE_SMS_COOLDOWN' then raise; end if;
    get stacked diagnostics details=PG_EXCEPTION_DETAIL;
    retry_at:=(details::jsonb->>'retryAt')::timestamptz;
    if retry_at is distinct from base+interval '60 seconds' or (select count(*) from jsonb_object_keys(details::jsonb))<>1 then
      raise exception 'PHONE_RETRY_TEST: invalid cooldown details';
    end if;
  end;
  -- A replay retains the original challenge even during cooldown.
  response:=public.reserve_owned_phone_sms_challenge(owner_id,
    '92100000-0000-4000-8000-000000000102','92100000-0000-4000-8000-000000000201',
    '01077778888',phone_key,repeat('d',64));
  if (response->>'created')::boolean or response->>'challengeId'<>'92100000-0000-4000-8000-000000000101' then
    raise exception 'PHONE_RETRY_TEST: replay changed';
  end if;
  -- Seed earlier reservations; the latest relevant release time wins over cooldown.
  for index in 1..9 loop
    challenge_id:=('92100000-0000-4000-8000-'||lpad((300+index)::text,12,'0'))::uuid;
    insert into public.phone_sms_verification_challenges(id,app_user_id,request_id,phone,phone_rate_key,otp_digest,created_at,expires_at,resend_at)
      values(challenge_id,owner_id,challenge_id,'01077778888',phone_key,repeat('d',64),
        base-index*interval '2 minutes',base-index*interval '2 minutes'+interval '5 minutes',base-index*interval '2 minutes'+interval '60 seconds');
    insert into public.phone_sms_rate_limit_events(challenge_id,app_user_id,phone_rate_key,reserved_at)
      values(challenge_id,owner_id,phone_key,base-index*interval '2 minutes');
  end loop;
  begin
    perform public.reserve_owned_phone_sms_challenge(owner_id,
      '92100000-0000-4000-8000-000000000102','92100000-0000-4000-8000-000000000202',
      '01077778888',phone_key,repeat('d',64));
    raise exception 'PHONE_RETRY_TEST: daily quota allowed';
  exception when others then
    if sqlerrm<>'PHONE_SMS_COOLDOWN' then raise; end if;
    get stacked diagnostics details=PG_EXCEPTION_DETAIL;
    retry_at:=(details::jsonb->>'retryAt')::timestamptz;
    if retry_at is distinct from base+interval '24 hours'-interval '18 minutes' then
      raise exception 'PHONE_RETRY_TEST: strongest quota retry not returned';
    end if;
  end;
  -- The shared phone quota applies to a different owner without revealing identity.
  begin
    perform public.reserve_owned_phone_sms_challenge('92100000-0000-4000-8000-000000000002',
      '92100000-0000-4000-8000-000000000103','92100000-0000-4000-8000-000000000203',
      '01077778888',phone_key,repeat('d',64));
    raise exception 'PHONE_RETRY_TEST: cross-account phone quota allowed';
  exception when others then
    if sqlerrm<>'PHONE_SMS_COOLDOWN' then raise; end if;
    get stacked diagnostics details=PG_EXCEPTION_DETAIL;
    if (details::jsonb->>'retryAt')::timestamptz is distinct from retry_at then
      raise exception 'PHONE_RETRY_TEST: shared quota differs';
    end if;
  end;
  if has_function_privilege('anon','public.reserve_owned_phone_sms_challenge(uuid,uuid,uuid,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.reserve_owned_phone_sms_challenge(uuid,uuid,uuid,text,text,text)','EXECUTE')
    or not has_function_privilege('service_role','public.reserve_owned_phone_sms_challenge(uuid,uuid,uuid,text,text,text)','EXECUTE') then
    raise exception 'PHONE_RETRY_TEST: RPC privilege changed';
  end if;
end $$;
rollback;
select 'Phone SMS retry time, quota, replay and ACL PASS' as result;

update public.fan_notification_delivery_control set mode='enabled',activated_at='-infinity';
\ir kakao_alimtalk.sql
\ir phone_sms_enrollment.sql
