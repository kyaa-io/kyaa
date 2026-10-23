-- Target RDS only. Real AWS Scheduler/Lambda ownership must be verified separately.
-- No replacement health value or successful no-op is installed.
begin;
do $target$
declare target record; incoming integer;
begin
 if exists(select from pg_namespace where nspname in('auth','cron','net','vault')) then
   raise exception 'Supabase operation retirement is target-only';
 end if;
 for target in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.oid in(to_regprocedure('public.configure_byus_queue_maintenance(text,text)'),to_regprocedure('public.configure_byus_worker_invocation(text,text,text)'),to_regprocedure('public.get_infrastructure_health()')) loop
   select count(*) into incoming from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.oid<>target.oid and p.prosrc ~ ('\m'||target.proname||'\s*\(');
   if incoming<>0 then raise exception 'A public routine still calls a retired Supabase operation'; end if;
 end loop;
end
$target$;
drop function public.configure_byus_queue_maintenance(text,text) restrict;
drop function public.configure_byus_worker_invocation(text,text,text) restrict;
drop function public.get_infrastructure_health() restrict;
commit;
