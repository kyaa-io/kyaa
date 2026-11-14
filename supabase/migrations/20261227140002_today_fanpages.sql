-- 모임 맨 위 '오늘의 팬페이지'(대표 2026-11-14 02:07): 커뮤니티 활동량이 많은 팬페이지를 고르는 읽기 전용 함수.
-- 대상: 발행된(보관 안 된) 크리에이터의 공개 목록 팬페이지(group_pages.kind='fan'·published·listed)만.
--   같은 크리에이터에 취미·브랜드·숨긴 페이지가 하나라도 있으면 뺀다(브랜드 페이지도 celebrity_id를 가진다).
--   기간 안에 글이 1개 이상 있어야 한다(글 없는 페이지가 '게시글 0'으로 걸리지 않게).
-- 기간: 오늘(KST) 0시 직전까지 7일 → 대상이 없으면 30일 → 그래도 없으면 오늘 0시 이전 전체. 하루 동안 결과가 같다.
-- 점수: 글 5 + 미션 3 + 댓글 2 + 좋아요 1 + 참여한 팬 1명당 4. 한 사람의 하루 몫은 글 3·댓글 10·좋아요 20·미션 10까지.
-- 같은 점수면 참여한 팬 수, 그다음 크리에이터 id. 활동한 계정은 status='active'만 센다.
create or replace function public.read_today_fanpages(p_locale public.content_locale default 'ko', p_limit integer default 3)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with bounds as (
    select (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') as day_start
  ), pages as (
    select c.id celebrity_id, gp.id page_id
    from public.celebrities c
    join public.group_pages gp on gp.celebrity_id = c.id and gp.kind = 'fan' and gp.status = 'published' and gp.listed
    where c.status = 'published' and c.archived_at is null
      and not exists (select 1 from public.group_pages o where o.celebrity_id = c.id and (o.kind <> 'fan' or o.status <> 'published' or not o.listed))
  ), events as (
    select pg.celebrity_id, 'post'::text kind, p.app_user_id user_id, p.created_at
    from pages pg join public.fan_posts p on p.celebrity_id = pg.celebrity_id
    where p.deleted_at is null and p.hidden_at is null and p.category is distinct from 'proof'
    union all
    select pg.celebrity_id, 'post', p.author_id, p.created_at
    from pages pg join public.group_posts p on p.page_id = pg.page_id
    where p.removed_at is null and p.category <> 'notice'
    union all
    select pg.celebrity_id, 'comment', m.app_user_id, m.created_at
    from pages pg join public.fan_posts p on p.celebrity_id = pg.celebrity_id and p.deleted_at is null and p.hidden_at is null
    join public.fan_post_comments m on m.post_id = p.id and m.deleted_at is null and m.hidden_at is null
    union all
    select pg.celebrity_id, 'comment', m.author_id, m.created_at
    from pages pg join public.group_posts p on p.page_id = pg.page_id and p.removed_at is null
    join public.group_comments m on m.post_id = p.id and m.removed_at is null
    union all
    select pg.celebrity_id, 'like', l.app_user_id, l.created_at
    from pages pg join public.fan_posts p on p.celebrity_id = pg.celebrity_id and p.deleted_at is null and p.hidden_at is null
    join public.fan_post_likes l on l.post_id = p.id
    union all
    select pg.celebrity_id, 'like', r.app_user_id, r.created_at
    from pages pg join public.group_posts p on p.page_id = pg.page_id and p.removed_at is null
    join public.group_post_reactions r on r.post_id = p.id
    -- 미션: 덕질 기록 중 글·댓글·반응을 뺀 것(퀴즈·인증·미션·라이브 출석·설문·초대). 지급 한도에 걸린 기록은 세지 않는다.
    union all
    select pg.celebrity_id, 'mission', d.app_user_id, d.created_at
    from pages pg join public.dukjil_action_log d on d.celebrity_id = pg.celebrity_id
    where d.action_key not in ('post', 'comment', 'reaction') and not d.capped
  ), live as (
    select e.* from events e
    join public.app_users u on u.id = e.user_id and u.status = 'active'
    where e.created_at < (select day_start from bounds)
  ), windows as (
    select * from (values (7, 1), (30, 2), (null::integer, 3)) w(days, step)
  ), daily as (
    select w.step, w.days, l.celebrity_id, l.kind, l.user_id, (l.created_at at time zone 'Asia/Seoul')::date kst_day,
      least(count(*), case l.kind when 'post' then 3 when 'comment' then 10 when 'like' then 20 else 10 end) n
    from windows w join live l on w.days is null or l.created_at >= (select day_start from bounds) - make_interval(days => w.days)
    group by 1, 2, 3, 4, 5, 6
  ), scored as (
    select step, days, celebrity_id,
      coalesce(sum(n) filter (where kind = 'post'), 0)::integer posts,
      coalesce(sum(n) filter (where kind = 'comment'), 0)::integer comments,
      coalesce(sum(n) filter (where kind = 'like'), 0)::integer likes,
      coalesce(sum(n) filter (where kind = 'mission'), 0)::integer missions,
      count(distinct user_id)::integer fans
    from daily group by 1, 2, 3
  ), eligible as (
    select s.*, 5 * posts + 3 * missions + 2 * comments + likes + 4 * fans score
    from scored s where s.posts > 0
  ), chosen as (
    select * from eligible where step = (select min(step) from eligible)
    order by score desc, fans desc, celebrity_id
    limit greatest(least(p_limit, 10), 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'slug', c.slug,
      'name', (select l.name from public.celebrity_localizations l where l.celebrity_id = c.id order by (l.locale = p_locale) desc, (l.locale = 'ko') desc limit 1),
      'periodDays', p.days, 'score', p.score,
      'posts', p.posts, 'comments', p.comments, 'likes', p.likes, 'missions', p.missions, 'fans', p.fans)
    order by p.score desc, p.fans desc, p.celebrity_id), '[]'::jsonb)
  from chosen p join public.celebrities c on c.id = p.celebrity_id;
$function$;

revoke all on function public.read_today_fanpages(public.content_locale, integer) from public, anon, authenticated, service_role;
grant execute on function public.read_today_fanpages(public.content_locale, integer) to service_role;
notify pgrst, 'reload schema';
