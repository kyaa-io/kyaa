-- Run after the web release that supports artist activity notices.
-- The migration runner assumes postgres, which can see the control row under FORCE RLS.
-- To stop new artist activity notices, run as postgres:
--   update public.artist_activity_push_control set inbox_enabled = false where id and inbox_enabled;
-- Existing inbox notices remain after rollback.
do $$
begin
  update public.artist_activity_push_control
  set inbox_enabled = true
  where id and not inbox_enabled;

  if not found and not exists (
    select 1 from public.artist_activity_push_control where id and inbox_enabled
  ) then
    raise exception 'ARTIST_ACTIVITY_INBOX_CONTROL_ROW_MISSING';
  end if;
end;
$$;
