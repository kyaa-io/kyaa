\ir fan_action_producers.sql
\ir ../rollback/20261210120000_survey_submission_completion.sql

begin;

do $$
declare
  projection_def text := pg_get_functiondef('public.build_owned_live_survey_submission_result_legacy_projection(uuid,uuid)'::regprocedure);
  get_def text := pg_get_functiondef('public.get_owned_live_survey(uuid,text,public.content_locale)'::regprocedure);
  wrapper_body text;
  delegate_name text;
  delegate_def text;
begin
  if projection_def like '%''completion''%' then
    raise exception 'SURVEY_ROLLBACK_TEST: projection still carries completion after rollback';
  end if;
  if get_def like '%legacy_contract%' then
    raise exception 'SURVEY_ROLLBACK_TEST: get_owned_live_survey still filters legacy_contract after rollback';
  end if;
  select prosrc into wrapper_body from pg_proc where oid = 'public.submit_owned_live_survey(uuid,text,uuid,jsonb,uuid,text,text)'::regprocedure;
  delegate_name := substring(wrapper_body from 'public[.](submit_owned_live_survey_fw_[0-9a-f]{8})[(]');
  if delegate_name is null then
    raise exception 'SURVEY_ROLLBACK_TEST: submit delegate not found';
  end if;
  select pg_get_functiondef(p.oid) into delegate_def from pg_proc p
    where p.proname = delegate_name and p.pronamespace = 'public'::regnamespace;
  if delegate_def like '%legacy_contract%' then
    raise exception 'SURVEY_ROLLBACK_TEST: submit delegate still filters legacy_contract after rollback';
  end if;
end
$$;

rollback;

-- The rollback leaves its pg_temp helper in this session; the migration creates one with the same name.
drop function pg_temp.patch_survey_function(text, text[], text[]);

\ir ../migrations/20261210120000_survey_submission_completion.sql

begin;

do $$
declare
  projection_def text := pg_get_functiondef('public.build_owned_live_survey_submission_result_legacy_projection(uuid,uuid)'::regprocedure);
  get_def text := pg_get_functiondef('public.get_owned_live_survey(uuid,text,public.content_locale)'::regprocedure);
begin
  if projection_def not like '%''completion''%' then
    raise exception 'SURVEY_ROLLBACK_TEST: re-applied migration lacks completion';
  end if;
  if get_def not like '%legacy_contract%' then
    raise exception 'SURVEY_ROLLBACK_TEST: re-applied migration lacks legacy_contract filter';
  end if;
end
$$;

rollback;
