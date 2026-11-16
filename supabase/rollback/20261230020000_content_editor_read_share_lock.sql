-- Rollback for 20261230020000_content_editor_read_share_lock.sql: restores require_content_editor of 20260721083000.
-- Read-only calls lock the actor row FOR UPDATE again, so overlapping reads by one administrator queue. Nothing else is touched.
begin;
set local lock_timeout = '5s';

create or replace function public.require_content_editor(p_actor uuid, p_mutation boolean default false)
returns public.admin_allowlist
language plpgsql security definer set search_path = '' as $$
declare actor public.admin_allowlist%rowtype;
begin
  select * into actor from public.admin_allowlist a
  where a.id = p_actor and a.active
    and (not p_mutation or a.role in ('admin','operator'))
  for update;
  if not found then raise exception 'active authorized content administrator required'; end if;
  return actor;
end $$;

revoke all on function public.require_content_editor(uuid,boolean) from public,anon,authenticated;

commit;
