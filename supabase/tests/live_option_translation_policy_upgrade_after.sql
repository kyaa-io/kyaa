-- No semantic guesses: every existing unclassified row must remain protected.
do $$ begin
  if (select count(*) from public.live_survey_options where question_id='d8800000-0000-4000-8000-000000000005') <> 2
    or exists(select 1 from public.live_survey_options where question_id='d8800000-0000-4000-8000-000000000005' and preserve_original is distinct from true) then
    raise exception 'upgrade failed to preserve existing unclassified option policies';
  end if;
  if (select label from public.live_survey_option_localizations where option_id='d8800000-0000-4000-8000-000000000006' and locale='en') is distinct from 'Dear Moon'
    or (select label from public.live_survey_option_localizations where option_id='d8800000-0000-4000-8000-000000000007' and locale='ko') is distinct from '오프닝' then
    raise exception 'upgrade changed registered option wording';
  end if;
end $$;
-- Remove the disposable draft survey graph before the replay's binding checks.
-- Keep draft content containers: hard deletion requires a lifecycle command,
-- and their automatically created reward revisions are immutable.
delete from public.live_survey_option_localizations where option_id in ('d8800000-0000-4000-8000-000000000006','d8800000-0000-4000-8000-000000000007');
delete from public.live_survey_options where question_id='d8800000-0000-4000-8000-000000000005';
delete from public.live_survey_questions where survey_id='d8800000-0000-4000-8000-000000000004';
delete from public.live_surveys where id='d8800000-0000-4000-8000-000000000004';
