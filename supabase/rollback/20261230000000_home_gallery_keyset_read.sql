-- Rollback for 20261230000000_home_gallery_keyset_read.sql. Roll the web back first (it calls read_public_home_gallery_page).
-- read_public_home_gallery_photos (offset) was not changed and keeps working.
begin;
set local lock_timeout = '5s';
drop function if exists public.read_public_home_gallery_page(public.content_locale, integer, integer, timestamptz, text, integer);
notify pgrst, 'reload schema';
commit;
