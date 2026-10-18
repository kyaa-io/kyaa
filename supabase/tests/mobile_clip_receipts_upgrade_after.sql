do $$ declare snapshot record; receipt jsonb; begin
  select * into strict snapshot from public.clip_receipt_upgrade_snapshot;
  if not exists(select 1 from public.fan_clips c where c.id=snapshot.id and not c.first_stamp_eligible and c.write_reward is null
    and c.create_request_hash=snapshot.create_request_hash and c.body=snapshot.body and c.idempotency_key=snapshot.idempotency_key) then raise exception 'legacy clip changed or became stamp-eligible';end if;
  if exists(select 1 from public.community_stamps where app_user_id=snapshot.app_user_id and kind='first_clip') then raise exception 'legacy clip stamp backfilled';end if;
  receipt:=public.read_owned_mobile_clip_result(snapshot.app_user_id,'clip-upgrade',snapshot.idempotency_key);
  if receipt->'reward'<>snapshot.original_result->'reward' or receipt#>>'{reward,ticketAmount}'<>'3'
    or receipt->>'id'<>snapshot.id::text then raise exception 'legacy ticket award lost: %',receipt;end if;
  if (select count(*) from public.mobile_content_clip_reward_awards where app_user_id=snapshot.app_user_id)<>1 then raise exception 'legacy award changed';end if;
end $$;
