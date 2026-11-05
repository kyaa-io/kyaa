-- Rollback for 20261210120000_survey_submission_completion.sql.
-- Restores the legacy projection from 20260902014000 (no completion), the wrapper from 20260913090800,
-- get_owned_live_survey from 20260726022000 and the survey lookups of the `_fw_` bodies of
-- submit_owned_live_survey and get_or_create_owned_live_survey_response (without legacy_contract).
-- Stored live_survey_idempotency results rebuilt by the migration are NOT reverted; the extra
-- `completion` key is accepted by the app contract, so leaving them is harmless.
-- Rolling back reintroduces the 503 SURVEY_UNAVAILABLE after a legacy survey submission and the
-- mission-first problem (a mission of the same LIVE is read as the survey).
begin;

create or replace function public.build_owned_live_survey_submission_result_legacy_projection(p_app_user_id uuid, p_response_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('response', jsonb_build_object(
    'status', 'submitted', 'submittedAt', response.submitted_at, 'activityId', activity.id,
    'scorePoints', coalesce(score.points, 0), 'stamp', jsonb_build_object(
      'id', stamp.id, 'businessStatus', stamp.business_status, 'mintStatus', stamp.mint_status
    )
  ))
  from public.live_survey_responses response
  join public.fan_activities activity on activity.app_user_id = response.app_user_id
    and activity.celebrity_id = response.celebrity_id and activity.activity_type = 'survey'
    and activity.source_type = 'live_survey_response' and activity.source_id = response.id
  left join public.fan_score_ledger score on score.activity_id = activity.id and score.app_user_id = response.app_user_id
  join public.stamps stamp on stamp.activity_id = activity.id and stamp.passport_id = response.passport_id
    and stamp.app_user_id = response.app_user_id and stamp.celebrity_id = response.celebrity_id and stamp.stamp_type = 'survey'
  where response.id = p_response_id and response.app_user_id = p_app_user_id and response.status = 'submitted';
$$;

create or replace function public.build_owned_live_survey_submission_result(p_app_user_id uuid,p_response_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_set(item,'{response,stamp,mintStatus}',to_jsonb(public.effective_fan_action_mint(
    p_app_user_id,'stamp',(item->'response'->'stamp'->>'id')::uuid,item->'response'->'stamp'->>'mintStatus',null,null)->>'status'))
  from (select public.build_owned_live_survey_submission_result_legacy_projection(p_app_user_id,p_response_id) item) base
$$;

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
  array['select * into response_record from public.live_survey_responses where app_user_id = p_app_user_id and live_event_id = live_id and legacy_contract for update;'],
  array['select * into response_record from public.live_survey_responses where app_user_id = p_app_user_id and live_event_id = live_id for update;']);

select pg_temp.patch_survey_function('get_or_create_owned_live_survey_response',
  array['from public.live_surveys where live_event_id = live_record.id and publication_status = ''published'' and legacy_contract for key share;',
        'from public.live_survey_responses where app_user_id = p_app_user_id and live_event_id = live_record.id and legacy_contract for update;'],
  array['from public.live_surveys where live_event_id = live_record.id and publication_status = ''published'' for key share;',
        'from public.live_survey_responses where app_user_id = p_app_user_id and live_event_id = live_record.id for update;']);

select pg_temp.patch_survey_function('get_owned_live_survey',
  array[E'on survey.live_event_id = live.id\n   and survey.publication_status = \'published\'\n   and survey.legacy_contract',
        E'on response.app_user_id = p_app_user_id\n   and response.live_event_id = live.id\n   and response.legacy_contract'],
  array[E'on survey.live_event_id = live.id\n   and survey.publication_status = \'published\'',
        E'on response.app_user_id = p_app_user_id\n   and response.live_event_id = live.id']);

commit;
