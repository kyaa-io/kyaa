begin;
-- Deploy the previous web first. Brand and hobby boards go back to 4 photos and no video.
-- Existing brand posts stay stored. Their videos stop playing on public screens and editing a post that keeps a video or 5-10 photos is refused;
-- signed-in media reads (authorize_mobile_media_read) still follow the post's own visibility.
create or replace function public.fan_board_media_allowed(p_celebrity uuid)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from public.group_pages g join public.celebrities c on c.id=g.celebrity_id where g.kind='fan'and g.status='published'and c.id=p_celebrity and c.status='published'and c.archived_at is null and c.slug<>'kyaa-wave-fanpage')
$$;
commit;
