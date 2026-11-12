do $$ declare violations text; begin
 select string_agg(c.relname,', ' order by c.relname) into violations from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity;
 if violations is not null then raise exception 'RLS disabled: %',violations; end if;
 select string_agg(p.oid::regprocedure::text,', ' order by p.proname) into violations from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.proname ~ '(roll|draw|raffle|bundle|capsule|claim)' and p.prosrc ~* '\mrandom\s*\(';
 if violations is not null then raise exception 'Insecure random: %',violations; end if;
end $$;
-- The worker role bypasses RLS; definers retain the same owner as their tables.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls) then raise exception 'service_role must bypass RLS'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_class c
 where n.nspname='public' and p.prosecdef and c.oid in ('public.mobile_app_settings'::regclass,'public.mobile_installations'::regclass,'public.mobile_installation_requests'::regclass,'public.mobile_push_delivery_outbox'::regclass)
 and p.prosrc like '%'||c.relname||'%' and p.proowner<>c.relowner
 and not exists(select 1 from pg_roles r where r.oid=p.proowner and (r.rolsuper or r.rolbypassrls))) then raise exception 'Mobile definer owner cannot bypass RLS'; end if;
end $$;
