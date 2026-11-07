-- 20261212080000 replaced read_jjinfan_challenge in place, so the function kept its owner while the new table belongs to the applying role.
-- Where those differ, as on dev (function postgres, table byus_admin), every public gauge read answers permission denied.
-- The owner gets select on the four columns the function reads and nothing else. An owner bound by row security reads enabled rows only,
-- so an administrator's draft wording stays out of its sight. Same data, same answers.
--
-- Rollback: supabase/rollback/20261212081000_jjinfan_campaign_read_owner.sql
begin;
set local lock_timeout = '5s';

do $$
declare reader record;
begin
 select o.rolname,o.rolsuper,o.rolbypassrls,pg_has_role(o.oid,c.relowner,'USAGE') as acts_as_table_owner into reader
  from pg_proc p join pg_roles o on o.oid=p.proowner cross join pg_class c
  where p.oid='public.read_jjinfan_challenge(uuid)'::regprocedure and c.oid='public.jjinfan_challenge_campaigns'::regclass;
 if reader.rolsuper or reader.acts_as_table_owner then return; end if;
 execute format('grant select (celebrity_id,enabled,title,description) on public.jjinfan_challenge_campaigns to %I',reader.rolname);
 if not reader.rolbypassrls then
  execute format('drop policy if exists %I on public.jjinfan_challenge_campaigns','jjinfan_campaign_read_owner_'||reader.rolname);
  execute format('create policy %I on public.jjinfan_challenge_campaigns for select to %I using (enabled)','jjinfan_campaign_read_owner_'||reader.rolname,reader.rolname);
 end if;
 if not (has_column_privilege(reader.rolname,'public.jjinfan_challenge_campaigns','celebrity_id','select')
  and has_column_privilege(reader.rolname,'public.jjinfan_challenge_campaigns','enabled','select')
  and has_column_privilege(reader.rolname,'public.jjinfan_challenge_campaigns','title','select')
  and has_column_privilege(reader.rolname,'public.jjinfan_challenge_campaigns','description','select')) then
  raise exception 'JJINFAN_CAMPAIGN_READ_PRIVILEGE_MISSING: %',reader.rolname;
 end if;
end $$;

commit;
