-- Rollback for 20261212081000_jjinfan_campaign_read_owner.sql. No data changes.
-- Where the function and table owners differ, public gauge reads answer permission denied again. Run this before rolling back 20261212080000.
begin;
set local lock_timeout = '5s';

do $$
declare reader record;
begin
 select o.rolname,o.rolsuper,pg_has_role(o.oid,c.relowner,'USAGE') as acts_as_table_owner into reader
  from pg_proc p join pg_roles o on o.oid=p.proowner cross join pg_class c
  where p.oid='public.read_jjinfan_challenge(uuid)'::regprocedure and c.oid='public.jjinfan_challenge_campaigns'::regclass;
 if reader.rolsuper or reader.acts_as_table_owner then return; end if;
 execute format('drop policy if exists %I on public.jjinfan_challenge_campaigns','jjinfan_campaign_read_owner_'||reader.rolname);
 execute format('revoke select (celebrity_id,enabled,title,description) on public.jjinfan_challenge_campaigns from %I',reader.rolname);
end $$;

commit;
