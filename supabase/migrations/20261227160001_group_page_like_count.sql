begin;

-- 팬페이지 머리의 '팬 N'은 홈 크리에이터 랭킹의 누적 좋아요와 같은 숫자여야 한다.
-- 랭킹(home_metric_likes)은 활성 계정이 '좋아요 남기기'로 만든 fan_reactions 행을 센다. 같은 조건으로 likeCount를 더한다.
-- memberCount(가입자 수)와 다른 키는 그대로 둔다. 팬페이지(kind='fan')이고 크리에이터가 연결된 경우에만 키가 있다.
create index fan_reactions_celebrity_idx on public.fan_reactions(celebrity_id);

create or replace function public.group_page_json(p_id uuid, p_locale text default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',g.id,'kind',g.kind,'celebrityId',g.celebrity_id,'slug',c.slug,'name',public.group_page_name(g.id,p_locale),'description',g.description,
 'imageUrl',g.image_url,'question',g.question,'anonymous',g.anonymous,'memberCount',(select count(*) from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active' where m.page_id=g.id),
 'externalLinks',g.external_links)
 || case when g.kind='fan' and g.celebrity_id is not null
    then jsonb_build_object('likeCount',(select count(*) from public.fan_reactions r join public.app_users u on u.id=r.app_user_id and u.status='active' where r.celebrity_id=g.celebrity_id))
    else '{}'::jsonb end
 from public.group_pages g left join public.celebrities c on c.id=g.celebrity_id where g.id=p_id
$$;

commit;
