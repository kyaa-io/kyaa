-- RANK-ROW-1112 (사용자 11/12 12:35): the opened fan row on the home ranking shows totals of the fan's activity: attendance days and published posts.
--   attendance days  distinct check-in dates of the fan, across the shared wallet's attendance and the per-creator attendance (a date counted once).
--   posts            the fan's public posts that are still visible: fan_posts (not deleted, not hidden) and group_posts (not removed, not anonymous). Members-only posts are left out.
-- Both are read live, like tickets. read_home_fan_ranking_v3 gets two keys per row (attendanceDays, posts); nothing else about the list changes.
-- Order: database first, then web (an older web ignores the keys). Rollback: supabase/rollback/20261224000400_home_ranking_fan_activity_totals.sql
begin;
set local lock_timeout = '5s';

create or replace function public.home_ranking_fan_activity(p_app_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'attendanceDays', (select pg_catalog.count(*) from (
        select a.attendance_date from public.group_wallet_attendance a where a.app_user_id = p_app_user_id
        union
        select c.attendance_date from public.group_creator_attendance c where c.app_user_id = p_app_user_id) d),
    'posts', (select pg_catalog.count(*) from public.fan_posts p where p.app_user_id = p_app_user_id and p.visibility = 'public' and p.deleted_at is null and p.hidden_at is null)
           + (select pg_catalog.count(*) from public.group_posts g where g.author_id = p_app_user_id and g.visibility = 'public' and g.removed_at is null and not g.anonymous))
$$;
revoke all on function public.home_ranking_fan_activity(uuid) from public, anon, authenticated;
grant execute on function public.home_ranking_fan_activity(uuid) to service_role;

do $patch$
declare def text; owner_name text;
  old_text constant text := $a$'tickets', public.home_ranking_ticket_balance(v.subject_id), 'tier', v.tier,$a$;
  new_text constant text := $b$'tickets', public.home_ranking_ticket_balance(v.subject_id), 'tier', v.tier,
      'attendanceDays', (public.home_ranking_fan_activity(v.subject_id) ->> 'attendanceDays')::integer, 'posts', (public.home_ranking_fan_activity(v.subject_id) ->> 'posts')::integer,$b$;
begin
  select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid = 'public.read_home_fan_ranking_v3(uuid,text,integer)'::regprocedure;
  if owner_name in ('anon','authenticated','service_role') or not pg_catalog.pg_has_role(current_user, owner_name, 'USAGE') then
    raise exception 'RANK_ROW_OWNER_GAP: cannot replace read_home_fan_ranking_v3 owned by %', owner_name;
  end if;
  def := pg_catalog.pg_get_functiondef('public.read_home_fan_ranking_v3(uuid,text,integer)'::regprocedure);
  if position('home_ranking_fan_activity' in def) = 0 then
    if (length(def) - length(replace(def, old_text, ''))) / length(old_text) <> 1 then raise exception 'RANK_ROW_SHAPE: read_home_fan_ranking_v3'; end if;
    execute replace(def, old_text, new_text);
  end if;
end $patch$;
commit;

notify pgrst, 'reload schema';
