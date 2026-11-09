-- Rollback of 20261220032000_b3_cheer.sql (web first: the cheer route calls this function). Cheer rows already paid stay.
begin;
drop function public.cheer_dukjil_favorite(uuid);
notify pgrst, 'reload schema';
commit;
