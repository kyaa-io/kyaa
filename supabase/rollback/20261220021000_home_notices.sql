-- Rollback of 20261220021000_home_notices.sql. Run after the web rollback. Stops if any home notice exists, so no notice is lost.
-- Removes only policies named home_n1_owner_% on existing tables; the new tables take their own policies with them.
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from public.home_notices) then raise exception 'HOME_NOTICES_ROLLBACK_HAS_ROWS'; end if;
end $$;
do $policy$
declare p record;
begin
  for p in select polname, polrelid::regclass rel from pg_catalog.pg_policy
            where polrelid = 'public.audit_logs'::regclass and polname like 'home\_n1\_owner\_%' loop
    execute format('drop policy %I on %s', p.polname, p.rel);
  end loop;
end
$policy$;
drop function public.read_public_home_notice(public.content_locale,text);
drop function public.read_public_home_notices(public.content_locale,boolean,timestamptz,uuid,integer);
drop function public.list_admin_home_notices(uuid,uuid);
drop function public.set_admin_home_notice_state(uuid,uuid,uuid,uuid,integer,text,text);
drop function public.save_admin_home_notice(uuid,uuid,uuid,uuid,integer,text,text,boolean,text,jsonb,text,jsonb);
drop table public.home_notice_localizations;
drop table public.home_notices;
drop function public.validate_home_notice_publication();
drop function public.assert_home_notice_publishable(uuid);
notify pgrst, 'reload schema';
commit;
