-- 261107-2 F5-3: the 덕질 history showed "출석체크 +2P" three times on one day with nothing telling the rows apart. They are check-ins on
--   three different pages (attend_creator: one per user, page and day, unique), but the ledger row carries no page
--   (group_wallet_post has no celebrity argument, so mobile_fan_economy_ledger.celebrity_id stays null for a check-in grant).
-- Read-only change: read_owned_group_wallet_history also returns
--   pageName  the published fan page name (group_pages kind 'fan', oldest first, as artist_activity_fan_post_comment_source picks it)
--             of the check-in's creator, for a 'dukjil_action' row whose source is the owner's group_creator_attendance row; null otherwise.
--   No ledger row, amount or posting logic changes. Same signature, so the owner and the service_role-only grant are kept (restated below).
-- Roles (as 20261216040000): group_pages is under FORCE row security. If the function owner has neither superuser nor BYPASSRLS it gets
--   select on group_pages and one select policy for itself. Probe: supabase/tests/wallet_history_checkin_page_nonsuper.sh.
-- Rollback: supabase/rollback/20261216050000_wallet_history_checkin_page.sql.
begin;
set local lock_timeout = '5s';

create or replace function public.read_owned_group_wallet_history(p_app_user_id uuid, p_limit integer default 30) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.group_wallet_lock(p_app_user_id, false);
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'GROUP_WALLET_INVALID'; end if;
  select jsonb_build_object('entries', coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id, 'asset', x.asset, 'amount', x.amount, 'sourceType', x.source_type, 'sourceId', x.source_id,
      'celebrityId', x.celebrity_id, 'createdAt', x.created_at,
      'actionKey', x.action_key, 'correctionReason', x.correction_reason, 'pageName', x.page_name) order by x.created_at desc, x.id), '[]')) into result
  from (
    select e.id, e.asset, e.amount, e.source_type, e.source_id, e.celebrity_id, e.created_at,
      case e.source_type
        when 'dukjil_action' then coalesce(l.action_key, case when a.id is not null then 'checkin' end)
        when 'dukjil_proof' then 'proof'
        when 'dukjil_correction' then case when c.attendance_id is not null then 'checkin' else cl.action_key end
      end as action_key,
      case when e.source_type = 'dukjil_correction'
        then case when c.void_reason in ('content_deleted', 'content_hidden') then c.void_reason else 'other' end
      end as correction_reason,
      page.name as page_name
    from (
      select * from (
        select id, asset, amount, source_type, source_id, celebrity_id, created_at from public.mobile_fan_economy_ledger
          where app_user_id = p_app_user_id and asset in ('fan_point', 'support_voucher')
        union all
        select id, 'ticket', amount, source_type, source_id, celebrity_id, created_at from public.fan_ticket_ledger where app_user_id = p_app_user_id
      ) all_entries order by created_at desc, id limit p_limit
    ) e
    left join public.dukjil_action_log l on e.source_type = 'dukjil_action' and l.id = e.source_id and l.app_user_id = p_app_user_id
    left join public.group_creator_attendance a on e.source_type = 'dukjil_action' and l.id is null and a.id = e.source_id and a.app_user_id = p_app_user_id
    left join lateral (
      select g.name from public.group_pages g
      where g.celebrity_id = a.celebrity_id and g.kind = 'fan' and g.status = 'published'
      order by g.created_at, g.id limit 1
    ) page on a.id is not null
    left join public.dukjil_point_corrections c on e.source_type = 'dukjil_correction' and c.id = e.source_id and c.app_user_id = p_app_user_id
    left join public.dukjil_action_log cl on cl.id = c.action_log_id and cl.app_user_id = p_app_user_id
  ) x;
  return result;
end $$;
revoke all on function public.read_owned_group_wallet_history(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.read_owned_group_wallet_history(uuid, integer) to service_role;

do $$
declare me record;
begin
  select r.oid, r.rolname, r.rolsuper, r.rolbypassrls into me from pg_proc p join pg_roles r on r.oid = p.proowner
    where p.oid = 'public.read_owned_group_wallet_history(uuid,integer)'::regprocedure;
  if not pg_catalog.has_table_privilege(me.rolname, 'public.group_pages', 'select') then
    begin
      execute format('grant select on table public.group_pages to %I', me.rolname);
    exception when insufficient_privilege then
      raise exception 'WALLET_HISTORY_PAGE_GRANT: the applying role cannot let % read group_pages', me.rolname;
    end;
  end if;
  if not me.rolsuper and not me.rolbypassrls
    and exists (select 1 from pg_class c where c.oid = 'public.group_pages'::regclass and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> me.oid))
    and not exists (select 1 from pg_policy pol where pol.polrelid = 'public.group_pages'::regclass and pol.polname = 'wallet_history_owner_' || me.rolname) then
    execute format('create policy %I on public.group_pages for select to %I using (true)', 'wallet_history_owner_' || me.rolname, me.rolname);
  end if;
end $$;
commit;
notify pgrst, 'reload schema';
