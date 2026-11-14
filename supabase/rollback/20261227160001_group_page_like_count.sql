begin;
-- group_page_json을 20261227102001_group_external_links.sql의 정의로 되돌린다(likeCount 키 제거).
create or replace function public.group_page_json(p_id uuid, p_locale text default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',g.id,'kind',g.kind,'celebrityId',g.celebrity_id,'slug',c.slug,'name',public.group_page_name(g.id,p_locale),'description',g.description,
 'imageUrl',g.image_url,'question',g.question,'anonymous',g.anonymous,'memberCount',(select count(*) from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active' where m.page_id=g.id),
 'externalLinks',g.external_links)
 from public.group_pages g left join public.celebrities c on c.id=g.celebrity_id where g.id=p_id
$$;
drop index if exists public.fan_reactions_celebrity_idx;
commit;
