-- Reverts 20261213010000_passport_issuance_joins_fan_page.sql. Backfilled and trigger-written membership rows stay: they cannot be told from
-- rows made by the old join button, and removing them would take the board away from fans who already wrote there.
begin;
set local lock_timeout = '5s';
drop trigger if exists fan_passport_join_page on public.fan_passports;
create or replace function public.groups_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.groups_dispatch_before_artist_mark(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 if p_operation='members' and jsonb_typeof(result->'items')='array' then
  result:=jsonb_set(result,'{items}',public.group_artist_mark_items(p_page_id,result->'items'));
 end if;
 return result;
end $$;
drop function if exists public.group_passport_membership_guard(text,uuid,uuid);
drop function if exists public.fan_passport_join_page_trigger();
drop function if exists public.group_join_passport_page(uuid);
commit;
