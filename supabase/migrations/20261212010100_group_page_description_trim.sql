-- A summary's own check measures it trimmed; group_pages.description measures it as it is. A summary of 1000 characters
-- followed by spaces, written by SQL, therefore failed the whole publishing transaction at commit. The CMS already trims on save.
-- Only the page copy changes: the source summary stays as written, and no existing page or grant changes.
-- Revert: supabase/rollback/20261212010100_group_page_description_trim.sql
begin;
set local lock_timeout = '5s';

create or replace function public.group_page_ensure_for_celebrity(p_celebrity uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_page uuid;
begin
 insert into public.group_pages(id,kind,celebrity_id,name,description,image_url)
 select c.id,case when 'brand'::public.celebrity_role=any(c.roles) then 'brand' else 'fan' end,c.id,
  left(coalesce((select l.name from public.celebrity_localizations l where l.celebrity_id=c.id order by (l.locale::text='ko') desc limit 1),c.slug),100),
  left(btrim(coalesce((select l.summary from public.celebrity_localizations l where l.celebrity_id=c.id order by (l.locale::text='ko') desc limit 1),'')),1000),c.image_url
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
