-- Rollback of 20261219041000_artist_online_favorite_only.sql: the online notice goes to every member of the page again.
-- The SELECT grant and the artist_activity_owner_<role> read policy on fan_profile_public_fields stay (harmless, read only).
-- Notices already written stay.
begin;
set local lock_timeout = '5s';

create or replace function public.artist_activity_recipients(p_page uuid, p_artist uuid, p_kind text, p_after uuid, p_limit integer)
returns table(app_user_id uuid) language sql stable security definer set search_path = '' as $$
  select m.app_user_id from public.group_memberships m
    join public.app_users u on u.id = m.app_user_id and u.status = 'active'
    left join public.notification_preferences p on p.app_user_id = m.app_user_id
    left join public.group_notification_settings s on s.page_id = m.page_id and s.app_user_id = m.app_user_id
  where m.page_id = p_page and m.app_user_id <> p_artist and (p_after is null or m.app_user_id > p_after)
    and coalesce(case p_kind when 'artist_comment' then p.artist_activity_notifications else p.artist_online_notifications end, true)
    and coalesce(s.enabled, true)
    and not exists (select 1 from public.user_blocks k where (k.app_user_id = m.app_user_id and k.blocked_app_user_id = p_artist)
      or (k.app_user_id = p_artist and k.blocked_app_user_id = m.app_user_id))
  order by m.app_user_id
  limit p_limit
$$;

commit;
