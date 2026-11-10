begin;
-- Fan-board attachments (10 photos or one video) now apply to every published page, not only fan pages.
-- Brand and hobby pages share the same board composer. The Kyaa Wave program page keeps its own upload flow.
-- Same owner, security definer and empty search_path as the original function; create or replace keeps its grants.
create or replace function public.fan_board_media_allowed(p_celebrity uuid)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from public.group_pages g join public.celebrities c on c.id=g.celebrity_id where g.status='published'and c.id=p_celebrity and c.status='published'and c.archived_at is null and c.slug<>'kyaa-wave-fanpage')
$$;
commit;
