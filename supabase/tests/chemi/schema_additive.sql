-- Run before fixtures: ownership, access and empty tables.
do $$
declare bad text; n bigint; t record; owner text := (select pg_get_userbyid(relowner) from pg_class where oid = 'public.app_users'::regclass);
  service_fns constant text[] := array['chemi_feature_state','chemi_save_birth','chemi_read_profile','chemi_add_partner','chemi_delete_partner',
    'chemi_purge_stale_partners','chemi_withdraw_birth_consent','chemi_begin_account_deletion','chemi_complete_account_deletion'];
begin
  select string_agg(c.relname||':'||pg_get_userbyid(c.relowner), ', ') into bad from pg_class c join pg_namespace s on s.oid=c.relnamespace
    where s.nspname='public' and c.relname like 'chemi\_%' and pg_get_userbyid(c.relowner)<>owner;
  if bad is not null then raise exception '2. owner not %: %', owner, bad; end if;
  select string_agg(p.proname||':'||pg_get_userbyid(p.proowner), ', ') into bad from pg_proc p join pg_namespace s on s.oid=p.pronamespace
    where s.nspname='public' and p.proname like 'chemi\_%' and pg_get_userbyid(p.proowner)<>owner;
  if bad is not null then raise exception '2. function owner not %: %', owner, bad; end if;

  select string_agg(c.relname, ', ') into bad from pg_class c join pg_namespace s on s.oid=c.relnamespace
    where s.nspname='public' and c.relkind='r' and c.relname like 'chemi\_%'
      and (not c.relrowsecurity or exists (select 1 from pg_policy where polrelid=c.oid)
        or has_table_privilege('anon', c.oid, 'select,insert,update,delete') or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete')
        or has_table_privilege('service_role', c.oid, 'select,insert,update,delete')
        or exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where a.grantee = 0));
  if bad is not null then raise exception '3. table access open: %', bad; end if;

  select string_agg(p.oid::regprocedure::text, ', ') into bad from pg_proc p join pg_namespace s on s.oid=p.pronamespace
    where s.nspname='public' and p.proname like 'chemi\_%' and (
      has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
      or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)
      or has_function_privilege('service_role', p.oid, 'execute') <> (p.proname = any(service_fns)));
  if bad is not null then raise exception '4. function grants: %', bad; end if;

  for t in select c.relname from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and c.relname like 'chemi\_%' loop
    execute format('select count(*) from public.%I', t.relname) into n;
    if n > 0 then raise exception '5. % has % seed rows', t.relname, n; end if;
  end loop;
end $$;
