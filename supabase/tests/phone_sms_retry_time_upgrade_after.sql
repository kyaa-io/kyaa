do $$ declare response jsonb; details text; begin
 response:=public.reserve_owned_phone_sms_challenge('92100000-0000-4000-8000-000000000901',
  '92100000-0000-4000-8000-000000000904','92100000-0000-4000-8000-000000000903',
  '01099990000',repeat('9',64),repeat('8',64));
 if response->>'challengeId'<>'92100000-0000-4000-8000-000000000902' or (response->>'created')::boolean then
  raise exception 'PHONE_RETRY_UPGRADE: original challenge changed';
 end if;
 begin
  perform public.reserve_owned_phone_sms_challenge('92100000-0000-4000-8000-000000000901',
   '92100000-0000-4000-8000-000000000904','92100000-0000-4000-8000-000000000905',
   '01099990000',repeat('9',64),repeat('8',64));
  raise exception 'PHONE_RETRY_UPGRADE: old quota lost';
 exception when others then
  if sqlerrm<>'PHONE_SMS_COOLDOWN' then raise; end if;
  get stacked diagnostics details=PG_EXCEPTION_DETAIL;
  if (details::jsonb->>'retryAt')::timestamptz is distinct from (response->>'resendAt')::timestamptz then
   raise exception 'PHONE_RETRY_UPGRADE: old retry time lost';
  end if;
 end;
end $$;
-- Preserve the fixture for assertions without consuming the global quota budget.
update public.phone_sms_rate_limit_events set reserved_at=reserved_at-interval '2 days'
 where app_user_id='92100000-0000-4000-8000-000000000901';
