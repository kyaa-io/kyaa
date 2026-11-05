begin;
set local lock_timeout = '5s';

-- The three default rooms (artist, certified fans, free) used to be created lazily
-- the first time a member opened the room list. A page nobody had opened yet, or a
-- list opened by a non-member, showed an empty room list. Create them with the page
-- and backfill every existing fan page. Names and tiers match
-- 20261208085000_group_default_rooms.sql. Safe to run more than once.
create or replace function public.group_ensure_default_rooms(p_page uuid)
returns void language sql security definer set search_path='' as $$
 insert into public.group_rooms(page_id,default_key,name,minimum_tier)
 select g.id,v.key,v.name,v.tier from public.group_pages g
 cross join (values ('artist','아티스트 소통방','Bronze'),('certified','인증팬 소통방','Bronze'),('free','자유 소통방',null)) v(key,name,tier)
 where g.id=p_page and g.kind='fan'
 on conflict(page_id,default_key) where default_key is not null do nothing
$$;

create or replace function public.group_pages_default_rooms_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.group_ensure_default_rooms(new.id);
 return new;
end $$;

drop trigger if exists group_pages_default_rooms on public.group_pages;
create trigger group_pages_default_rooms after insert on public.group_pages
 for each row execute function public.group_pages_default_rooms_trigger();

select public.group_ensure_default_rooms(id) from public.group_pages where kind='fan';

revoke all on function public.group_ensure_default_rooms(uuid),public.group_pages_default_rooms_trigger() from public,anon,authenticated,service_role;
commit;
