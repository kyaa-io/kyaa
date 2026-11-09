-- Rollback of 20261220042000_b6_profile_report.sql: the admin reader and resolver go back to their _before_b6 originals, the
-- report function and its snapshot table go. Rows already filed as 'user_profile' stay in content_reports (the web build that
-- lists them stays deployed), so the target checks keep 'user_profile' and context 'group_post'.
-- A second run stops at B6_PROFILE_REPORT_ROLLBACK_SHAPE.
begin;
set local lock_timeout = '5s';
do $restore$
declare sig regprocedure;copy regprocedure;
begin
 if to_regprocedure('public.read_admin_content_reports_before_b6(uuid,uuid,text,timestamptz,uuid,integer)') is null then raise exception 'B6_PROFILE_REPORT_ROLLBACK_SHAPE'; end if;
 foreach sig in array array['public.read_admin_content_reports(uuid,uuid,text,timestamptz,uuid,integer)',
  'public.resolve_admin_content_report_before_grant_correction(uuid,uuid,uuid,uuid,text,boolean,text,boolean)']::regprocedure[] loop
  copy:=regexp_replace(sig::text,'^(public\.)?([a-z_]+)\(','public.\2_before_b6(')::regprocedure;
  if copy=sig then raise exception 'B6_ROLLBACK_COPY_NAME: %',sig; end if;
  execute regexp_replace(pg_catalog.pg_get_functiondef(copy),'FUNCTION public\.([a-z_]+)_before_b6\(','FUNCTION public.\1(');
  execute format('drop function %s',copy);
 end loop;
end $restore$;
drop function public.report_social_profile(uuid,jsonb,text,text,uuid);
drop function public.social_profile_report_daily_limit();
drop table public.social_profile_report_snapshots;
create or replace function public.b6_owner_tables() returns table(table_name text,cmds text[]) language sql immutable set search_path='' as $$
 values('social_dm_request_log',array['select','insert']),('social_profile_return_refs',array['select','insert','delete'])
$$;
commit;
