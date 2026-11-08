-- Rollback of 20261216030000_artist_activity_notification_kinds. Run after the 20261216031000 rollback.
-- PostgreSQL cannot drop an enum value in place. The two values stay in public.notification_kind unused; this only checks
-- that no notice still uses them.
do $$
begin
  if exists (select 1 from public.fan_notifications where kind::text in ('artist_comment', 'artist_online')) then
    raise exception 'ARTIST_ACTIVITY_NOTICES_REMAIN: roll back 20261216031000 first';
  end if;
end $$;
