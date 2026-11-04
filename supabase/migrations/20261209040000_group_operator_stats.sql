begin;
-- 운영자 통계 요약. 이미 쌓이는 group_pages / group_memberships / group_posts / group_visits만 읽는다.
-- 방문자 수는 팬 화면의 오늘 방문 수와 같이 활성 회원만 세고 아티스트 연결 계정은 뺀다.
-- 합계와 일별 방문자 수만 돌려주고 회원 식별자는 내지 않는다. owner·manager만 읽는다.
create or replace function public.read_group_operator_stats(p_actor uuid,p_page_id uuid,p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_role text; v_today date:=(now() at time zone 'Asia/Seoul')::date; v_from date; v_since timestamptz; result jsonb;
begin
 if p_days is null or p_days not in (7,30) then raise exception 'GROUP_STATS_INVALID';end if;
 if p_actor is null or p_page_id is null then raise exception 'GROUP_STATS_FORBIDDEN';end if;
 select m.role into v_role from public.group_memberships m where m.page_id=p_page_id and m.app_user_id=p_actor;
 if v_role is null or v_role not in ('owner','manager') then raise exception 'GROUP_STATS_FORBIDDEN';end if;
 v_from:=v_today-(p_days-1); v_since:=(v_from::timestamp at time zone 'Asia/Seoul');
 select jsonb_build_object(
  'days',p_days,'from',v_from,'to',v_today,
  'members',(select count(*) from public.group_memberships where page_id=p_page_id),
  'joinedInPeriod',(select count(*) from public.group_memberships where page_id=p_page_id and joined_at>=v_since),
  'posts',(select count(*) from public.group_posts where page_id=p_page_id and removed_at is null),
  'postsInPeriod',(select count(*) from public.group_posts where page_id=p_page_id and removed_at is null and created_at>=v_since),
  'notices',(select count(*) from public.group_posts where page_id=p_page_id and removed_at is null and category='notice'),
  'visitors',(select count(distinct v.app_user_id) from public.group_visits v join public.app_users u on u.id=v.app_user_id and u.status='active' where v.page_id=p_page_id and v.day>=v_from and v.day<=v_today and not exists(select 1 from public.group_artist_bindings b where b.page_id=v.page_id and b.app_user_id=v.app_user_id)),
  'visitDays',(select count(*) from public.group_visits v join public.app_users u on u.id=v.app_user_id and u.status='active' where v.page_id=p_page_id and v.day>=v_from and v.day<=v_today and not exists(select 1 from public.group_artist_bindings b where b.page_id=v.page_id and b.app_user_id=v.app_user_id)),
  'daily',(select jsonb_agg(jsonb_build_object('day',d.day,'visitors',coalesce(v.n,0)) order by d.day)
           from generate_series(v_from,v_today,interval '1 day') as g(ts)
           cross join lateral (select g.ts::date as day) d
           left join (select v.day,count(*) n from public.group_visits v join public.app_users u on u.id=v.app_user_id and u.status='active' where v.page_id=p_page_id and v.day>=v_from and v.day<=v_today and not exists(select 1 from public.group_artist_bindings b where b.page_id=v.page_id and b.app_user_id=v.app_user_id) group by v.day) v on v.day=d.day)
 ) into result;
 return result;
end $$;
revoke all on function public.read_group_operator_stats(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.read_group_operator_stats(uuid,uuid,integer) to service_role;
commit;
