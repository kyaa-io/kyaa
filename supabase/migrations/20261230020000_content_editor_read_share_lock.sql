-- ADMIN-LOCK-1117: require_content_editor(p_actor, false) locks the actor row FOR SHARE instead of FOR UPDATE.
-- Two read-only CMS calls by the same administrator no longer queue behind each other on the actor row.
-- FOR SHARE still blocks UPDATE/DELETE of the actor row, so a revocation waits for running reads and later reads see it.
-- p_mutation = true keeps FOR UPDATE, so writes by the same administrator stay serialized and wait for running reads.
-- FOR SHARE is still a row lock: callers must stay VOLATILE (see content-editor-rpc-volatility.contract.test.ts).
-- create or replace keeps the existing ACL (revoked from public, anon, authenticated in 20260721083000), so no GRANT/REVOKE is restated here.
-- Rollback: supabase/rollback/20261230020000_content_editor_read_share_lock.sql
begin;
set local lock_timeout = '5s';

create or replace function public.require_content_editor(p_actor uuid, p_mutation boolean default false)
returns public.admin_allowlist
language plpgsql security definer set search_path = '' as $$
declare actor public.admin_allowlist%rowtype;
begin
  if p_mutation then
    select * into actor from public.admin_allowlist a
    where a.id = p_actor and a.active and a.role in ('admin','operator')
    for update;
  else
    select * into actor from public.admin_allowlist a
    where a.id = p_actor and a.active
    for share;
  end if;
  if not found then raise exception 'active authorized content administrator required'; end if;
  return actor;
end $$;

commit;
