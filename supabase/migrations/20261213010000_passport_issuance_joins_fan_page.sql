-- A passport issued after 20261201000000 filled group_memberships once never got a row, so a verified fan was refused the board,
-- comments and rooms of the fan page and shown a join button (feedback 18, 22). Passing the entry check is now the join: the
-- transaction that issues the passport writes the membership. A fan page no longer takes a join without a passport, and a passport
-- holder cannot leave it. Hobby and brand pages keep their join button.
-- Unchanged: Wave (check-in is its entrance and it writes no membership row), group_scope_visible, account status, blocks, anonymous
-- pages, content moderation, every point rule (a membership row pays nothing). Rows of members without a passport stay: they are a
-- decision for the operator, not for a migration.
--
-- Revert: supabase/rollback/20261213010000_passport_issuance_joins_fan_page.sql
begin;
set local lock_timeout = '5s';

-- Fail before anything depends on it if the applying role, which will own the new functions, cannot write these forced row security tables.
do $$ declare v_page uuid; begin
 begin
  insert into public.group_pages(kind,name,status) values('hobby','passport join write probe','hidden') returning id into v_page;
  insert into public.group_memberships(page_id,app_user_id) select v_page,u.id from public.app_users u limit 1;
  raise exception 'PASSPORT_JOIN_WRITE_PROBE_OK';
 exception when raise_exception then
  if sqlerrm<>'PASSPORT_JOIN_WRITE_PROBE_OK' then raise; end if;
 end;
end $$;

create or replace function public.group_join_passport_page(p_celebrity uuid)
returns uuid language sql stable security definer set search_path='' as $$
 select g.id from public.group_pages g join public.celebrities c on c.id=g.celebrity_id
 where g.celebrity_id=p_celebrity and g.kind='fan' and c.slug<>'kyaa-wave-fanpage'
$$;

create or replace function public.fan_passport_join_page_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.group_memberships(page_id,app_user_id,joined_at)
 select public.group_join_passport_page(new.celebrity_id),u.id,coalesce(new.issued_at,now())
 from public.app_users u
 where u.id=new.app_user_id and u.status='active' and public.group_join_passport_page(new.celebrity_id) is not null
 on conflict(page_id,app_user_id) do nothing;
 return null;
end $$;

-- Raises for the two moves R1 takes away; every other request goes on to groups_dispatch unchanged. A page the viewer cannot see stays the dispatcher's 404.
create or replace function public.group_passport_membership_guard(p_operation text,p_actor uuid,p_page uuid)
returns void language plpgsql stable security definer set search_path='' as $$
declare v_celebrity uuid; v_holds boolean;
begin
 if p_actor is null or p_page is null then return; end if;
 select g.celebrity_id into v_celebrity from public.group_pages g where g.id=p_page;
 if v_celebrity is null or public.group_join_passport_page(v_celebrity) is distinct from p_page or not public.group_scope_visible(p_actor,p_page) then return; end if;
 v_holds:=exists(select 1 from public.fan_passports p where p.app_user_id=p_actor and p.celebrity_id=v_celebrity and p.business_status='issued');
 if p_operation='join' and not v_holds
    and not exists(select 1 from public.group_memberships m where m.page_id=p_page and m.app_user_id=p_actor)
    and not exists(select 1 from public.group_artist_bindings b where b.page_id=p_page and b.app_user_id=p_actor) then
  raise exception 'GROUPS_FORBIDDEN:passport_required';
 end if;
 if p_operation='leave' and v_holds then raise exception 'GROUPS_CONFLICT'; end if;
end $$;

revoke all on function public.group_join_passport_page(uuid),public.fan_passport_join_page_trigger(),public.group_passport_membership_guard(text,uuid,uuid) from public,anon,authenticated,service_role;

-- groups_dispatch keeps its owner through create or replace, and on dev that owner may not be the applying role. It needs only this one grant.
do $$
declare dispatch_owner name; trigger_owner name:=current_user;
begin
 select pg_get_userbyid(proowner) into dispatch_owner from pg_proc where oid='public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure;
 execute format('grant execute on function public.group_passport_membership_guard(text,uuid,uuid) to %I',dispatch_owner);
 if not has_function_privilege(dispatch_owner,'public.group_passport_membership_guard(text,uuid,uuid)','execute') then raise exception 'PASSPORT_JOIN_GUARD_PRIVILEGE_MISSING: %',dispatch_owner; end if;
 if not has_table_privilege(trigger_owner,'public.fan_passports','select') or not has_table_privilege(trigger_owner,'public.group_memberships','insert')
    or not has_table_privilege(trigger_owner,'public.group_artist_bindings','select') or not has_table_privilege(trigger_owner,'public.celebrities','select') or not has_table_privilege(trigger_owner,'public.app_users','select')
    or not has_function_privilege(trigger_owner,'public.group_scope_visible(uuid,uuid)','execute') then
  raise exception 'PASSPORT_JOIN_PRIVILEGE_MISSING: %',trigger_owner;
 end if;
end $$;

create or replace function public.groups_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_operation in('join','leave') then perform public.group_passport_membership_guard(p_operation,p_actor,p_page_id); end if;
 result:=public.groups_dispatch_before_artist_mark(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 if p_operation='members' and jsonb_typeof(result->'items')='array' then
  result:=jsonb_set(result,'{items}',public.group_artist_mark_items(p_page_id,result->'items'));
 end if;
 return result;
end $$;

-- business_status has only the value 'issued' (its check constraint), so insert is the one moment a passport is issued.
drop trigger if exists fan_passport_join_page on public.fan_passports;
create trigger fan_passport_join_page after insert on public.fan_passports
for each row execute function public.fan_passport_join_page_trigger();

-- Existing holders. Idempotent: a second run inserts nothing. Same reads as the trigger.
insert into public.group_memberships(page_id,app_user_id,joined_at)
select public.group_join_passport_page(p.celebrity_id),p.app_user_id,coalesce(p.issued_at,now())
from public.fan_passports p join public.app_users u on u.id=p.app_user_id and u.status='active'
where p.business_status='issued' and public.group_join_passport_page(p.celebrity_id) is not null
on conflict(page_id,app_user_id) do nothing;

-- A role that reads no row of these tables would leave the gap silently, so a gap fails the migration.
do $$ declare v_gap bigint; v_holders bigint; begin
 select count(*) into v_gap from public.fan_passports p join public.app_users u on u.id=p.app_user_id and u.status='active'
  where p.business_status='issued' and public.group_join_passport_page(p.celebrity_id) is not null
  and not exists(select 1 from public.group_memberships m where m.page_id=public.group_join_passport_page(p.celebrity_id) and m.app_user_id=p.app_user_id);
 select count(*) into v_holders from public.fan_passports where business_status='issued';
 raise notice 'passport join backfill: issued passports %, gap after backfill %',v_holders,v_gap;
 if v_gap<>0 then raise exception 'PASSPORT_JOIN_BACKFILL_GAP: %',v_gap; end if;
end $$;

commit;
