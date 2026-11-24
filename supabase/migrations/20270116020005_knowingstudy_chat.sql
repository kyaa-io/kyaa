begin;
create or replace function public.group_ensure_default_rooms(p_page uuid)
returns void language sql security definer set search_path='' as $$
 insert into public.group_rooms(page_id,default_key,name,minimum_tier)
 select g.id,v.key,v.name,v.tier from public.group_pages g
 cross join (values ('artist','아티스트 소통방','Bronze'),('certified','인증팬 소통방','Bronze'),('free','자유 소통방',null)) v(key,name,tier)
 where g.id=p_page and g.kind='fan'
 on conflict(page_id,default_key) where default_key is not null do nothing;
 insert into public.group_rooms(page_id,default_key,name,minimum_tier,minimum_stage_key)
 select g.id,'chat','채팅방','Member',null from public.group_pages g
 where g.id=p_page and (g.kind='fan' or (g.kind='brand' and exists(select 1 from public.celebrities c where c.id=g.celebrity_id and c.slug='knowingstudy')))
 on conflict(page_id,default_key) where default_key is not null do nothing;
$$;

create or replace function public.group_chat_gate(p_actor uuid, p_page uuid) returns text
language sql stable security definer set search_path='' as $$
 select case
  when g.id is null or (g.kind<>'fan' and not (g.kind='brand' and exists(select 1 from public.celebrities c where c.id=g.celebrity_id and c.slug='knowingstudy'))) or g.status<>'published' or not public.group_scope_visible(p_actor,g.id) then 'not_found'
  when not exists(select 1 from public.app_users u where u.id=p_actor and u.status='active') then 'not_verified'
  when g.kind='brand' then case when exists(select 1 from public.group_memberships m where m.page_id=g.id and m.app_user_id=p_actor) then 'ok' else 'not_verified' end
  when exists(select 1 from public.group_artist_bindings b where b.page_id=g.id and b.app_user_id=p_actor) then 'ok'
  when exists(select 1 from public.fan_passports p where p.app_user_id=p_actor and p.celebrity_id=g.celebrity_id and p.business_status='issued') then 'ok'
  else 'not_verified' end
 from (select 1) one left join public.group_pages g on g.id=p_page
$$;
commit;
