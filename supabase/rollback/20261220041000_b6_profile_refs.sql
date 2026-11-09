-- Rollback of 20261220041000_b6_profile_refs.sql: the deletion scrub goes back to its _before_b6 original, the ref readers,
-- the return-ref issuer and the return-ref table go. Roll back 20261220042000 first (its report function reads refs).
-- A second run stops at B6_PROFILE_REFS_ROLLBACK_SHAPE.
begin;
set local lock_timeout = '5s';
do $restore$
begin
 if to_regprocedure('public.scrub_social_account_on_deletion_before_b6()') is null then raise exception 'B6_PROFILE_REFS_ROLLBACK_SHAPE'; end if;
 if to_regprocedure('public.report_social_profile(uuid,jsonb,text,text,uuid)') is not null then raise exception 'B6_PROFILE_REFS_ROLLBACK_ORDER: roll back 20261220042000 first'; end if;
 execute regexp_replace(pg_catalog.pg_get_functiondef('public.scrub_social_account_on_deletion_before_b6()'::regprocedure),
  'FUNCTION public\.scrub_social_account_on_deletion_before_b6\(','FUNCTION public.scrub_social_account_on_deletion(');
 drop function public.scrub_social_account_on_deletion_before_b6();
end $restore$;
drop function public.read_social_profile_refs_open(uuid,jsonb);
drop function public.issue_social_profile_return_ref(jsonb);
drop function public.read_social_profile_by_ref(uuid,jsonb,public.content_locale);
drop function public.social_profile_public_card(uuid,public.content_locale);
drop function public.social_profile_ref_subject(uuid,jsonb);
drop table public.social_profile_return_refs;
create or replace function public.b6_owner_tables() returns table(table_name text,cmds text[]) language sql immutable set search_path='' as $$
 values('social_dm_request_log',array['select','insert'])
$$;
commit;
