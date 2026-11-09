-- Rollback of 20261220022000_home_gallery_shorts_reads.sql. Run after the web rollback. Read-only functions only: no data is lost.
-- Removes only policies named home_n2_owner_%; N1 (home_n1_owner_%) and earlier policies stay.
begin;
set local lock_timeout = '5s';
do $policy$
declare p record;
begin
  for p in select polname, polrelid::regclass rel from pg_catalog.pg_policy where polname like 'home\_n2\_owner\_%' loop
    execute format('drop policy %I on %s', p.polname, p.rel);
  end loop;
end
$policy$;
drop function public.read_public_home_shorts(public.content_locale,integer);
drop function public.read_public_home_gallery_photos(public.content_locale,integer,integer);
drop function public.home_creator_json(uuid,public.content_locale);
drop function public.home_gallery_source_shape(uuid);
drop function public.home_gallery_creator_public(uuid);
notify pgrst, 'reload schema';
commit;
