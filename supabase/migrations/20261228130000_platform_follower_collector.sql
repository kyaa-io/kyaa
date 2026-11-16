-- Weekly Instagram/TikTok follower counts read from the official profile screen by the SNS collector.
-- Same rules as save_collected_youtube_followers: only the creator's currently active official link, manual rows win,
-- an older reading never replaces a newer one. p_text keeps the screen's own wording ("428.3만") when the count is rounded.
create function public.save_collected_platform_followers(
  p_celebrity uuid, p_platform text, p_source_url text, p_count bigint, p_digits smallint, p_text text, p_checked_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_platform is null or p_platform not in ('instagram', 'tiktok') then raise exception 'invalid collected follower platform'; end if;
  if p_count is null or p_count < 0 or p_checked_at is null
    or (p_digits is not null and p_digits not between 1 and 6)
    or (p_text is not null and char_length(p_text) not between 1 and 40) then
    raise exception 'invalid collected follower count';
  end if;
  perform 1 from public.celebrities where id = p_celebrity and archived_at is null for update;
  if not found or not exists (
    select 1 from public.celebrity_social_links s where s.celebrity_id = p_celebrity
      and s.platform::text = p_platform and s.active and s.url = p_source_url
  ) then return false; end if;
  insert into public.celebrity_platform_followers
    (celebrity_id, platform, follower_count, significant_digits, source_text, source_kind, source_url, checked_at)
  values (p_celebrity, p_platform::public.social_platform, p_count, p_digits, p_text, 'collector', p_source_url, p_checked_at)
  on conflict (celebrity_id, platform) do update set
    follower_count = excluded.follower_count, significant_digits = excluded.significant_digits,
    source_text = excluded.source_text, source_kind = 'collector', source_url = excluded.source_url,
    entered_by = null, checked_at = excluded.checked_at, updated_at = now()
  where public.celebrity_platform_followers.source_kind = 'collector'
    and public.celebrity_platform_followers.checked_at <= excluded.checked_at;
  return found;
end $$;
revoke all on function public.save_collected_platform_followers(uuid,text,text,bigint,smallint,text,timestamptz) from public, anon, authenticated;
grant execute on function public.save_collected_platform_followers(uuid,text,text,bigint,smallint,text,timestamptz) to service_role;
