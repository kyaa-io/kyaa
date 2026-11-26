-- Sign-in with X (Privy twitter_oauth): login_started / login_result events carry provider 'twitter'.
begin;
set local lock_timeout = '5s';

do $patch$
declare
  old_body text := pg_get_functiondef('public.record_product_event_v1(smallint,text,uuid,text,uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb)'::regprocedure);
  body text;
begin
  body := replace(old_body, '''google'',''apple'',''email'',''test'',''unknown''', '''google'',''apple'',''email'',''twitter'',''test'',''unknown''');
  if body = old_body then raise exception 'Missing login provider list'; end if;
  execute body;
end $patch$;
commit;
