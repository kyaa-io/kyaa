-- Preserve the deployed function and its CAS/lease checks; only shorten pacing.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.begin_telegram_alert_send(uuid,text)'::regprocedure);
  if position('next_send_at=t+interval ''60 seconds''' in definition) = 0 then
    raise exception 'TELEGRAM_ALERT_INTERVAL_BASE_CHANGED';
  end if;
  execute replace(definition, 'next_send_at=t+interval ''60 seconds''', 'next_send_at=t+interval ''3 seconds''');
end $$;
