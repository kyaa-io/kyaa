-- Legacy-style LIVE survey submit and GET repair.
--
-- Cause 1 (completion): 20260902014000 (lines 72-87) redefined
-- build_owned_live_survey_submission_result_legacy_projection without the
-- `completion` object. liveSurveyResponseSchema / submitLiveSurveyResponseSchema
-- require completion for every submitted state, so in this repository a legacy
-- survey submission is answered with 503 SURVEY_UNAVAILABLE after the database has
-- committed it, whatever the reward score is, and GET stays 503 afterwards.
-- This file adds completion back to the projection. When no score ledger row
-- exists (a reward setting with 0 points) it falls back to scoreDelta 0.
-- Whether any production data is affected is not asserted here.
--
-- Cause 2 (mission completed first): the survey path looked up the response and
-- the survey of a LIVE without legacy_contract. Mission responses and mission
-- surveys of the same LIVE share the tables (legacy_contract = false), so a
-- mission completed first was returned as the survey: no survey response stored,
-- no survey reward and no resubmission. The lookups of
--   submit_owned_live_survey (body in a `_fw_<oid hash>` function),
--   get_or_create_owned_live_survey_response (same wrapping, also used by drafts),
--   get_owned_live_survey, and the submission projection
-- are now restricted to legacy_contract rows. The `_fw_` suffix is derived from
-- the function oid, so it is resolved from the wrapper source at run time.
--
-- It also keeps the fan-action wrapper but applies the same effective mint status
-- to completion.earnedStamp, and rebuilds already stored legacy submit results that
-- lack completion. It does not create or change any ledger row, ticket or stamp.

create or replace function public.build_owned_live_survey_submission_result_legacy_projection(
  p_app_user_id uuid, p_response_id uuid
)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'response', jsonb_build_object(
      'status', 'submitted', 'submittedAt', response.submitted_at, 'activityId', activity.id,
      'scorePoints', coalesce(score.points, 0), 'stamp', jsonb_build_object(
        'id', stamp.id, 'businessStatus', stamp.business_status, 'mintStatus', stamp.mint_status
      )
    ),
    'completion', coalesce(
      public.build_fan_activity_completion_legacy_projection(response.app_user_id, activity.id),
      jsonb_build_object(
        'passportId', response.passport_id,
        'earnedStamp', jsonb_build_object(
          'id', stamp.id, 'type', stamp.stamp_type, 'issuedAt', stamp.issued_at,
          'businessStatus', stamp.business_status, 'mintStatus', stamp.mint_status
        ),
        'scoreDelta', 0,
        'updatedScore', total.points,
        'updatedLevel', public.get_fan_effective_tier_for_score(
          response.app_user_id, response.celebrity_id, total.points,
          (select policy_version from public.reward_policy_activation where singleton = true)
        ),
        'leveledUp', false
      )
    )
  )
  from public.live_survey_responses response
  join public.fan_activities activity on activity.app_user_id = response.app_user_id
    and activity.celebrity_id = response.celebrity_id and activity.activity_type = 'survey'
    and activity.source_type = 'live_survey_response' and activity.source_id = response.id
  left join public.fan_score_ledger score on score.activity_id = activity.id and score.app_user_id = response.app_user_id
  join public.stamps stamp on stamp.activity_id = activity.id and stamp.passport_id = response.passport_id
    and stamp.app_user_id = response.app_user_id and stamp.celebrity_id = response.celebrity_id and stamp.stamp_type = 'survey'
  cross join lateral (
    select coalesce(sum(history.points), 0)::integer as points
    from public.fan_score_ledger history
    where history.app_user_id = response.app_user_id and history.celebrity_id = response.celebrity_id
      and history.created_at <= response.submitted_at
  ) total
  where response.id = p_response_id and response.app_user_id = p_app_user_id and response.status = 'submitted'
    and response.legacy_contract;
$$;

create or replace function public.build_owned_live_survey_submission_result(p_app_user_id uuid, p_response_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_set(jsonb_set(item, '{response,stamp,mintStatus}', effective.status),
    '{completion,earnedStamp,mintStatus}', effective.status)
  from (select public.build_owned_live_survey_submission_result_legacy_projection(p_app_user_id, p_response_id) item) base
  cross join lateral (
    select to_jsonb(public.effective_fan_action_mint(
      p_app_user_id, 'stamp', (base.item->'response'->'stamp'->>'id')::uuid,
      base.item->'response'->'stamp'->>'mintStatus', null, null)->>'status') as status
  ) effective
$$;

-- Resolve the function that holds the real body: follow `public.<name>_fw_<8 hex>(` delegates
-- until none is left, patching every function on the way that contains the old text.
create function pg_temp.patch_survey_function(p_name text, p_old text[], p_new text[])
returns void language plpgsql as $patch$
declare
  v_oid oid; v_src text; v_def text; v_name text := p_name; v_next text; i integer;
  v_seen text[] := array[]::text[];
  v_done boolean[] := array_fill(false, array[cardinality(p_old)]);
  v_hits integer;
begin
  loop
    select p.oid, p.prosrc into strict v_oid, v_src
    from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_name;
    v_seen := v_seen || v_name;
    v_def := pg_catalog.pg_get_functiondef(v_oid);
    for i in 1..cardinality(p_old) loop
      -- One text can contain the other; the longer one is the more specific state.
      if length(p_new[i]) > length(p_old[i]) and position(p_new[i] in v_def) > 0 then
        v_done[i] := true;  -- already patched
      else
        v_hits := (length(v_def) - length(replace(v_def, p_old[i], ''))) / length(p_old[i]);
        if v_hits > 1 then raise exception 'survey function % holds patch text % more than once', v_name, i; end if;
        if v_hits = 1 then v_def := replace(v_def, p_old[i], p_new[i]); v_done[i] := true;
        elsif position(p_new[i] in v_def) > 0 then v_done[i] := true;
        end if;
      end if;
    end loop;
    if v_def is distinct from pg_catalog.pg_get_functiondef(v_oid) then execute v_def; end if;
    v_next := substring(v_src from 'public[.](' || v_name || '_fw_[0-9a-f]{8})[(]');
    exit when v_next is null or v_next = any(v_seen);
    v_name := v_next;
  end loop;
  for i in 1..cardinality(p_old) loop
    if not v_done[i] then raise exception 'survey function % lacks the expected text %', p_name, i; end if;
  end loop;
end $patch$;

select pg_temp.patch_survey_function('submit_owned_live_survey',
  array['select * into response_record from public.live_survey_responses where app_user_id = p_app_user_id and live_event_id = live_id for update;'],
  array['select * into response_record from public.live_survey_responses where app_user_id = p_app_user_id and live_event_id = live_id and legacy_contract for update;']);

select pg_temp.patch_survey_function('get_or_create_owned_live_survey_response',
  array['from public.live_surveys where live_event_id = live_record.id and publication_status = ''published'' for key share;',
        'from public.live_survey_responses where app_user_id = p_app_user_id and live_event_id = live_record.id for update;'],
  array['from public.live_surveys where live_event_id = live_record.id and publication_status = ''published'' and legacy_contract for key share;',
        'from public.live_survey_responses where app_user_id = p_app_user_id and live_event_id = live_record.id and legacy_contract for update;']);

select pg_temp.patch_survey_function('get_owned_live_survey',
  array[E'on survey.live_event_id = live.id\n   and survey.publication_status = \'published\'',
        E'on response.app_user_id = p_app_user_id\n   and response.live_event_id = live.id'],
  array[E'on survey.live_event_id = live.id\n   and survey.publication_status = \'published\'\n   and survey.legacy_contract',
        E'on response.app_user_id = p_app_user_id\n   and response.live_event_id = live.id\n   and response.legacy_contract']);

-- Rebuild stored legacy submit results written without completion so a same-key replay is valid.
-- Mission results (top-level `mission`), drafts and rows of mission responses are not touched.
update public.live_survey_idempotency stored
set result = rebuilt.result
from (
  select idem.idempotency_key,
    public.build_owned_live_survey_submission_result(idem.app_user_id, idem.response_id) as result
  from public.live_survey_idempotency idem
  join public.live_survey_responses response on response.id = idem.response_id and response.legacy_contract
  where idem.operation = 'submit' and idem.result ? 'response' and not (idem.result ? 'completion')
) rebuilt
where stored.idempotency_key = rebuilt.idempotency_key and rebuilt.result is not null;
