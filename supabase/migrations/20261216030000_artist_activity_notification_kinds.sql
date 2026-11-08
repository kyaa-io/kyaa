-- Runs alone: 20261216031000 uses these values, and an enum value cannot be used in the transaction that adds it.
alter type public.notification_kind add value if not exists 'artist_comment';
alter type public.notification_kind add value if not exists 'artist_online';
notify pgrst, 'reload schema';
