-- The ranking's per-platform follower line becomes a link to the creator's own account (대표 2026-11-16 20:49). The address is the one the admin already keeps
-- in celebrity_social_links (public on the creator page); only an active, https, sane-length one is returned, otherwise url is null and the line stays plain text.
create or replace function public.read_celebrity_platform_followers(p_slugs text[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(t.slug, t.items), '{}'::jsonb) from (
    select c.slug, jsonb_agg(jsonb_build_object('platform', f.platform, 'count', f.follower_count, 'digits', f.significant_digits, 'text', f.source_text,
      'url', case when s.active and s.url ~ '^https://' and char_length(s.url) <= 2048 then s.url end)
      order by coalesce(s.position, 100), f.platform) as items
    from public.celebrity_platform_followers f
    join public.celebrities c on c.id = f.celebrity_id and c.status = 'published' and c.archived_at is null
    left join public.celebrity_social_links s on s.celebrity_id = f.celebrity_id and s.platform = f.platform
    where c.slug = any (p_slugs)
    group by c.slug
  ) t;
$$;
