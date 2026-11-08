-- '최애 온라인 알림'(artist_online)은 그 페이지의 크리에이터를 최애로 고른 멤버에게만 간다(감독 2026-11-09 05:29, QA-I 6번).
-- 최애는 MY·헤더의 선택 최애와 같은 값 fan_profile_public_fields.favorite_celebrity_id이고, 페이지는 group_pages.celebrity_id로 잇는다.
-- 크리에이터가 없는 페이지(hobby·brand)는 최애로 고를 수 없으므로 받는 사람이 없다. 멤버·활성 계정·알림 설정(artist_online_notifications,
-- 페이지 알림)·차단 조건과 하루 한 번(source_key) 규칙, 문구는 그대로다. 아티스트 댓글 알림(artist_comment)의 수신자는 바뀌지 않는다.
-- 함수 소유자(dev/운영: postgres)가 fan_profile_public_fields를 읽을 수 있게 SELECT를 주고, 소유자가 superuser도 BYPASSRLS도 아니면
-- 그 역할에만 읽기 정책을 둔다(20261216031000과 같은 방식).
-- Rollback: supabase/rollback/20261219041000_artist_online_favorite_only.sql.
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
    -- 20261219041000: the online notice goes only to members whose favorite is this page's creator.
    and (p_kind = 'artist_comment' or exists (select 1 from public.fan_profile_public_fields f
      join public.group_pages g on g.id = m.page_id and g.celebrity_id is not null
      where f.app_user_id = m.app_user_id and f.favorite_celebrity_id = g.celebrity_id))
    and not exists (select 1 from public.user_blocks k where (k.app_user_id = m.app_user_id and k.blocked_app_user_id = p_artist)
      or (k.app_user_id = p_artist and k.blocked_app_user_id = m.app_user_id))
  order by m.app_user_id
  limit p_limit
$$;

do $$
declare me record;
begin
  select r.oid, r.rolname, r.rolsuper, r.rolbypassrls into me from pg_proc p join pg_roles r on r.oid = p.proowner
    where p.oid = 'public.artist_activity_recipients(uuid,uuid,text,uuid,integer)'::regprocedure;
  if me.rolname in ('anon', 'authenticated', 'service_role') then raise exception 'ARTIST_ACTIVITY_UNTRUSTED_OWNER %', me.rolname; end if;
  execute format('grant select on table public.fan_profile_public_fields to %I', me.rolname);
  if not me.rolsuper and not me.rolbypassrls
    and exists (select 1 from pg_class c where c.oid = 'public.fan_profile_public_fields'::regclass and c.relrowsecurity
      and (c.relforcerowsecurity or c.relowner <> me.oid))
    and not exists (select 1 from pg_policy pol where pol.polrelid = 'public.fan_profile_public_fields'::regclass
      and pol.polname = 'artist_activity_owner_' || me.rolname) then
    execute format('create policy %I on public.fan_profile_public_fields for select to %I using (true)', 'artist_activity_owner_' || me.rolname, me.rolname);
  end if;
end $$;

commit;
