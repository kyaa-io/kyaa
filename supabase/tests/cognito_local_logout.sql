begin;
create function pg_temp.logout_assert(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
do $$
declare key text:=repeat('a',64); other_key text:=repeat('b',64); expiry timestamptz:=now()+interval '30 days'; n integer;
begin
  perform public.write_cognito_browser_session(key,'encrypted-session',expiry);
  perform public.logout_cognito_browser_session(key,array['logout-origin','logout-jti'],'logout-client','encrypted-refresh',expiry);
  perform pg_temp.logout_assert(not exists(select 1 from public.cognito_browser_sessions where token_hash=key),'session deleted');
  perform pg_temp.logout_assert((select count(*)=2 from public.revoked_cognito_token_families where token_id in ('logout-origin','logout-jti') and expires_at>=expiry),'family blocked for remaining refresh lifetime');
  select count(*) into n from public.pending_cognito_remote_revocations('logout-client');
  perform pg_temp.logout_assert(n=1,'durable remote work exists before HTTP request');
  select count(*) into n from public.pending_cognito_remote_revocations('logout-client');
  perform pg_temp.logout_assert(n=0,'parallel retry waits for the bounded retry lease');
  perform public.finish_cognito_remote_revocation(key,'http_503');
  perform pg_temp.logout_assert(exists(select 1 from public.cognito_remote_revocations where token_hash=key and last_error='http_503' and attempts=1 and encrypted_refresh_token='encrypted-refresh'),'503 retains retry payload');
  begin
    perform public.write_cognito_browser_session(key,'late-refresh',expiry);
    raise exception 'late refresh resurrected logout';
  exception when sqlstate '55000' then null; end;
  perform public.finish_cognito_remote_revocation(key,null);
  perform pg_temp.logout_assert(exists(select 1 from public.cognito_remote_revocations where token_hash=key and encrypted_refresh_token is null and completed_at is not null),'successful retry erases credentials');
  begin
    perform public.write_cognito_browser_session(key,'later-refresh',expiry);
    raise exception 'completed revoke lost local tombstone';
  exception when sqlstate '55000' then null; end;
  perform public.logout_cognito_browser_session(key,array['logout-origin'],'logout-client','duplicate',expiry);
  perform pg_temp.logout_assert((select attempts=2 from public.cognito_remote_revocations where token_hash=key),'repeated logout is idempotent');
  perform public.write_cognito_browser_session(other_key,'keep-on-error',expiry);
  begin
    perform public.logout_cognito_browser_session(other_key,null,'logout-client','encrypted',expiry);
    raise exception 'invalid revocation accepted';
  exception when others then
    if sqlerrm='invalid revocation accepted' then raise; end if;
  end;
  begin
    perform public.logout_cognito_browser_session(other_key,array['invalid-null-refresh'],'logout-client',null,expiry);
    raise exception 'missing retry credential accepted';
  exception when others then
    if sqlerrm='missing retry credential accepted' then raise; end if;
  end;
  perform pg_temp.logout_assert(exists(select 1 from public.cognito_browser_sessions where token_hash=other_key),'failed revocation rolls back local deletion');
  perform pg_temp.logout_assert(not exists(select 1 from public.cognito_remote_revocations where token_hash=other_key),'failed transaction leaves no partial work');
  perform pg_temp.logout_assert(not has_table_privilege('anon','public.cognito_remote_revocations','SELECT'),'anon cannot read encrypted credentials');
  perform pg_temp.logout_assert(not has_function_privilege('authenticated','public.pending_cognito_remote_revocations(text)','EXECUTE'),'members cannot read retry work');
  perform pg_temp.logout_assert(has_function_privilege('service_role','public.logout_cognito_browser_session(text,text[],text,text,timestamptz)','EXECUTE'),'service role can log out');
end $$;
rollback;
