begin;
create role cognito_legacy_writer_fixture nologin nosuperuser;
grant usage on schema public to cognito_legacy_writer_fixture;
alter table public.cognito_browser_sessions owner to cognito_legacy_writer_fixture;
alter function public.write_cognito_browser_session(text,text,timestamptz) owner to cognito_legacy_writer_fixture;
-- Reproduce an imported function owned by a different non-superuser than the new table.
do $$
begin
  begin
    perform public.write_cognito_browser_session(repeat('e',64),'fixture',now()+interval '1 day');
    raise exception 'expected missing table permission';
  exception when insufficient_privilege then null; end;
end $$;
\ir ../migrations/20261224000200_cognito_logout_owner_access.sql
set local role service_role;
select public.write_cognito_browser_session(repeat('e',64),'fixture',now()+interval '1 day');
reset role;
select public.logout_cognito_browser_session(repeat('e',64),array['owner-test-origin'],'client','encrypted',now()+interval '1 day');
do $$
begin
  begin
    perform public.write_cognito_browser_session(repeat('e',64),'late-refresh',now()+interval '1 day');
    raise exception 'tombstone invisible to legacy owner';
  exception when sqlstate '55000' then null; end;
end $$;
do $$
begin
  if exists(select 1 from public.cognito_browser_sessions where token_hash=repeat('e',64)) then raise exception 'session resurrected'; end if;
  if has_table_privilege('authenticated','public.cognito_remote_revocations','SELECT') or has_table_privilege('anon','public.cognito_remote_revocations','SELECT') then raise exception 'private revocations exposed'; end if;
  if has_table_privilege('cognito_legacy_writer_fixture','public.cognito_remote_revocations','UPDATE') then raise exception 'unnecessary write privilege'; end if;
end $$;
rollback;
