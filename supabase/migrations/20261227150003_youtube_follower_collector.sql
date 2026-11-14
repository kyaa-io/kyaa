-- Collector writes only the currently active official YouTube channel. Manual rows win.
create function public.save_collected_youtube_followers(p_celebrity uuid, p_source_url text, p_count bigint, p_checked_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_count is null or p_count < 0 or p_checked_at is null then
    raise exception 'invalid collected follower count';
  end if;
  perform 1 from public.celebrities where id = p_celebrity and archived_at is null for update;
  if not found or not exists (
    select 1 from public.celebrity_social_links s where s.celebrity_id = p_celebrity
      and s.platform = 'youtube' and s.active and s.url = p_source_url
  ) then return false; end if;
  insert into public.celebrity_platform_followers
    (celebrity_id, platform, follower_count, significant_digits, source_kind, source_url, checked_at)
  values (p_celebrity, 'youtube', p_count, 3, 'collector', p_source_url, p_checked_at)
  on conflict (celebrity_id, platform) do update set
    follower_count = excluded.follower_count, significant_digits = 3,
    source_text = null, source_kind = 'collector', source_url = excluded.source_url,
    entered_by = null, checked_at = excluded.checked_at, updated_at = now()
  where public.celebrity_platform_followers.source_kind = 'collector'
    and public.celebrity_platform_followers.checked_at <= excluded.checked_at;
  return found;
end $$;
revoke all on function public.save_collected_youtube_followers(uuid,text,bigint,timestamptz) from public, anon, authenticated;
grant execute on function public.save_collected_youtube_followers(uuid,text,bigint,timestamptz) to service_role;
