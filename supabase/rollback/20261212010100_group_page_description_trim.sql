-- Rollback for 20261212010100_group_page_description_trim.sql.
-- Returns the function of 20261212010000. Pages already created keep their trimmed description.
-- After this, a summary written by SQL with 1000 characters and trailing spaces fails publishing again.
begin;
set local lock_timeout = '5s';

create or replace function public.group_page_ensure_for_celebrity(p_celebrity uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_page uuid;
begin
 insert into public.group_pages(id,kind,celebrity_id,name,description,image_url)
 select c.id,case when 'brand'::public.celebrity_role=any(c.roles) then 'brand' else 'fan' end,c.id,
  left(coalesce((select l.name from public.celebrity_localizations l where l.celebrity_id=c.id order by (l.locale::text='ko') desc limit 1),c.slug),100),
  coalesce((select l.summary from public.celebrity_localizations l where l.celebrity_id=c.id order by (l.locale::text='ko') desc limit 1),''),c.image_url
 from public.celebrities c where c.id=p_celebrity and c.status='published' and c.archived_at is null
 on conflict do nothing returning id into v_page;
 if v_page is null then return; end if;
 insert into public.group_memberships(page_id,app_user_id,joined_at)
 select v_page,p.app_user_id,p.issued_at from public.fan_passports p join public.app_users u on u.id=p.app_user_id and u.status='active'
 where p.celebrity_id=p_celebrity and p.business_status='issued'
 on conflict(page_id,app_user_id) do nothing;
end $$;

revoke all on function public.group_page_ensure_for_celebrity(uuid) from public,anon,authenticated,service_role;

commit;
