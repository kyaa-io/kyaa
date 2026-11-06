-- The directory reads group_pages, which was filled once by 20261201000000_groups_core.sql. A creator published after
-- that never got a page and stayed out of the directory. Every published creator now gets a page when its publishing
-- transaction commits, so localizations written after the creator row in that transaction still name the page.
-- Same shape as the original backfill. Visibility stays with group_scope_visible: nothing here reveals a hidden page,
-- changes the event page gate, or changes an existing page. No new verification is issued.
--
-- Revert: drop trigger group_pages_follow_celebrity on public.celebrities;
--         drop function public.group_pages_follow_celebrity_trigger(); drop function public.group_page_ensure_for_celebrity(uuid);
--         Backfilled pages stay. They carry their celebrity id, so they can be hidden with status='hidden' if needed.
begin;
set local lock_timeout = '5s';

-- Fail here, before any publish depends on it, if the applying role cannot write these forced row security tables.
-- Nothing stays: the block below always ends in a rollback of its own writes.
do $$ declare v_page uuid; begin
 begin
  insert into public.group_pages(kind,name,status) values('hobby','group_pages write probe','hidden') returning id into v_page;
  insert into public.group_memberships(page_id,app_user_id) select v_page,u.id from public.app_users u limit 1;
  raise exception 'GROUP_PAGES_WRITE_PROBE_OK';
 exception when raise_exception then
  if sqlerrm<>'GROUP_PAGES_WRITE_PROBE_OK' then raise; end if;
 end;
end $$;

create function public.group_page_ensure_for_celebrity(p_celebrity uuid)
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

create function public.group_pages_follow_celebrity_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.group_page_ensure_for_celebrity(new.id);
 return null;
end $$;

revoke all on function public.group_page_ensure_for_celebrity(uuid),public.group_pages_follow_celebrity_trigger() from public,anon,authenticated,service_role;

create constraint trigger group_pages_follow_celebrity
after insert or update of status,archived_at on public.celebrities
deferrable initially deferred for each row
when (new.status='published' and new.archived_at is null)
execute function public.group_pages_follow_celebrity_trigger();

select public.group_page_ensure_for_celebrity(c.id) from public.celebrities c
where c.status='published' and c.archived_at is null and not exists(select 1 from public.group_pages g where g.celebrity_id=c.id);

-- A role that reads no row of these tables would leave the gap silently, so a gap fails the migration.
do $$ begin
 if exists(select 1 from public.celebrities c where c.status='published' and c.archived_at is null and not exists(select 1 from public.group_pages g where g.celebrity_id=c.id)) then raise exception 'GROUP_PAGES_BACKFILL_GAP'; end if;
end $$;

commit;
