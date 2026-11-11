-- CREATE OR REPLACE preserves the legacy SECURITY DEFINER owner on imported RDS schemas.
do $$
declare writer_owner text;
begin
  select pg_get_userbyid(proowner) into strict writer_owner from pg_proc
    where oid='public.write_cognito_browser_session(text,text,timestamptz)'::regprocedure;
  drop policy if exists cognito_session_writer_read on public.cognito_remote_revocations;
  execute format('create policy cognito_session_writer_read on public.cognito_remote_revocations for select to %I using (true)',writer_owner);
  execute format('grant select on public.cognito_remote_revocations to %I',writer_owner);
end $$;
