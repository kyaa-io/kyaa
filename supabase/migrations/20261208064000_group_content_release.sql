begin;
-- UI rollback must restore legacy content eligibility without changing wallet state.
create table public.group_content_release (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default true
);
insert into public.group_content_release(singleton)values(true);
alter table public.group_content_release enable row level security;
alter table public.group_content_release force row level security;
revoke all on public.group_content_release from public,anon,authenticated,service_role;
do $$declare owner_name name;begin
 execute format('create policy group_content_release_operator on public.group_content_release to %I using(true) with check(true)',current_user);
 for owner_name in select distinct pg_get_userbyid(proowner) from pg_proc
 where oid in('public.fan_web_is_page_member(uuid,uuid)'::regprocedure,'public.require_group_content_member(uuid,uuid)'::regprocedure)loop
  if owner_name in('anon','authenticated','service_role')then raise exception 'Unexpected content definer owner';end if;
  execute format('grant select on public.group_content_release to %I',owner_name);
  execute format('create policy %I on public.group_content_release for select to %I using(true)','group_content_release_'||owner_name,owner_name);
 end loop;
end $$;

create or replace function public.fan_web_is_page_member(p_app_user_id uuid,p_celebrity_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when not exists(select 1 from public.group_content_release where singleton and not enabled)
 and exists(select 1 from public.group_pages where celebrity_id=p_celebrity_id)
 then exists(select 1 from public.group_memberships m join public.group_pages g on g.id=m.page_id join public.app_users u on u.id=m.app_user_id and u.status='active'
  where m.app_user_id=p_app_user_id and g.celebrity_id=p_celebrity_id and public.group_scope_visible(p_app_user_id,g.id))
 else public.fan_web_is_member(p_app_user_id,p_celebrity_id)end
$$;
create or replace function public.require_group_content_member(p_actor uuid,p_celebrity uuid)
returns void language plpgsql security definer set search_path='' as $$
declare page uuid;
begin
 if exists(select 1 from public.group_content_release where singleton and not enabled)then return;end if;
 select id into page from public.group_pages where celebrity_id=p_celebrity;
 if page is null then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('groups-page:'||page::text,0));
 if not public.fan_web_is_page_member(p_actor,p_celebrity)then raise exception 'FAN_WEB_FORBIDDEN' using errcode='42501';end if;
end $$;
commit;
